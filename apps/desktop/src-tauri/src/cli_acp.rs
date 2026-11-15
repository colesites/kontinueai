// Agent Client Protocol (ACP) client: drives agents such as Gemini CLI or
// OpenCode over stdio JSON-RPC (https://agentclientprotocol.com). One agent
// process per turn: initialize → session/new (or session/load to continue) →
// session/prompt, streaming `session/update` notifications to the frontend.
//
// We advertise no file-system or terminal capabilities, so the agent does its
// own reads, writes and commands in the project folder; permission requests
// are answered from Kode's agent mode.

use super::{
    cli_command, kill_tree, clip, resolve_binary, CliConfig, CliEvent, CliModel, CliProvider,
    CliRunRequest, CliRunResult, CliRunState, CliTaskResult, CliTodo, Parser,
};
use serde_json::{json, Value};
use std::path::Path;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::process::{Child, ChildStdin, ChildStdout};

/// ACP error code for "sign in first".
const AUTH_REQUIRED: i64 = -32000;

struct AcpError {
    code: i64,
    message: String,
}

impl AcpError {
    fn closed() -> Self {
        Self { code: 0, message: "The agent closed the connection.".to_string() }
    }

    fn into_message(self) -> String {
        if self.code == AUTH_REQUIRED {
            format!(
                "{} Sign in first: Settings → Providers → this provider → Sign in.",
                self.message.trim_end_matches('.')
            )
        } else {
            self.message
        }
    }
}

/// What to do with messages the agent sends while we wait for a reply.
trait Handler {
    fn notification(&mut self, method: &str, params: &Value);
    fn request(&mut self, method: &str, params: &Value) -> Result<Value, (i64, String)>;
}

struct Conn {
    child: Child,
    stdin: ChildStdin,
    lines: Lines<BufReader<ChildStdout>>,
    next_id: u64,
    pid: u32,
    stderr: Arc<Mutex<String>>,
}

impl Conn {
    fn spawn(
        binary: &Path,
        config: &CliConfig,
        cwd: &Path,
        on_stderr: Option<Channel<String>>,
    ) -> Result<Self, String> {
        let mut cmd = cli_command(CliProvider::Acp, binary, config);
        // The command's first word is the binary (or the Binary path override).
        let args: Vec<String> = config
            .command
            .iter()
            .skip(1)
            .chain(config.launch_args.iter())
            .cloned()
            .collect();
        cmd.args(&args)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        cmd.process_group(0);
        let mut child = cmd
            .spawn()
            .map_err(|error| format!("Could not start `{}`: {error}", binary.display()))?;
        let stdin = child.stdin.take().ok_or("The agent has no input.")?;
        let stdout = child.stdout.take().ok_or("The agent has no output.")?;
        let pid = child.id().unwrap_or(0);

        // Keep the tail of stderr for error messages; optionally stream it.
        let stderr = Arc::new(Mutex::new(String::new()));
        if let Some(err) = child.stderr.take() {
            let tail = stderr.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(err).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if let Some(channel) = &on_stderr {
                        let _ = channel.send(line.clone());
                    }
                    if let Ok(mut all) = tail.lock() {
                        all.push_str(&line);
                        all.push('\n');
                        if all.len() > 8000 {
                            let cut = all.len() - 4000;
                            let mut start = cut;
                            while !all.is_char_boundary(start) {
                                start += 1;
                            }
                            all.drain(..start);
                        }
                    }
                }
            });
        }
        Ok(Self { child, stdin, lines: BufReader::new(stdout).lines(), next_id: 0, pid, stderr })
    }

    async fn write(&mut self, message: &Value) -> Result<(), AcpError> {
        let mut line = message.to_string();
        line.push('\n');
        let io = |e: std::io::Error| AcpError { code: 0, message: format!("The agent stopped: {e}") };
        self.stdin.write_all(line.as_bytes()).await.map_err(io)?;
        self.stdin.flush().await.map_err(io)
    }

    async fn request(
        &mut self,
        method: &str,
        params: Value,
        handler: &mut (dyn Handler + Send),
    ) -> Result<Value, AcpError> {
        self.next_id += 1;
        let id = self.next_id;
        self.write(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))
            .await?;
        loop {
            let line = self
                .lines
                .next_line()
                .await
                .map_err(|e| AcpError { code: 0, message: e.to_string() })?
                .ok_or_else(AcpError::closed)?;
            let Ok(message) = serde_json::from_str::<Value>(line.trim()) else {
                continue; // agents sometimes log to stdout
            };
            let params = message.get("params").cloned().unwrap_or(Value::Null);
            match (message.get("method").and_then(Value::as_str), message.get("id")) {
                // A request from the agent: answer it, then keep waiting.
                (Some(name), Some(request_id)) => {
                    let reply = match handler.request(name, &params) {
                        Ok(result) => json!({ "jsonrpc": "2.0", "id": request_id, "result": result }),
                        Err((code, text)) => json!({
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": { "code": code, "message": text }
                        }),
                    };
                    self.write(&reply).await?;
                }
                (Some(name), None) => handler.notification(name, &params),
                (None, Some(response_id)) if response_id.as_u64() == Some(id) => {
                    if let Some(error) = message.get("error") {
                        return Err(AcpError {
                            code: error.get("code").and_then(Value::as_i64).unwrap_or(0),
                            message: error
                                .get("message")
                                .and_then(Value::as_str)
                                .unwrap_or("The agent returned an error.")
                                .to_string(),
                        });
                    }
                    return Ok(message.get("result").cloned().unwrap_or(Value::Null));
                }
                _ => {}
            }
        }
    }

    fn stderr_tail(&self) -> String {
        self.stderr.lock().map(|s| s.trim().to_string()).unwrap_or_default()
    }

    fn stop(&mut self) {
        kill_tree(self.pid);
        let _ = self.child.start_kill();
    }
}

