// Kode's own MCP server, for other agents (Claude Code, Codex, Cursor…).
//
// Run as `<Kontinue binary> --kode-mcp` over stdio. It never talks to the
// network; it works through files in ~/.kontinue/kode:
// - state.json   written by the app: projects and threads (chats) with previews
// - inbox.jsonl  written here: requests the app carries out (start a thread,
//                message a thread, hand off context)
// - events.jsonl checkpoints, which make the app sync the imported session now
//
// - results/<id>.json written by the app: progress and results of sub-agents
//                a run_subagents request started
//
// Tools: checkpoint_kontinue_session, list_projects, list_threads,
// search_threads, start_thread, message_thread, handoff_context, list_models,
// run_subagents, wait_for_subagents.
//
// Sub-agents: Kode attaches this server to the main agent's turn with
// KODE_PARENT_CHAT_ID (and KODE_PROJECT_ROOT) set, so the group shows under
// that chat. Sub-agents' own turns don't get it, so they can't start more.

use crate::kode_hooks::{append_event, kode_dir};
use serde_json::{json, Value};
use std::io::{BufRead, Write};

const PROTOCOL_VERSION: &str = "2025-06-18";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn tool(name: &str, description: &str, properties: Value, required: &[&str]) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": { "type": "object", "properties": properties, "required": required },
    })
}

pub(crate) fn tool_list() -> Value {
    let s = |d: &str| json!({ "type": "string", "description": d });
    json!([
        tool(
            "checkpoint_kontinue_session",
            "Save a checkpoint of this coding session to Kontinue so the imported chat syncs now. Call it after finishing a step, before compacting, or before you stop.",
            json!({
                "session_id": s("This session's id, if you know it."),
                "transcript_path": s("Path to this session's transcript file, if you know it."),
                "cwd": s("Working directory of the session. Defaults to the server's folder."),
                "note": s("One line on what was just done or decided."),
            }),
            &[],
        ),
        tool("list_projects", "List the projects (folders) open in Kontinue.", json!({}), &[]),
        tool(
            "list_threads",
            "List Kontinue threads (chats), newest first, optionally for one project.",
            json!({ "project": s("Project name or folder path."), "limit": { "type": "number" } }),
            &[],
        ),
        tool(
            "search_threads",
            "Search Kontinue threads by title and recent content.",
            json!({ "query": s("Words to look for."), "limit": { "type": "number" } }),
            &["query"],
        ),
        tool(
            "start_thread",
            "Start a new Kontinue thread in a project (any repo, not just this one) with a first prompt. Kontinue runs it.",
            json!({ "project_path": s("Folder of the project."), "prompt": s("The first message."), "title": s("Optional title.") }),
            &["project_path", "prompt"],
        ),
        tool(
            "message_thread",
            "Send a message to an existing Kontinue thread.",
            json!({ "thread_id": s("Thread id from list_threads."), "message": s("The message.") }),
            &["thread_id", "message"],
        ),
        tool(
            "list_models",
            "List the models Kontinue can run as sub-agents (Kode models and the user's own agents such as Claude Code, Codex, Cursor and OpenCode).",
            json!({}),
            &[],
        ),
        tool(
            "run_subagents",
            "Send one task to several models at once. Each works in its own git branch and worktree with its own Kontinue chat, and the user sees them live. Use it when the user asks for sub-agents, several models, or to compare models. Each sub-agent starts fresh, so write a complete, self-contained task. Returns within about 45 seconds: the results if they finished, or an id to pass to wait_for_subagents.",
            json!({
                "task": s("The full task each sub-agent should do."),
                "models": { "type": "array", "items": { "type": "string" }, "description": "Model names or ids from list_models, as many as the user asked for." },
                "mode": { "type": "string", "enum": ["auto_edits", "full_access", "plan"], "description": "auto_edits (default): edits applied, risky commands skipped. full_access: commands run too. plan: read-only." },
                "project_path": s("Folder to work in. Defaults to this session's project."),
            }),
            &["task", "models"],
        ),
        tool(
            "wait_for_subagents",
            "Wait for sub-agents started by run_subagents and get their status, or their results once they finish. Call again while they are still running.",
            json!({ "id": s("The id run_subagents returned."), "wait_seconds": { "type": "number", "description": "How long to wait, up to 45 (default)." } }),
            &["id"],
        ),
        tool(
            "handoff_context",
            "Hand the current work to a new Kontinue thread: a summary, the next step and the files involved.",
            json!({
                "project_path": s("Folder of the project."),
                "summary": s("What was done and decided so far."),
                "next_step": s("What the new thread should do next."),
                "files": { "type": "array", "items": { "type": "string" } },
            }),
            &["project_path", "summary"],
        ),
    ])
}

