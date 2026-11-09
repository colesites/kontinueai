// Kode's own MCP server, for other agents (Claude Code, Codex, Cursor…).
//
// Run as `<Kontinue binary> --kode-mcp` over stdio. It never talks to the
// network; it works through files in ~/.kontinue/kode:
// - state.json   written by the app: projects and threads (chats) with previews
// - inbox.jsonl  written here: requests the app carries out (start a thread,
//                message a thread, hand off context)
// - events.jsonl checkpoints, which make the app sync the imported session now
//
// Tools: checkpoint_kontinue_session, list_projects, list_threads,
// search_threads, start_thread, message_thread, handoff_context.

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

#[tauri::command]
pub fn kode_orch_write_state(state: Value) -> Result<(), String> {
    let dir = kode_dir().ok_or("No home folder.")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("state.json.tmp");
    std::fs::write(&tmp, serde_json::to_vec(&state).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join("state.json")).map_err(|e| e.to_string())
}

/// Read and clear queued requests.
#[tauri::command]
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

/// The command other agents use to start this server.
#[tauri::command]
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
        assert!(handle(&json!({ "method": "notifications/initialized" })).is_none());
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