fn initialize_params() -> Value {
    json!({
        "protocolVersion": 1,
        "clientCapabilities": {
            "fs": { "readTextFile": false, "writeTextFile": false },
            "terminal": false
        },
        "clientInfo": {
            "name": "kontinue-kode",
            "title": "Kontinue Kode",
            "version": env!("CARGO_PKG_VERSION")
        }
    })
}

/// Answers permission requests "no" and rejects everything else (probes).
struct NullHandler;

impl Handler for NullHandler {
    fn notification(&mut self, _method: &str, _params: &Value) {}
    fn request(&mut self, method: &str, _params: &Value) -> Result<Value, (i64, String)> {
        if method == "session/request_permission" {
            return Ok(json!({ "outcome": { "outcome": "cancelled" } }));
        }
        Err((-32601, format!("{method} is not supported")))
    }
}

/// Pick a permission option from Kode's agent mode.
fn permission_reply(mode: &str, params: &Value) -> (Value, bool) {
    let kind = params.pointer("/toolCall/kind").and_then(Value::as_str).unwrap_or("other");
    let read_only = matches!(kind, "read" | "search" | "think" | "fetch");
    let allow = match mode {
        "full_access" | "auto" => true,
        "auto_edits" | "design" => read_only || matches!(kind, "edit" | "delete" | "move"),
        _ => read_only,
    };
    let options = params.get("options").and_then(Value::as_array).cloned().unwrap_or_default();
    let pick = |kinds: &[&str]| {
        options.iter().find_map(|o| {
            let k = o.get("kind").and_then(Value::as_str)?;
            kinds.contains(&k).then(|| o.get("optionId").cloned()).flatten()
        })
    };
    let chosen = if allow {
        pick(&["allow_once", "allow_always"])
    } else {
        pick(&["reject_once", "reject_always"])
    };
    let reply = match chosen {
        Some(id) => json!({ "outcome": { "outcome": "selected", "optionId": id } }),
        None => json!({ "outcome": { "outcome": "cancelled" } }),
    };
    (reply, allow)
}

