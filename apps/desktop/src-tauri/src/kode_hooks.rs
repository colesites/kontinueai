// Keeping imported sessions in sync from the agents' side.
//
// - Claude Code hooks (SessionStart, Stop, PreCompact, SessionEnd) append one
//   line per event to ~/.kontinue/kode/events.jsonl. The hook is a plain shell
//   command, so it keeps working when the app moves or updates.
// - Codex's `notify` setting does the same after each Codex turn.
// - The Kode MCP server's `checkpoint_kontinue_session` tool writes there too.
// The app polls the file and syncs the matching imported chats right away.
//
// Also: listing Codex threads through `codex app-server` (thread/list), which
// knows titles, models and threads outside the default sessions folder.

use serde::Serialize;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const HOOK_MARKER: &str = "kontinue-kode-hook";
const CLAUDE_EVENTS: &[&str] = &["SessionStart", "Stop", "PreCompact", "SessionEnd"];

pub(crate) fn kode_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|home| PathBuf::from(home).join(".kontinue").join("kode"))
}

pub(crate) fn events_path() -> Option<PathBuf> {
    kode_dir().map(|dir| dir.join("events.jsonl"))
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Append one event line (used by the MCP checkpoint tool).
pub(crate) fn append_event(event: &Value) -> Result<(), String> {
    let path = events_path().ok_or("No home folder.")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{event}").map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImportEvent {
    event: String,
    session_id: Option<String>,
    transcript_path: Option<String>,
    cwd: Option<String>,
    at: i64,
}

fn str_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// One events.jsonl line → a normalized event.
pub(crate) fn parse_event_line(line: &str) -> Option<ImportEvent> {
    let value: Value = serde_json::from_str(line.trim()).ok()?;
    let at = value.get("at").and_then(Value::as_i64).unwrap_or(0);
    if let Some(hook) = value.get("hook") {
        return Some(ImportEvent {
            event: str_field(hook, &["hook_event_name"]).unwrap_or_else(|| "hook".into()),
            session_id: str_field(hook, &["session_id"]),
            transcript_path: str_field(hook, &["transcript_path"]),
            cwd: str_field(hook, &["cwd"]),
            at,
        });
    }
    if let Some(codex) = value.get("codex") {
        return Some(ImportEvent {
            event: str_field(codex, &["type"]).unwrap_or_else(|| "codex".into()),
            session_id: str_field(codex, &["thread-id", "thread_id", "session_id"]),
            transcript_path: None,
            cwd: str_field(codex, &["cwd"]),
            at,
        });
    }
    Some(ImportEvent {
        event: str_field(&value, &["event"]).unwrap_or_else(|| "event".into()),
        session_id: str_field(&value, &["sessionId", "session_id"]),
        transcript_path: str_field(&value, &["transcriptPath", "transcript_path"]),
        cwd: str_field(&value, &["cwd"]),
        at,
    })
}

pub(crate) fn read_events(path: &Path, since: i64) -> Vec<ImportEvent> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    // Keep the file small: once it passes 1 MB, keep only the newest half.
    if text.len() > 1_000_000 {
        let keep = &text[text.len() / 2..];
        let keep = keep.find('\n').map(|i| &keep[i + 1..]).unwrap_or(keep);
        let _ = std::fs::write(path, keep);
    }
    text.lines()
        .filter_map(parse_event_line)
        .filter(|event| event.at >= since)
        .collect()
}