fn read_state() -> Value {
    kode_dir()
        .and_then(|dir| std::fs::read_to_string(dir.join("state.json")).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| json!({ "projects": [], "threads": [] }))
}

fn queue(request: Value) -> Result<String, String> {
    let dir = kode_dir().ok_or("No home folder.")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let id = format!("req-{}-{}", now_ms(), rand::random::<u32>());
    let mut request = request;
    request["id"] = json!(id);
    request["at"] = json!(now_ms());
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("inbox.jsonl"))
        .map_err(|e| e.to_string())?;
    writeln!(file, "{request}").map_err(|e| e.to_string())?;
    Ok(id)
}

fn arg<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(Value::as_str).filter(|s| !s.trim().is_empty())
}

fn limit(args: &Value, default: usize) -> usize {
    args.get("limit").and_then(Value::as_u64).map(|n| n as usize).unwrap_or(default).clamp(1, 200)
}

fn matches_project(thread: &Value, project: &str) -> bool {
    let p = project.to_lowercase();
    ["projectPath", "projectName"].iter().any(|key| {
        thread.get(*key).and_then(Value::as_str).map(|v| v.to_lowercase() == p || v.to_lowercase().ends_with(&format!("/{p}"))).unwrap_or(false)
    })
}

/// Run one tool against a state snapshot. Pure apart from `queue`/events.
pub(crate) fn call_tool(name: &str, args: &Value, state: &Value) -> Result<String, String> {
    let threads = state.get("threads").and_then(Value::as_array).cloned().unwrap_or_default();
    match name {
        "checkpoint_kontinue_session" => {
            let cwd = arg(args, "cwd")
                .map(str::to_string)
                .or_else(|| std::env::current_dir().ok().map(|p| p.to_string_lossy().to_string()));
            append_event(&json!({
                "event": "checkpoint",
                "at": now_ms(),
                "sessionId": arg(args, "session_id"),
                "transcriptPath": arg(args, "transcript_path"),
                "cwd": cwd,
                "note": arg(args, "note"),
            }))?;
            Ok("Checkpoint saved. Kontinue will sync this session's imported chat.".into())
        }
        "list_projects" => Ok(serde_json::to_string_pretty(state.get("projects").unwrap_or(&json!([]))).unwrap_or_default()),
        "list_threads" => {
            let mut list: Vec<Value> = threads
                .into_iter()
                .filter(|t| arg(args, "project").map(|p| matches_project(t, p)).unwrap_or(true))
                .collect();
            list.truncate(limit(args, 30));
            Ok(serde_json::to_string_pretty(&list).unwrap_or_default())
        }
        "search_threads" => {
            let query = arg(args, "query").ok_or("query is required")?.to_lowercase();
            let words: Vec<&str> = query.split_whitespace().collect();
            let mut scored: Vec<(usize, Value)> = threads
                .into_iter()
                .filter_map(|t| {
                    let hay = format!(
                        "{} {} {}",
                        t.get("title").and_then(Value::as_str).unwrap_or(""),
                        t.get("preview").and_then(Value::as_str).unwrap_or(""),
                        t.get("projectName").and_then(Value::as_str).unwrap_or("")
                    )
                    .to_lowercase();
                    let score = words.iter().filter(|w| hay.contains(*w)).count();
                    (score > 0).then_some((score, t))
                })
                .collect();
            scored.sort_by(|a, b| b.0.cmp(&a.0));
            let list: Vec<Value> = scored.into_iter().take(limit(args, 20)).map(|(_, t)| t).collect();
            Ok(serde_json::to_string_pretty(&list).unwrap_or_default())
        }
        "start_thread" => {
            let project = arg(args, "project_path").ok_or("project_path is required")?;
            let prompt = arg(args, "prompt").ok_or("prompt is required")?;
            let id = queue(json!({ "type": "start_thread", "projectPath": project, "prompt": prompt, "title": arg(args, "title") }))?;
            Ok(format!("Queued ({id}). Kontinue will open a new thread in {project} and send the prompt."))
        }
        "message_thread" => {
            let thread = arg(args, "thread_id").ok_or("thread_id is required")?;
            let message = arg(args, "message").ok_or("message is required")?;
            if !threads.iter().any(|t| t.get("id").and_then(Value::as_str) == Some(thread)) {
                return Err(format!("No thread {thread}. Use list_threads to find one."));
            }
            let id = queue(json!({ "type": "message_thread", "threadId": thread, "message": message }))?;
            Ok(format!("Queued ({id}). Kontinue will send it to the thread."))
        }
        "list_models" => {
            let models = state.get("models").cloned().unwrap_or_else(|| json!([]));
            if models.as_array().map_or(true, Vec::is_empty) {
                return Err("Kontinue hasn't published its models yet. Open Kontinue and try again.".into());
            }
            Ok(serde_json::to_string_pretty(&models).unwrap_or_default())
        }
        "run_subagents" => {
            let parent = std::env::var("KODE_PARENT_CHAT_ID").ok().filter(|v| !v.is_empty()).ok_or(
                "Only the main agent of a Kontinue chat can start sub-agents (this session isn't one, or is a sub-agent itself).",
            )?;
            let task = arg(args, "task").ok_or("task is required")?;
            let models: Vec<String> = args
                .get("models")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect())
                .unwrap_or_default();
            if models.is_empty() {
                return Err("models is required: pick some from list_models.".into());
            }
            let project = arg(args, "project_path")
                .map(str::to_string)
                .or_else(|| std::env::var("KODE_PROJECT_ROOT").ok())
                .ok_or("project_path is required")?;
            let id = queue(json!({
                "type": "run_subagents",
                "parentChatId": parent,
                "projectPath": project,
                "task": task,
                "models": models,
                "mode": arg(args, "mode"),
            }))?;
            Ok(wait_for_result(&id, MAX_WAIT_SECS))
        }
        "wait_for_subagents" => {
            let id = arg(args, "id").ok_or("id is required")?;
            if !id.starts_with("req-") || id.contains(['/', '\\', '.']) {
                return Err(format!("{id} isn't a sub-agent id from run_subagents."));
            }
            let secs = args.get("wait_seconds").and_then(Value::as_u64).unwrap_or(MAX_WAIT_SECS).min(MAX_WAIT_SECS);
            Ok(wait_for_result(id, secs))
        }
        "handoff_context" => {
            let project = arg(args, "project_path").ok_or("project_path is required")?;
            let summary = arg(args, "summary").ok_or("summary is required")?;
            let files: Vec<String> = args
                .get("files")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect())
                .unwrap_or_default();
            let id = queue(json!({ "type": "handoff", "projectPath": project, "summary": summary, "nextStep": arg(args, "next_step"), "files": files }))?;
            Ok(format!("Queued ({id}). Kontinue will start a thread with this hand-off."))
        }
        other => Err(format!("Unknown tool: {other}")),
    }
}