struct TurnHandler<'a> {
    parser: &'a mut Parser,
    channel: &'a Channel<CliEvent>,
    mode: String,
    /// While `session/load` replays history, ignore its updates.
    replaying: bool,
    denied: Vec<String>,
}

impl TurnHandler<'_> {
    fn emit(&self, events: Vec<CliEvent>) {
        for event in events {
            let _ = self.channel.send(event);
        }
    }
}

impl Handler for TurnHandler<'_> {
    fn notification(&mut self, method: &str, params: &Value) {
        if method == "session/update" && !self.replaying {
            let events = map_update(self.parser, params);
            self.emit(events);
        }
    }

    fn request(&mut self, method: &str, params: &Value) -> Result<Value, (i64, String)> {
        match method {
            "session/request_permission" => {
                let (reply, allowed) = permission_reply(&self.mode, params);
                if !allowed {
                    let title = params
                        .pointer("/toolCall/title")
                        .and_then(Value::as_str)
                        .unwrap_or("a tool")
                        .to_string();
                    self.denied.push(title);
                }
                Ok(reply)
            }
            _ => Err((-32601, format!("{method} is not supported by Kontinue Kode"))),
        }
    }
}

fn tool_output(update: &Value) -> String {
    let from_content = update
        .get("content")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| match item.get("type").and_then(Value::as_str) {
                    Some("content") => item.pointer("/content/text").and_then(Value::as_str).map(str::to_string),
                    Some("diff") => item
                        .get("path")
                        .and_then(Value::as_str)
                        .map(|path| format!("Edited {path}")),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();
    if !from_content.is_empty() {
        return from_content;
    }
    match update.get("rawOutput") {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

/// Map one `session/update` notification to Kode events.
pub(super) fn map_update(parser: &mut Parser, params: &Value) -> Vec<CliEvent> {
    let mut out = Vec::new();
    let Some(update) = params.get("update") else { return out };
    let text = update.pointer("/content/text").and_then(Value::as_str);
    match update.get("sessionUpdate").and_then(Value::as_str) {
        Some("agent_message_chunk") => {
            if let Some(text) = text {
                parser.push_text(text, &mut out);
            }
        }
        Some("agent_thought_chunk") => {
            if let Some(text) = text.filter(|t| !t.is_empty()) {
                out.push(CliEvent::Reasoning { delta: text.to_string() });
            }
        }
        Some(kind @ ("tool_call" | "tool_call_update")) => {
            let id = update.get("toolCallId").and_then(Value::as_str).unwrap_or_default().to_string();
            if kind == "tool_call" || update.get("title").is_some() {
                parser.tool_since_text = true;
                let mut input = update
                    .get("rawInput")
                    .cloned()
                    .filter(Value::is_object)
                    .unwrap_or_else(|| json!({}));
                input["title"] = update.get("title").cloned().unwrap_or(Value::Null);
                input["kind"] = update.get("kind").cloned().unwrap_or(Value::Null);
                out.push(CliEvent::ToolStart { id: id.clone(), name: "acp".to_string(), input });
            }
            match update.get("status").and_then(Value::as_str) {
                Some(status @ ("completed" | "failed")) => out.push(CliEvent::ToolEnd {
                    id,
                    output: clip(&tool_output(update)),
                    is_error: status == "failed",
                }),
                _ => {}
            }
        }
        // { used, size }: tokens in context and the window size.
        Some("usage_update") => {
            let used = update.get("used").and_then(Value::as_u64);
            let window = update.get("size").and_then(Value::as_u64);
            if used.is_some() || window.is_some() {
                out.push(CliEvent::Usage { used, window });
            }
        }
        Some("plan") => {
            let items = update
                .get("entries")
                .and_then(Value::as_array)
                .map(|entries| {
                    entries
                        .iter()
                        .map(|entry| CliTodo {
                            title: entry.get("content").and_then(Value::as_str).unwrap_or("").to_string(),
                            status: entry
                                .get("status")
                                .and_then(Value::as_str)
                                .unwrap_or("pending")
                                .to_string(),
                        })
                        .collect()
                })
                .unwrap_or_default();
            out.push(CliEvent::Todos { items });
        }
        _ => {}
    }
    out
}

/// Models offered by a session setup result: the `models` field, or a
/// config option in the "model" category.
fn models_from(setup: &Value) -> Vec<CliModel> {
    if let Some(list) = setup.pointer("/models/availableModels").and_then(Value::as_array) {
        return list
            .iter()
            .filter_map(|m| {
                let id = m.get("modelId").and_then(Value::as_str)?;
                let name = m.get("name").and_then(Value::as_str).unwrap_or(id);
                Some(CliModel { id: id.to_string(), name: name.to_string() })
            })
            .collect();
    }
    let Some(option) = model_option(setup) else { return Vec::new() };
    let mut models = Vec::new();
    collect_options(option.get("options").unwrap_or(&Value::Null), &mut models);
    models
}

fn model_option(setup: &Value) -> Option<&Value> {
    setup.get("configOptions")?.as_array()?.iter().find(|o| {
        o.get("category").and_then(Value::as_str) == Some("model")
            || o.get("id").and_then(Value::as_str) == Some("model")
    })
}

fn collect_options(options: &Value, out: &mut Vec<CliModel>) {
    for option in options.as_array().into_iter().flatten() {
        if let Some(nested) = option.get("options") {
            collect_options(nested, out); // grouped options
        } else if let Some(value) = option.get("value").and_then(Value::as_str) {
            let name = option.get("name").and_then(Value::as_str).unwrap_or(value);
            out.push(CliModel { id: value.to_string(), name: name.to_string() });
        }
    }
}

async fn select_model(
    conn: &mut Conn,
    handler: &mut (dyn Handler + Send),
    session_id: &str,
    setup: &Value,
    model: &str,
) -> Result<(), AcpError> {
    if setup.get("models").is_some() {
        conn.request("session/set_model", json!({ "sessionId": session_id, "modelId": model }), handler)
            .await?;
    } else if let Some(id) = model_option(setup).and_then(|o| o.get("id")).and_then(Value::as_str) {
        let params = json!({ "sessionId": session_id, "configId": id, "value": model });
        conn.request("session/set_config_option", params, handler).await?;
    }
    Ok(())
}

/// Run one turn with an ACP agent.
pub(super) async fn run(
    state: &CliRunState,
    run_id: u32,
    binary: &Path,
    req: &CliRunRequest,
    on_event: Channel<CliEvent>,
) -> Result<CliRunResult, String> {
    let root = Path::new(&req.root);
    let mut conn = Conn::spawn(binary, &req.config, root, None)?;
    state.runs.lock().map_err(|_| "Run state unavailable")?.insert(run_id, conn.pid);
    if state.stopped.lock().map(|set| set.contains(&run_id)).unwrap_or(false) {
        conn.stop();
    }

    let mut parser = Parser::new(CliProvider::Acp, req.session_id.clone());
    let mut notices = Vec::new();
    let mut handler = TurnHandler {
        parser: &mut parser,
        channel: &on_event,
        mode: req.mode.clone(),
        replaying: false,
        denied: Vec::new(),
    };

    let outcome: Result<(), AcpError> = async {
        let init = conn.request("initialize", initialize_params(), &mut handler).await?;
        let can_load = init.pointer("/agentCapabilities/loadSession").and_then(Value::as_bool).unwrap_or(false);
        let cwd = root.to_string_lossy().to_string();

        let mut session: Option<(String, Value)> = None;
        if let Some(previous) = req.session_id.as_deref().filter(|id| !id.is_empty()) {
            if can_load {
                handler.replaying = true;
                let params = json!({ "sessionId": previous, "cwd": cwd, "mcpServers": super::acp_mcp_servers(req) });
                match conn.request("session/load", params, &mut handler).await {
                    Ok(setup) => session = Some((previous.to_string(), setup)),
                    Err(error) if error.code == AUTH_REQUIRED => return Err(error),
                    Err(_) => notices.push("Could not continue the earlier agent session, so this turn started a new one.".to_string()),
                }
                handler.replaying = false;
            } else {
                notices.push("This agent cannot continue earlier sessions, so this turn started a new one.".to_string());
            }
        }
        let (session_id, setup) = match session {
            Some(found) => found,
            None => {
                let setup = conn
                    .request("session/new", json!({ "cwd": cwd, "mcpServers": super::acp_mcp_servers(req) }), &mut handler)
                    .await?;
                let id = setup.get("sessionId").and_then(Value::as_str).unwrap_or_default().to_string();
                (id, setup)
            }
        };
        let mut events = Vec::new();
        handler.parser.set_session(Some(&session_id), None, &mut events);
        handler.emit(events);

        if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
            if let Err(error) = select_model(&mut conn, &mut handler, &session_id, &setup, model).await {
                notices.push(format!("Could not switch to {model}: {}", error.message));
            }
        }

        let params = json!({
            "sessionId": session_id,
            "prompt": [{ "type": "text", "text": req.prompt }]
        });
        let result = conn.request("session/prompt", params, &mut handler).await?;
        match result.get("stopReason").and_then(Value::as_str) {
            Some("refusal") => notices.push("The agent declined this request.".to_string()),
            Some("max_tokens") => notices.push("The agent stopped at its output limit.".to_string()),
            Some("max_turn_requests") => notices.push("The agent stopped at its step limit.".to_string()),
            _ => {}
        }
        Ok(())
    }
    .await;

    if !handler.denied.is_empty() {
        let mut denied = std::mem::take(&mut handler.denied);
        denied.dedup();
        notices.push(format!(
            "Not allowed in this mode: {}. Switch Kode to a mode with more access to let the agent do this.",
            denied.join(", ")
        ));
    }
    for message in notices {
        let _ = on_event.send(CliEvent::Notice { message });
    }

    let stderr = conn.stderr_tail();
    conn.stop();
    if let Ok(mut runs) = state.runs.lock() {
        runs.remove(&run_id);
    }
    let stopped = state.stopped.lock().map(|mut set| set.remove(&run_id)).unwrap_or(false);

    let error = match outcome {
        Ok(()) => None,
        Err(_) if stopped => None,
        Err(error) => {
            let message = error.into_message();
            Some(if stderr.is_empty() || message.contains(&stderr) {
                message
            } else {
                let tail: String = stderr.lines().rev().take(6).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
                format!("{message}\n{tail}")
            })
        }
    };
    Ok(CliRunResult {
        session_id: parser.session_id,
        text: parser.text,
        stopped,
        error,
        limit_resets_at: parser.limit_resets_at,
    })
}

/// List the agent's models by opening a throwaway session (no prompt is sent).
pub(super) async fn probe_models(config: &CliConfig) -> Result<Vec<CliModel>, String> {
    let binary = resolve_binary(CliProvider::Acp, config).ok_or("Set the command that starts this agent.")?;
    let dir = std::env::temp_dir().join("kontinue-acp-probe");
    let _ = std::fs::create_dir_all(&dir);
    let mut conn = Conn::spawn(&binary, config, &dir, None)?;
    let mut handler = NullHandler;
    let cwd = dir.to_string_lossy().to_string();
    let result = tokio::time::timeout(std::time::Duration::from_secs(45), async {
        conn.request("initialize", initialize_params(), &mut handler).await?;
        conn.request("session/new", json!({ "cwd": cwd, "mcpServers": [] }), &mut handler).await
    })
    .await;
    conn.stop();
    match result {
        Ok(Ok(setup)) => Ok(models_from(&setup)),
        Ok(Err(error)) => Err(error.into_message()),
        Err(_) => Err(
            "The agent didn't answer within 45 seconds, so its models couldn't load. Press Update to get its newest version. If it still doesn't answer, the agent itself isn't starting on this computer.".to_string(),
        ),
    }
}

/// Sign in with the agent's own `authenticate` method (it opens the browser).
pub(super) async fn authenticate(
    state: &CliRunState,
    run_id: u32,
    binary: &Path,
    config: &CliConfig,
    on_line: Channel<String>,
) -> Result<CliTaskResult, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let mut conn = Conn::spawn(binary, config, Path::new(&home), Some(on_line.clone()))?;
    state.runs.lock().map_err(|_| "Run state unavailable")?.insert(run_id, conn.pid);
    let mut handler = NullHandler;

    let result = tokio::time::timeout(std::time::Duration::from_secs(600), async {
        let init = conn.request("initialize", initialize_params(), &mut handler).await?;
        let methods = init.get("authMethods").and_then(Value::as_array).cloned().unwrap_or_default();
        if methods.is_empty() {
            let _ = on_line.send("This agent does not need a separate sign-in.".to_string());
            return Ok(());
        }
        let wanted = config.auth_method.trim();
        let method = methods
            .iter()
            .find(|m| m.get("id").and_then(Value::as_str) == Some(wanted))
            .unwrap_or(&methods[0]);
        let id = method.get("id").and_then(Value::as_str).unwrap_or_default();
        let name = method.get("name").and_then(Value::as_str).unwrap_or(id);
        let _ = on_line.send(format!("Signing in with {name}. Finish in your browser if it opens."));
        conn.request("authenticate", json!({ "methodId": id }), &mut handler).await?;
        let _ = on_line.send("Signed in.".to_string());
        Ok::<(), AcpError>(())
    })
    .await;

    conn.stop();
    if let Ok(mut runs) = state.runs.lock() {
        runs.remove(&run_id);
    }
    let stopped = state.stopped.lock().map(|mut set| set.remove(&run_id)).unwrap_or(false);
    let (success, output) = match result {
        Ok(Ok(())) => (true, String::new()),
        Ok(Err(error)) => (false, error.into_message()),
        Err(_) => (false, "Timed out waiting for sign-in.".to_string()),
    };
    if !output.is_empty() {
        let _ = on_line.send(output.clone());
    }
    Ok(CliTaskResult { success: success && !stopped, stopped, output })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_updates_and_permissions() {
        let mut parser = Parser::new(CliProvider::Acp, None);
        let mut all = Vec::new();
        for update in [
            json!({"update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Hi"}}}),
            json!({"update":{"sessionUpdate":"tool_call","toolCallId":"t1","title":"Run ls","kind":"execute","status":"pending"}}),
            json!({"update":{"sessionUpdate":"tool_call_update","toolCallId":"t1","status":"completed","content":[{"type":"content","content":{"type":"text","text":"a.txt"}}]}}),
            json!({"update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Done"}}}),
            json!({"update":{"sessionUpdate":"plan","entries":[{"content":"Step","priority":"high","status":"pending"}]}}),
        ] {
            all.extend(map_update(&mut parser, &update));
        }
        assert_eq!(parser.text, "Hi\n\nDone");
        assert!(all.iter().any(|e| matches!(e, CliEvent::ToolEnd { output, is_error: false, .. } if output == "a.txt")));
        assert!(all.iter().any(|e| matches!(e, CliEvent::Todos { items } if items.len() == 1)));

        let params = json!({
            "toolCall": {"kind": "execute"},
            "options": [
                {"optionId": "yes", "kind": "allow_once", "name": "Allow"},
                {"optionId": "no", "kind": "reject_once", "name": "Reject"}
            ]
        });
        assert_eq!(permission_reply("full_access", &params).0["outcome"]["optionId"], "yes");
        assert_eq!(permission_reply("supervised", &params).0["outcome"]["optionId"], "no");
        assert_eq!(permission_reply("auto_edits", &params).0["outcome"]["optionId"], "no");

        let setup = json!({"configOptions":[{"id":"model","category":"model","options":[{"group":"A","options":[{"value":"m1","name":"Model 1"}]}]}]});
        assert_eq!(models_from(&setup)[0].id, "m1");
    }
}