#[tauri::command(async)]
pub fn kode_import_events(since: i64) -> Vec<ImportEvent> {
    events_path().map(|p| read_events(&p, since)).unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Claude Code hooks in ~/.claude/settings.json
// ---------------------------------------------------------------------------

/// The shell command each hook runs: wrap stdin's JSON with a timestamp.
pub(crate) fn hook_command(events: &Path) -> String {
    let file = events.to_string_lossy().replace('\'', "'\\''");
    format!(
        "mkdir -p \"$(dirname '{file}')\" && {{ printf '{{\"at\":%s000,\"hook\":' \"$(date +%s)\"; tr -d '\\n'; echo '}}'; }} >> '{file}' # {HOOK_MARKER}"
    )
}

fn is_ours(entry: &Value) -> bool {
    entry
        .get("hooks")
        .and_then(Value::as_array)
        .map(|hooks| {
            hooks.iter().any(|hook| {
                hook.get("command")
                    .and_then(Value::as_str)
                    .map(|c| c.contains(HOOK_MARKER))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

/// Add (or remove) Kode's hooks in a Claude settings object, keeping the
/// user's own hooks untouched.
pub(crate) fn merge_claude_hooks(mut settings: Value, command: &str, install: bool) -> Value {
    if !settings.is_object() {
        settings = json!({});
    }
    let root = settings.as_object_mut().unwrap();
    let hooks = root.entry("hooks").or_insert_with(|| json!({}));
    if !hooks.is_object() {
        *hooks = json!({});
    }
    let hooks = hooks.as_object_mut().unwrap();
    for event in CLAUDE_EVENTS {
        let list = hooks.entry(event.to_string()).or_insert_with(|| json!([]));
        if !list.is_array() {
            *list = json!([]);
        }
        let list = list.as_array_mut().unwrap();
        list.retain(|entry| !is_ours(entry));
        if install {
            list.push(json!({ "hooks": [{ "type": "command", "command": command, "timeout": 5 }] }));
        }
    }
    hooks.retain(|_, list| list.as_array().map(|l| !l.is_empty()).unwrap_or(true));
    if hooks.is_empty() {
        root.remove("hooks");
    }
    settings
}

pub(crate) fn claude_hooks_installed(settings: &Value) -> bool {
    CLAUDE_EVENTS.iter().all(|event| {
        settings
            .pointer(&format!("/hooks/{event}"))
            .and_then(Value::as_array)
            .map(|list| list.iter().any(is_ours))
            .unwrap_or(false)
    })
}

fn claude_settings_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(PathBuf::from(home).join(".claude").join("settings.json"))
}

fn codex_config_path() -> Option<PathBuf> {
    let home = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".codex")))?;
    Some(home.join("config.toml"))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncHooksStatus {
    claude: bool,
    codex: bool,
    /// Codex already has its own `notify` command, so we left it alone.
    codex_notify_taken: bool,
}

/// Codex `notify`: a top-level array in config.toml. We only add ours when
/// there is no `notify` yet, and only remove the line we added.
pub(crate) fn codex_notify_line(events: &Path) -> String {
    let file = events.to_string_lossy().replace('\\', "\\\\").replace('"', "\\\"");
    format!(
        "notify = [\"sh\", \"-c\", \"mkdir -p \\\"$(dirname '{file}')\\\" && printf '{{\\\"at\\\":%s000,\\\"codex\\\":%s}}\\\\n' \\\"$(date +%s)\\\" \\\"$1\\\" >> '{file}'\", \"{HOOK_MARKER}\"]"
    )
}

pub(crate) fn merge_codex_notify(config: &str, line: &str, install: bool) -> (String, bool) {
    let mut lines: Vec<String> = config
        .lines()
        .filter(|l| !l.contains(HOOK_MARKER))
        .map(str::to_string)
        .collect();
    // `notify` must sit before the first [table] to be top-level.
    let first_table = lines.iter().position(|l| l.trim_start().starts_with('['));
    let top = &lines[..first_table.unwrap_or(lines.len())];
    let taken = top.iter().any(|l| l.trim_start().starts_with("notify"));
    if install && !taken {
        lines.insert(0, line.to_string());
    }
    let mut out = lines.join("\n");
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    (out, taken)
}

fn status() -> SyncHooksStatus {
    let claude = claude_settings_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .map(|v| claude_hooks_installed(&v))
        .unwrap_or(false);
    let codex_text = codex_config_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_default();
    let codex = codex_text.contains(HOOK_MARKER);
    let (_, taken) = merge_codex_notify(&codex_text, "", false);
    SyncHooksStatus { claude, codex, codex_notify_taken: taken && !codex }
}

#[tauri::command(async)]
pub fn kode_sync_hooks_status() -> SyncHooksStatus {
    status()
}

/// Install or remove the sync hooks for Claude Code and Codex.
#[tauri::command(async)]
pub fn kode_sync_hooks_set(enabled: bool) -> Result<SyncHooksStatus, String> {
    let events = events_path().ok_or("No home folder.")?;
    if let Some(path) = claude_settings_path() {
        let current = std::fs::read_to_string(&path)
            .ok()
            .map(|t| serde_json::from_str::<Value>(&t).map_err(|e| format!("~/.claude/settings.json is not valid JSON: {e}")))
            .transpose()?
            .unwrap_or_else(|| json!({}));
        if enabled || claude_hooks_installed(&current) || current.get("hooks").is_some() {
            let next = merge_claude_hooks(current, &hook_command(&events), enabled);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let text = serde_json::to_string_pretty(&next).map_err(|e| e.to_string())?;
            std::fs::write(&path, format!("{text}\n")).map_err(|e| e.to_string())?;
        }
    }
    if let Some(path) = codex_config_path() {
        let current = std::fs::read_to_string(&path).unwrap_or_default();
        if enabled || current.contains(HOOK_MARKER) {
            let (next, _) = merge_codex_notify(&current, &codex_notify_line(&events), enabled);
            if next != current && (path.parent().map(Path::is_dir).unwrap_or(false) || enabled) {
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                std::fs::write(&path, next).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(status())
}

// ---------------------------------------------------------------------------
// Codex app-server: thread/list
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CodexThread {
    id: String,
    title: String,
    cwd: Option<String>,
    model: Option<String>,
    updated_at: Option<i64>,
    path: Option<String>,
}

pub(crate) fn parse_thread_list(result: &Value) -> Vec<CodexThread> {
    result
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|t| t.get("parentThreadId").map(Value::is_null).unwrap_or(true))
        .filter(|t| !t.get("ephemeral").and_then(Value::as_bool).unwrap_or(false))
        .filter_map(|t| {
            let id = t.get("id")?.as_str()?.to_string();
            let title = t
                .get("name")
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
                .or_else(|| t.get("preview").and_then(Value::as_str))
                .unwrap_or("Codex thread");
            Some(CodexThread {
                id,
                title: title.chars().take(90).collect(),
                cwd: t.get("cwd").and_then(Value::as_str).map(str::to_string),
                model: t.get("model").and_then(Value::as_str).map(str::to_string),
                updated_at: t.get("updatedAt").and_then(Value::as_i64).map(|s| s * 1000),
                path: t.get("path").and_then(Value::as_str).map(str::to_string),
            })
        })
        .collect()
}

/// Ask a short-lived `codex app-server` for recent threads.
#[tauri::command]
pub async fn kode_codex_threads(cwd: Option<String>, limit: Option<u32>) -> Result<Vec<CodexThread>, String> {
    tauri::async_runtime::spawn_blocking(move || codex_threads_blocking(cwd, limit.unwrap_or(60)))
        .await
        .map_err(|e| e.to_string())?
}

fn codex_threads_blocking(cwd: Option<String>, limit: u32) -> Result<Vec<CodexThread>, String> {
    let binary = crate::cli_agents::find_binary("codex").unwrap_or_else(|| PathBuf::from("codex"));
    let mut child = Command::new(binary)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not start codex app-server: {e}"))?;
    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut params = json!({ "limit": limit, "sortKey": "updated_at" });
    if let Some(cwd) = cwd {
        params["cwd"] = json!(cwd);
    }
    let requests = [
        json!({ "id": 1, "method": "initialize", "params": {
            "clientInfo": { "name": "kontinue", "title": "Kontinue", "version": env!("CARGO_PKG_VERSION") },
            "capabilities": { "experimentalApi": false, "requestAttestation": false } } }),
        json!({ "method": "initialized" }),
        json!({ "id": 2, "method": "thread/list", "params": params }),
    ];
    for request in requests {
        writeln!(stdin, "{request}").map_err(|e| e.to_string())?;
    }
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                if value.get("id").and_then(Value::as_i64) == Some(2) {
                    let _ = tx.send(value);
                    break;
                }
            }
        }
    });
    let deadline = Instant::now() + Duration::from_secs(15);
    let response = rx.recv_timeout(deadline.saturating_duration_since(Instant::now()));
    drop(stdin);
    let _ = child.kill();
    let _ = child.wait();
    let response = response.map_err(|_| "codex app-server did not answer in time.".to_string())?;
    if let Some(error) = response.get("error") {
        return Err(format!("codex app-server: {}", error.get("message").and_then(Value::as_str).unwrap_or("error")));
    }
    Ok(parse_thread_list(response.get("result").unwrap_or(&Value::Null)))
}

#[allow(dead_code)]
pub(crate) fn now() -> i64 {
    now_ms()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_claude_hooks_without_touching_user_hooks() {
        let user = json!({ "model": "opus", "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "say done" }] }] } });
        let cmd = hook_command(Path::new("/tmp/events.jsonl"));
        let installed = merge_claude_hooks(user.clone(), &cmd, true);
        assert!(claude_hooks_installed(&installed));
        assert_eq!(installed["hooks"]["Stop"].as_array().unwrap().len(), 2);
        // Installing twice doesn't duplicate.
        let twice = merge_claude_hooks(installed.clone(), &cmd, true);
        assert_eq!(twice["hooks"]["Stop"].as_array().unwrap().len(), 2);
        let removed = merge_claude_hooks(twice, &cmd, false);
        assert_eq!(removed, user);
    }

    #[test]
    fn hook_command_writes_a_parseable_line() {
        let dir = std::env::temp_dir().join(format!("kode-hook-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let events = dir.join("events.jsonl");
        let status = Command::new("sh")
            .arg("-c")
            .arg(hook_command(&events))
            .stdin(Stdio::piped())
            .spawn()
            .and_then(|mut child| {
                child.stdin.take().unwrap().write_all(b"{\"session_id\":\"s1\",\n\"transcript_path\":\"/x.jsonl\",\"hook_event_name\":\"Stop\"}")?;
                child.wait()
            })
            .unwrap();
        assert!(status.success());
        let parsed = read_events(&events, 0);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].event, "Stop");
        assert_eq!(parsed[0].session_id.as_deref(), Some("s1"));
        assert!(parsed[0].at > 1_600_000_000_000);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn codex_notify_is_added_once_and_respects_existing() {
        let line = codex_notify_line(Path::new("/tmp/e.jsonl"));
        let (added, taken) = merge_codex_notify("model = \"o3\"\n[mcp_servers.x]\ncommand = \"y\"\n", &line, true);
        assert!(!taken);
        assert!(added.starts_with("notify = "));
        let (again, _) = merge_codex_notify(&added, &line, true);
        assert_eq!(again.matches(HOOK_MARKER).count(), 1);
        let (removed, _) = merge_codex_notify(&again, &line, false);
        assert!(!removed.contains(HOOK_MARKER));
        let (kept, taken) = merge_codex_notify("notify = [\"my-script\"]\n", &line, true);
        assert!(taken);
        assert!(!kept.contains(HOOK_MARKER));
    }

    #[test]
    fn codex_notify_command_writes_a_parseable_line() {
        let dir = std::env::temp_dir().join(format!("kode-notify-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let events = dir.join("e.jsonl");
        let line = codex_notify_line(&events);
        // Pull the sh -c script back out of the TOML array.
        let array: Vec<String> = serde_json::from_str(line.trim_start_matches("notify = ")).unwrap();
        let status = Command::new(&array[0])
            .args(&array[1..])
            .arg(r#"{"type":"agent-turn-complete","thread-id":"t1","cwd":"/p"}"#)
            .status()
            .unwrap();
        assert!(status.success());
        let parsed = read_events(&events, 0);
        assert_eq!(parsed[0].session_id.as_deref(), Some("t1"));
        assert_eq!(parsed[0].event, "agent-turn-complete");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_app_server_thread_list() {
        let result = json!({ "data": [
            { "id": "a", "name": null, "preview": "Fix login", "cwd": "/p", "model": "gpt", "updatedAt": 10, "path": "/x.jsonl", "parentThreadId": null, "ephemeral": false },
            { "id": "b", "preview": "sub", "parentThreadId": "a" }
        ] });
        let threads = parse_thread_list(&result);
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].title, "Fix login");
        assert_eq!(threads[0].updated_at, Some(10_000));
    }
}

// ---------------------------------------------------------------------------
// Shared workspace (project folders + chat → folder), so every copy of the
// app (installed, dev, other builds) shows the same projects. Each webview
// otherwise keeps its own localStorage.
// ---------------------------------------------------------------------------

fn workspace_path() -> Option<PathBuf> {
    kode_dir().map(|dir| dir.join("workspace.json"))
}

#[tauri::command(async)]
pub fn kode_shared_workspace_read() -> Option<Value> {
    let text = std::fs::read_to_string(workspace_path()?).ok()?;
    serde_json::from_str(&text).ok()
}

#[tauri::command(async)]
pub fn kode_shared_workspace_write(workspace: Value) -> Result<(), String> {
    let path = workspace_path().ok_or("No home folder.")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&workspace).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