/// Longest a tool call blocks: some agents give up on tools after a minute.
const MAX_WAIT_SECS: u64 = 45;

/// Wait (up to `secs`) for the app to report on a sub-agent request, then
/// describe it: the final report once done, else progress and the id.
fn wait_for_result(id: &str, secs: u64) -> String {
    let Some(path) = kode_dir().map(|dir| dir.join("results").join(format!("{id}.json"))) else {
        return "No home folder.".into();
    };
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(secs);
    let mut last: Option<Value> = None;
    loop {
        if let Some(result) = std::fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()) {
            if result.get("done").and_then(Value::as_bool) == Some(true) {
                return result.get("report").and_then(Value::as_str).unwrap_or("Sub-agents finished.").to_string();
            }
            last = Some(result);
        }
        if std::time::Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(1000));
    }
    match last {
        None => format!(
            "Queued ({id}), but Kontinue hasn't picked it up yet. Is the app open? Call wait_for_subagents with this id to check again."
        ),
        Some(progress) => {
            let lines: Vec<String> = progress
                .get("runs")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .map(|run| {
                    let field = |key: &str| run.get(key).and_then(Value::as_str).unwrap_or("");
                    format!("- {}: {}", field("model"), field("status"))
                })
                .collect();
            format!(
                "Sub-agents still working ({id}):\n{}\nCall wait_for_subagents with this id to keep waiting.",
                lines.join("\n")
            )
        }
    }
}

/// Handle one JSON-RPC message; None for notifications.
pub(crate) fn handle(message: &Value) -> Option<Value> {
    let id = message.get("id").cloned()?;
    let method = message.get("method").and_then(Value::as_str).unwrap_or("");
    let result = match method {
        "initialize" => json!({
            "protocolVersion": message.pointer("/params/protocolVersion").and_then(Value::as_str).unwrap_or(PROTOCOL_VERSION),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "kontinue", "version": env!("CARGO_PKG_VERSION") },
        }),
        "ping" => json!({}),
        "tools/list" => json!({ "tools": tool_list() }),
        "tools/call" => {
            let name = message.pointer("/params/name").and_then(Value::as_str).unwrap_or("");
            let args = message.pointer("/params/arguments").cloned().unwrap_or(json!({}));
            let state = read_state();
            match call_tool(name, &args, &state) {
                Ok(text) => json!({ "content": [{ "type": "text", "text": text }] }),
                Err(text) => json!({ "content": [{ "type": "text", "text": text }], "isError": true }),
            }
        }
        _ => {
            return Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": format!("Unknown method {method}") } }));
        }
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

/// Blocking stdio loop (newline-delimited JSON-RPC).
pub fn run_stdio() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines().map_while(Result::ok) {
        let Ok(message) = serde_json::from_str::<Value>(line.trim()) else { continue };
        if let Some(reply) = handle(&message) {
            let _ = writeln!(stdout, "{reply}");
            let _ = stdout.flush();
        }
    }
}

// ---------------------------------------------------------------------------
// App side: publish state, take inbox requests, show how to connect.
// ---------------------------------------------------------------------------

#[tauri::command(async)]
pub fn kode_orch_write_state(state: Value) -> Result<(), String> {
    let dir = kode_dir().ok_or("No home folder.")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("state.json.tmp");
    std::fs::write(&tmp, serde_json::to_vec(&state).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join("state.json")).map_err(|e| e.to_string())
}

/// Read and clear queued requests.
#[tauri::command(async)]
pub fn kode_orch_take_inbox() -> Vec<Value> {
    let Some(dir) = kode_dir() else { return Vec::new() };
    let path = dir.join("inbox.jsonl");
    let taking = dir.join("inbox.taking");
    if std::fs::rename(&path, &taking).is_err() {
        return Vec::new();
    }
    let text = std::fs::read_to_string(&taking).unwrap_or_default();
    let _ = std::fs::remove_file(&taking);
    text.lines().filter_map(|l| serde_json::from_str(l).ok()).collect()
}

/// Progress or the final report of a run_subagents request, for the waiting
/// MCP server (see wait_for_result).
#[tauri::command(async)]
pub fn kode_orch_write_result(id: String, result: Value) -> Result<(), String> {
    if !id.starts_with("req-") || id.contains(['/', '\\', '.']) {
        return Err(format!("`{id}` is not a request id."));
    }
    let dir = kode_dir().ok_or("No home folder.")?.join("results");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{id}.tmp"));
    std::fs::write(&tmp, serde_json::to_vec(&result).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join(format!("{id}.json"))).map_err(|e| e.to_string())
}

/// The command other agents use to start this server.
#[tauri::command(async)]
pub fn kode_mcp_server_command() -> Result<Value, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(json!({ "command": exe.to_string_lossy(), "args": ["--kode-mcp"] }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> Value {
        json!({
            "projects": [{ "name": "web", "path": "/repo/web" }],
            "threads": [
                { "id": "t1", "title": "Fix login redirect", "projectPath": "/repo/web", "projectName": "web", "preview": "clerk" },
                { "id": "t2", "title": "Billing page", "projectPath": "/repo/api", "projectName": "api", "preview": "stripe webhooks" }
            ]
        })
    }

    #[test]
    fn answers_initialize_and_lists_tools() {
        let init = handle(&json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-03-26" } })).unwrap();
        assert_eq!(init["result"]["protocolVersion"], "2025-03-26");
        let tools = handle(&json!({ "id": 2, "method": "tools/list" })).unwrap();
        let names: Vec<&str> = tools["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"checkpoint_kontinue_session"));
        assert!(names.contains(&"start_thread"));
        assert!(names.contains(&"run_subagents"));
        assert!(handle(&json!({ "method": "notifications/initialized" })).is_none());
    }

    #[test]
    fn lists_published_models() {
        let state = json!({ "models": [{ "id": "cli:codex:gpt", "name": "GPT (Codex)" }] });
        assert!(call_tool("list_models", &json!({}), &state).unwrap().contains("GPT (Codex)"));
        assert!(call_tool("list_models", &json!({}), &json!({})).is_err());
    }

    #[test]
    fn subagents_need_a_main_chat_and_a_real_id() {
        // Sub-agents' own sessions run without KODE_PARENT_CHAT_ID.
        if std::env::var("KODE_PARENT_CHAT_ID").is_err() {
            let error = call_tool("run_subagents", &json!({ "task": "t", "models": ["a"] }), &json!({})).unwrap_err();
            assert!(error.contains("main agent"));
        }
        assert!(call_tool("wait_for_subagents", &json!({ "id": "../../etc/passwd" }), &json!({})).is_err());
    }

    #[test]
    fn lists_and_searches_threads() {
        let list = call_tool("list_threads", &json!({ "project": "web" }), &state()).unwrap();
        assert!(list.contains("t1") && !list.contains("t2"));
        let found = call_tool("search_threads", &json!({ "query": "stripe" }), &state()).unwrap();
        assert!(found.contains("t2") && !found.contains("t1"));
        assert!(call_tool("message_thread", &json!({ "thread_id": "nope", "message": "hi" }), &state()).is_err());
        assert!(call_tool("start_thread", &json!({ "prompt": "x" }), &state()).is_err());
    }
}
