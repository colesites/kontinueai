// Sessions from other coding agents: Gemini CLI, Cursor, OpenCode and Aider.
// Windsurf is detected but its Cascade history is stored encrypted, so it is
// reported as "not readable" instead of being parsed.
//
// Each reader returns the same normalized `CodingSession` as Claude/Codex, so
// the import, sync and continuation code is shared.

use super::*;
use sha2::{Digest, Sha256};
use std::process::Command;

pub(super) const GEMINI_PROVIDER: &str = "gemini_cli";
pub(super) const CURSOR_PROVIDER: &str = "cursor";
pub(super) const OPENCODE_PROVIDER: &str = "opencode";
pub(super) const AIDER_PROVIDER: &str = "aider";
const AIDER_FILE: &str = ".aider.chat.history.md";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionSource {
    provider: String,
    label: String,
    detected: bool,
    readable: bool,
    note: Option<String>,
}

fn gemini_root(home: &Path) -> PathBuf {
    home.join(".gemini").join("tmp")
}
fn opencode_root(home: &Path) -> PathBuf {
    home.join(".local").join("share").join("opencode").join("storage")
}
fn cursor_user_dir(home: &Path) -> PathBuf {
    if cfg!(target_os = "macos") {
        home.join("Library/Application Support/Cursor/User")
    } else if cfg!(windows) {
        home.join("AppData/Roaming/Cursor/User")
    } else {
        home.join(".config/Cursor/User")
    }
}
fn windsurf_root(home: &Path) -> PathBuf {
    home.join(".codeium").join("windsurf")
}

/// Gemini CLI names its per-project folder after sha256(cwd).
pub(super) fn gemini_project_hash(path: &Path) -> String {
    let path = canonical_or_original(path);
    let digest = Sha256::digest(path.to_string_lossy().as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

pub(super) fn detect_sources(home: &Path) -> Vec<SessionSource> {
    let source = |provider: &str, label: &str, detected: bool, readable: bool, note: Option<&str>| SessionSource {
        provider: provider.into(),
        label: label.into(),
        detected,
        readable,
        note: note.map(str::to_string),
    };
    vec![
        source(CLAUDE_PROVIDER, "Claude Code", home.join(".claude/projects").is_dir(), true, None),
        source(CODEX_PROVIDER, "Codex", home.join(".codex/sessions").is_dir(), true, None),
        source(GEMINI_PROVIDER, "Gemini CLI", gemini_root(home).is_dir(), true, None),
        source(
            CURSOR_PROVIDER,
            "Cursor",
            cursor_user_dir(home).join("globalStorage/state.vscdb").is_file(),
            sqlite_available(),
            if sqlite_available() { None } else { Some("Needs the sqlite3 command to read Cursor's history.") },
        ),
        source(OPENCODE_PROVIDER, "OpenCode", opencode_root(home).join("session").is_dir(), true, None),
        source(AIDER_PROVIDER, "Aider", true, true, Some("Read from .aider.chat.history.md in the project folder.")),
        source(
            "windsurf",
            "Windsurf",
            windsurf_root(home).is_dir(),
            false,
            Some("Windsurf stores Cascade history encrypted. Export the chat as Markdown and import the file instead."),
        ),
    ]
}

fn sqlite_available() -> bool {
    Command::new("sqlite3").arg("-version").output().map(|o| o.status.success()).unwrap_or(false)
}

fn sqlite_rows(db: &Path, sql: &str) -> Vec<Value> {
    let Ok(output) = Command::new("sqlite3")
        .arg("-readonly")
        .arg("-json")
        .arg(db)
        .arg(sql)
        .output()
    else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(&output.stdout);
    if text.trim().is_empty() {
        return Vec::new();
    }
    serde_json::from_str::<Vec<Value>>(&text).unwrap_or_default()
}

fn summary(provider: &str, id: String, title: String, cwd: Option<String>, last: Option<i64>, source: String, size: u64) -> CodingSessionSummary {
    let project_exists = cwd.as_deref().map(|c| Path::new(c).is_dir()).unwrap_or(false);
    let project_root = cwd
        .as_deref()
        .and_then(|c| resolve_project_root(Path::new(c)))
        .map(|p| p.to_string_lossy().to_string());
    CodingSessionSummary {
        provider: provider.into(),
        session_id: id,
        title: if title.trim().is_empty() { "Imported session".into() } else { truncate_chars(title.trim(), 90) },
        project_path: cwd,
        project_root,
        project_exists,
        git_branch: None,
        model: None,
        last_activity: last,
        source_path: source,
        size_bytes: size,
        limit_hit_at: None,
        limit_resets_at: None,
        limit_note: None,
    }
}

fn empty_session(provider: &str, id: String, title: String, cwd: Option<String>) -> CodingSession {
    CodingSession {
        provider: provider.into(),
        session_id: id,
        title,
        project_path: cwd,
        project_root: None,
        git_branch: None,
        model: None,
        started_at: None,
        last_activity: None,
        source_path: String::new(),
        messages: Vec::new(),
        tool_events: Vec::new(),
        files_changed: Vec::new(),
        messages_dropped: 0,
        redactions: 0,
        truncated: false,
    }
}

// ---------------------------------------------------------------------------
// Gemini CLI: ~/.gemini/tmp/<sha256(cwd)>/chats/session-*.json
// ---------------------------------------------------------------------------

fn scan_gemini(home: &Path, filter: Option<&Path>, known: &[PathBuf], out: &mut Vec<CodingSessionSummary>) {
    let root = gemini_root(home);
    let Ok(dirs) = std::fs::read_dir(&root) else { return };
    // Map project hashes back to folders we know about.
    let mut by_hash = std::collections::HashMap::new();
    for path in known.iter().chain(filter.map(Path::to_path_buf).iter()) {
        by_hash.insert(gemini_project_hash(path), path.to_string_lossy().to_string());
    }
    let wanted = filter.map(gemini_project_hash);
    for dir in dirs.flatten() {
        let hash = dir.file_name().to_string_lossy().to_string();
        if let Some(wanted) = &wanted {
            if &hash != wanted {
                continue;
            }
        }
        let Ok(chats) = std::fs::read_dir(dir.path().join("chats")) else { continue };
        for chat in chats.flatten() {
            let path = chat.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&path) else { continue };
            let session = parse_gemini_session(&text, &path, by_hash.get(&hash).cloned());
            if session.messages.is_empty() {
                continue;
            }
            out.push(summary(
                GEMINI_PROVIDER,
                session.session_id.clone(),
                session.title.clone(),
                session.project_path.clone(),
                session.last_activity.or_else(|| file_modified_ms(&path)),
                path.to_string_lossy().to_string(),
                std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
            ));
        }
    }
}

pub(super) fn parse_gemini_session(text: &str, source: &Path, cwd: Option<String>) -> CodingSession {
    let value: Value = serde_json::from_str(text).unwrap_or(Value::Null);
    let id = value
        .get("sessionId")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| source.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default());
    let mut session = empty_session(GEMINI_PROVIDER, id, String::new(), cwd);
    session.started_at = value.get("startTime").and_then(Value::as_str).and_then(parse_iso_ms);
    session.last_activity = value.get("lastUpdated").and_then(Value::as_str).and_then(parse_iso_ms);
    let mut messages = Vec::new();
    let mut events = Vec::new();
    let mut redactions = 0u32;
    for message in value.get("messages").and_then(Value::as_array).into_iter().flatten() {
        let timestamp = message.get("timestamp").and_then(Value::as_str).and_then(parse_iso_ms);
        let content = match message.get("content") {
            Some(Value::String(text)) => text.clone(),
            Some(other) => collect_text_blocks(other),
            None => String::new(),
        };
        match message.get("type").and_then(Value::as_str).unwrap_or("") {
            "user" => push_message(&mut messages, "user", clean_transcript_text(&content), timestamp, &mut redactions),
            "gemini" | "model" | "assistant" => {
                if session.model.is_none() {
                    session.model = message.get("model").and_then(Value::as_str).map(str::to_string);
                }
                for call in message.get("toolCalls").and_then(Value::as_array).into_iter().flatten() {
                    let name = call.get("name").and_then(Value::as_str).unwrap_or("tool");
                    let args = call.get("args").cloned().unwrap_or(Value::Null);
                    let id = call.get("id").and_then(Value::as_str).map(str::to_string);
                    push_tool_call(
                        &mut events,
                        id.clone(),
                        name,
                        summarize_tool_input(name, &args),
                        tool_detail(name, &args),
                        timestamp,
                        &mut redactions,
                    );
                    // Gemini stores the outcome on the call itself.
                    if let (Some(id), Some(status)) = (id, call.get("status").and_then(Value::as_str)) {
                        let output = call
                            .get("resultDisplay")
                            .and_then(Value::as_str)
                            .map(str::to_string)
                            .unwrap_or_else(|| call.get("result").map(collect_result_text).unwrap_or_default());
                        attach_tool_result(&mut events, &id, &output, status == "error", &mut redactions);
                    }
                }
                push_message(&mut messages, "assistant", clean_transcript_text(&content), timestamp, &mut redactions)
            }
            "error" | "info" => push_notice(&mut messages, content, timestamp, &mut redactions),
            _ => {}
        }
    }
    finalize_session(GEMINI_PROVIDER, source, session, messages, events, BTreeSet::new(), redactions)
}

// ---------------------------------------------------------------------------
// OpenCode: storage/session/<project>/<id>.json, message/<id>/*.json,
// part/<messageId>/*.json
// ---------------------------------------------------------------------------

fn scan_opencode(home: &Path, filter: Option<&Path>, out: &mut Vec<CodingSessionSummary>) {
    let root = opencode_root(home);
    let mut files = Vec::new();
    let Ok(projects) = std::fs::read_dir(root.join("session")) else { return };
    for project in projects.flatten() {
        let Ok(entries) = std::fs::read_dir(project.path()) else { continue };
        for entry in entries.flatten() {
            if entry.path().extension().and_then(|e| e.to_str()) == Some("json") {
                files.push(entry.path());
            }
        }
    }
    for path in files.into_iter().take(2_000) {
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        let Ok(value) = serde_json::from_str::<Value>(&text) else { continue };
        if value.get("parentID").is_some() {
            continue; // sub-agent session
        }
        let cwd = value.get("directory").and_then(Value::as_str).map(str::to_string);
        if let Some(filter) = filter {
            match &cwd {
                Some(cwd) if paths_match(Path::new(cwd), filter) => {}
                _ => continue,
            }
        }
        let id = value.get("id").and_then(Value::as_str).unwrap_or_default().to_string();
        let title = value.get("title").and_then(Value::as_str).unwrap_or_default().to_string();
        let updated = value.pointer("/time/updated").and_then(Value::as_i64);
        out.push(summary(
            OPENCODE_PROVIDER,
            id,
            title,
            cwd,
            updated.or_else(|| file_modified_ms(&path)),
            path.to_string_lossy().to_string(),
            std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
        ));
    }
}

fn read_json_dir(dir: &Path) -> Vec<Value> {
    let mut values: Vec<Value> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|e| std::fs::read_to_string(e.path()).ok())
        .filter_map(|t| serde_json::from_str::<Value>(&t).ok())
        .collect();
    values.sort_by_key(|v| {
        (
            v.pointer("/time/created").and_then(Value::as_i64).unwrap_or(0),
            v.get("id").and_then(Value::as_str).unwrap_or("").to_string(),
        )
    });
    values
}

pub(super) fn parse_opencode_session(storage: &Path, session_file: &Path) -> Result<CodingSession, String> {
    let text = std::fs::read_to_string(session_file).map_err(|e| format!("Could not read the session: {e}"))?;
    let value: Value = serde_json::from_str(&text).map_err(|e| format!("Unreadable OpenCode session: {e}"))?;
    let id = value.get("id").and_then(Value::as_str).unwrap_or_default().to_string();
    let title = value.get("title").and_then(Value::as_str).unwrap_or_default().to_string();
    let cwd = value.get("directory").and_then(Value::as_str).map(str::to_string);
    let mut session = empty_session(OPENCODE_PROVIDER, id.clone(), title, cwd);
    session.started_at = value.pointer("/time/created").and_then(Value::as_i64);
    session.last_activity = value.pointer("/time/updated").and_then(Value::as_i64);
    let mut messages = Vec::new();
    let mut events = Vec::new();
    let mut files = BTreeSet::new();
    let mut redactions = 0u32;
    for message in read_json_dir(&storage.join("message").join(&id)) {
        let role = message.get("role").and_then(Value::as_str).unwrap_or("");
        let message_id = message.get("id").and_then(Value::as_str).unwrap_or("");
        let timestamp = message.pointer("/time/created").and_then(Value::as_i64);
        if session.model.is_none() {
            session.model = message.get("modelID").and_then(Value::as_str).map(str::to_string);
        }
        let mut text = Vec::new();
        for part in read_json_dir(&storage.join("part").join(message_id)) {
            match part.get("type").and_then(Value::as_str).unwrap_or("") {
                "text" => {
                    if !part.get("synthetic").and_then(Value::as_bool).unwrap_or(false) {
                        if let Some(t) = part.get("text").and_then(Value::as_str) {
                            text.push(t.to_string());
                        }
                    }
                }
                "tool" => {
                    let name = part.get("tool").and_then(Value::as_str).unwrap_or("tool");
                    let input = part.pointer("/state/input").cloned().unwrap_or(Value::Null);
                    if let Some(path) = tool_input_path(&input) {
                        files.insert(path);
                    }
                    let call_id = part.get("callID").and_then(Value::as_str).map(str::to_string);
                    push_tool_call(&mut events, call_id.clone(), name, summarize_tool_input(name, &input), tool_detail(name, &input), timestamp, &mut redactions);
                    if let (Some(call_id), Some(output)) = (call_id, part.pointer("/state/output").and_then(Value::as_str)) {
                        let failed = part.pointer("/state/status").and_then(Value::as_str) == Some("error");
                        attach_tool_result(&mut events, &call_id, output, failed, &mut redactions);
                    }
                }
                _ => {}
            }
        }
        let content = clean_transcript_text(&text.join("\n\n"));
        if role == "user" || role == "assistant" {
            push_message(&mut messages, role, content, timestamp, &mut redactions);
        }
    }
    Ok(finalize_session(OPENCODE_PROVIDER, session_file, session, messages, events, files, redactions))
}

// ---------------------------------------------------------------------------
// Aider: <project>/.aider.chat.history.md
// ---------------------------------------------------------------------------

fn scan_aider(roots: &[PathBuf], out: &mut Vec<CodingSessionSummary>) {
    let mut seen = BTreeSet::new();
    for root in roots {
        let path = root.join(AIDER_FILE);
        if !path.is_file() || !seen.insert(path.clone()) {
            continue;
        }
        let head = read_head(&path, 64 * 1024);
        let session = parse_aider_history(&head, &path);
        out.push(summary(
            AIDER_PROVIDER,
            session.session_id.clone(),
            session.title.clone(),
            Some(root.to_string_lossy().to_string()),
            file_modified_ms(&path),
            path.to_string_lossy().to_string(),
            std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
        ));
    }
}

/// Aider's log: `#### ` lines are the user's prompts, `> ` lines are tool
/// output, the rest is the assistant. Only the latest chat is imported.
pub(super) fn parse_aider_history(text: &str, source: &Path) -> CodingSession {
    let latest = text.rfind("# aider chat started at").map(|i| &text[i..]).unwrap_or(text);
    let started = latest
        .lines()
        .next()
        .and_then(|line| line.strip_prefix("# aider chat started at "))
        .map(|s| s.trim().replace(' ', "T"))
        .and_then(|s| parse_iso_ms(&format!("{s}Z")));
    let cwd = source.parent().map(|p| p.to_string_lossy().to_string());
    let id = format!("aider-{}", started.unwrap_or(0));
    let mut session = empty_session(AIDER_PROVIDER, id, String::new(), cwd);
    session.started_at = started;
    let mut messages = Vec::new();
    let mut redactions = 0u32;
    let mut user = Vec::new();
    let mut assistant = Vec::new();
    let flush = |messages: &mut Vec<CodingSessionMessage>, user: &mut Vec<String>, assistant: &mut Vec<String>, r: &mut u32| {
        if !user.is_empty() {
            push_message(messages, "user", user.join("\n"), started, r);
            user.clear();
        }
        if !assistant.is_empty() {
            push_message(messages, "assistant", assistant.join("\n"), started, r);
            assistant.clear();
        }
    };
    for line in latest.lines().skip(1) {
        if let Some(prompt) = line.strip_prefix("#### ") {
            if !assistant.is_empty() {
                flush(&mut messages, &mut user, &mut assistant, &mut redactions);
            }
            user.push(prompt.to_string());
        } else if line.starts_with("> ") || line == ">" {
            continue;
        } else {
            if !user.is_empty() && assistant.is_empty() && line.trim().is_empty() {
                continue;
            }
            if !user.is_empty() && assistant.is_empty() {
                // first assistant line ends the prompt
                push_message(&mut messages, "user", user.join("\n"), started, &mut redactions);
                user.clear();
            }
            assistant.push(line.to_string());
        }
    }
    flush(&mut messages, &mut user, &mut assistant, &mut redactions);
    finalize_session(AIDER_PROVIDER, source, session, messages, Vec::new(), BTreeSet::new(), redactions)
}

// ---------------------------------------------------------------------------
// Cursor: globalStorage/state.vscdb (cursorDiskKV composerData:* / bubbleId:*)
// Source path is "<db>#<composerId>".
// ---------------------------------------------------------------------------

fn cursor_workspaces(home: &Path) -> std::collections::HashMap<String, String> {
    // composerId -> workspace folder
    let mut map = std::collections::HashMap::new();
    let Ok(entries) = std::fs::read_dir(cursor_user_dir(home).join("workspaceStorage")) else { return map };
    for entry in entries.flatten() {
        let Ok(text) = std::fs::read_to_string(entry.path().join("workspace.json")) else { continue };
        let Ok(value) = serde_json::from_str::<Value>(&text) else { continue };
        let Some(folder) = value.get("folder").and_then(Value::as_str) else { continue };
        let folder = folder.strip_prefix("file://").unwrap_or(folder).replace("%20", " ");
        let db = entry.path().join("state.vscdb");
        if !db.is_file() {
            continue;
        }
        for row in sqlite_rows(&db, "select value from ItemTable where key = 'composer.composerData'") {
            let Some(raw) = row.get("value").and_then(Value::as_str) else { continue };
            let Ok(data) = serde_json::from_str::<Value>(raw) else { continue };
            for composer in data.get("allComposers").and_then(Value::as_array).into_iter().flatten() {
                if let Some(id) = composer.get("composerId").and_then(Value::as_str) {
                    map.insert(id.to_string(), folder.clone());
                }
            }
        }
    }
    map
}

fn scan_cursor(home: &Path, filter: Option<&Path>, out: &mut Vec<CodingSessionSummary>) {
    let db = cursor_user_dir(home).join("globalStorage/state.vscdb");
    if !db.is_file() || !sqlite_available() {
        return;
    }
    let workspaces = cursor_workspaces(home);
    let rows = sqlite_rows(
        &db,
        "select key, json_extract(value,'$.name') as name, json_extract(value,'$.lastUpdatedAt') as updated, length(value) as size from cursorDiskKV where key like 'composerData:%' order by updated desc limit 300",
    );
    for row in rows {
        let Some(key) = row.get("key").and_then(Value::as_str) else { continue };
        let id = key.trim_start_matches("composerData:").to_string();
        let cwd = workspaces.get(&id).cloned();
        if let Some(filter) = filter {
            match &cwd {
                Some(cwd) if paths_match(Path::new(cwd), filter) => {}
                _ => continue,
            }
        }
        let size = row.get("size").and_then(Value::as_u64).unwrap_or(0);
        if size < 200 {
            continue; // empty composer
        }
        out.push(summary(
            CURSOR_PROVIDER,
            id.clone(),
            row.get("name").and_then(Value::as_str).unwrap_or("Cursor chat").to_string(),
            cwd,
            row.get("updated").and_then(Value::as_i64),
            format!("{}#{id}", db.to_string_lossy()),
            size,
        ));
    }
}

fn sql_quote(text: &str) -> String {
    text.replace('\'', "''")
}

pub(super) fn parse_cursor_composer(composer: &Value, bubbles: &std::collections::HashMap<String, Value>, source: &Path, cwd: Option<String>) -> CodingSession {
    let id = composer.get("composerId").and_then(Value::as_str).unwrap_or_default().to_string();
    let title = composer.get("name").and_then(Value::as_str).unwrap_or_default().to_string();
    let mut session = empty_session(CURSOR_PROVIDER, id, title, cwd);
    session.started_at = composer.get("createdAt").and_then(Value::as_i64);
    session.last_activity = composer.get("lastUpdatedAt").and_then(Value::as_i64);
    let mut messages = Vec::new();
    let mut redactions = 0u32;
    let mut turns: Vec<Value> = composer.get("conversation").and_then(Value::as_array).cloned().unwrap_or_default();
    if turns.is_empty() {
        for header in composer.get("fullConversationHeadersOnly").and_then(Value::as_array).into_iter().flatten() {
            if let Some(bubble) = header.get("bubbleId").and_then(Value::as_str).and_then(|b| bubbles.get(b)) {
                turns.push(bubble.clone());
            }
        }
    }
    for turn in turns {
        let text = turn.get("text").and_then(Value::as_str).unwrap_or("");
        let role = match turn.get("type").and_then(Value::as_i64) {
            Some(1) => "user",
            Some(2) => "assistant",
            _ => continue,
        };
        let timestamp = turn.pointer("/timingInfo/clientStartTime").and_then(Value::as_f64).map(|t| t as i64);
        push_message(&mut messages, role, clean_transcript_text(text), timestamp, &mut redactions);
    }
    finalize_session(CURSOR_PROVIDER, source, session, messages, Vec::new(), BTreeSet::new(), redactions)
}

fn read_cursor(home: &Path, source: &str) -> Result<CodingSession, String> {
    let (db, id) = source.rsplit_once('#').ok_or("Not a Cursor session.")?;
    let expected = cursor_user_dir(home).join("globalStorage/state.vscdb");
    if canonical_or_original(Path::new(db)) != canonical_or_original(&expected) {
        return Err("The session is outside Cursor's history folder.".into());
    }
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Invalid Cursor session id.".into());
    }
    let db = Path::new(db);
    let rows = sqlite_rows(db, &format!("select value from cursorDiskKV where key = 'composerData:{}'", sql_quote(id)));
    let raw = rows.first().and_then(|r| r.get("value")).and_then(Value::as_str).ok_or("Cursor chat not found.")?;
    let composer: Value = serde_json::from_str(raw).map_err(|e| format!("Unreadable Cursor chat: {e}"))?;
    let mut bubbles = std::collections::HashMap::new();
    if composer.get("conversation").and_then(Value::as_array).map(|a| a.is_empty()).unwrap_or(true) {
        for row in sqlite_rows(db, &format!("select key, value from cursorDiskKV where key like 'bubbleId:{}:%'", sql_quote(id))) {
            let (Some(key), Some(value)) = (row.get("key").and_then(Value::as_str), row.get("value").and_then(Value::as_str)) else { continue };
            if let Ok(value) = serde_json::from_str::<Value>(value) {
                bubbles.insert(key.rsplit(':').next().unwrap_or_default().to_string(), value);
            }
        }
    }
    let cwd = cursor_workspaces(home).get(id).cloned();
    let mut session = parse_cursor_composer(&composer, &bubbles, db, cwd);
    session.source_path = source.to_string();
    Ok(session)
}

// ---------------------------------------------------------------------------
// Entry points used by the main scanner / reader.
// ---------------------------------------------------------------------------

pub(super) fn scan_more(home: &Path, filter: Option<&Path>, known_roots: &[PathBuf], out: &mut Vec<CodingSessionSummary>) {
    scan_gemini(home, filter, known_roots, out);
    scan_opencode(home, filter, out);
    scan_cursor(home, filter, out);
    let mut aider_roots: Vec<PathBuf> = known_roots.to_vec();
    if let Some(filter) = filter {
        aider_roots.push(filter.to_path_buf());
    }
    scan_aider(&aider_roots, out);
}

/// Some(result) when `provider` is one of the extra agents.
pub(super) fn read_more(home: &Path, provider: &str, source: &str) -> Option<Result<CodingSession, String>> {
    let inside = |root: PathBuf| -> Result<PathBuf, String> {
        let path = std::fs::canonicalize(source).map_err(|e| format!("Could not open the session: {e}"))?;
        if !path.starts_with(canonical_or_original(&root)) {
            return Err("The session is outside the agent's history folder.".into());
        }
        Ok(path)
    };
    Some(match provider {
        GEMINI_PROVIDER => inside(gemini_root(home)).and_then(|path| {
            let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            Ok(parse_gemini_session(&text, &path, None))
        }),
        OPENCODE_PROVIDER => {
            let root = opencode_root(home);
            inside(root.join("session")).and_then(|path| parse_opencode_session(&canonical_or_original(&root), &path))
        }
        AIDER_PROVIDER => {
            let path = match std::fs::canonicalize(source) {
                Ok(path) => path,
                Err(e) => return Some(Err(format!("Could not open the session: {e}"))),
            };
            if path.file_name().and_then(|n| n.to_str()) != Some(AIDER_FILE) {
                return Some(Err("Not an Aider chat history file.".into()));
            }
            std::fs::read_to_string(&path)
                .map_err(|e| e.to_string())
                .map(|text| parse_aider_history(&text, &path))
        }
        CURSOR_PROVIDER => read_cursor(home, source),
        _ => return None,
    })
}

/// Modified time for change detection (Cursor: the shared database).
pub(super) fn updated_at_more(home: &Path, provider: &str, source: &str) -> Option<Result<i64, String>> {
    let path = match provider {
        CURSOR_PROVIDER => PathBuf::from(source.rsplit_once('#').map(|(db, _)| db).unwrap_or(source)),
        GEMINI_PROVIDER | OPENCODE_PROVIDER | AIDER_PROVIDER => PathBuf::from(source),
        _ => return None,
    };
    let _ = home;
    Some(file_modified_ms(&path).ok_or_else(|| "Could not read the session timestamp.".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_gemini_chat() {
        let text = r#"{"sessionId":"g1","startTime":"2026-01-01T00:00:00Z","lastUpdated":"2026-01-01T00:05:00Z","messages":[
            {"type":"user","content":"Add a login page","timestamp":"2026-01-01T00:00:00Z"},
            {"type":"gemini","content":"Done, see login.tsx","model":"gemini-2.5-pro","timestamp":"2026-01-01T00:01:00Z",
             "toolCalls":[{"id":"c1","name":"run_shell_command","args":{"command":"ls"}}]}]}"#;
        let session = parse_gemini_session(text, Path::new("/tmp/session-1.json"), Some("/tmp/p".into()));
        assert_eq!(session.session_id, "g1");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[0].role, "user");
        assert_eq!(session.model.as_deref(), Some("gemini-2.5-pro"));
        assert_eq!(session.tool_events.len(), 1);
        assert_eq!(session.title, "Add a login page");
    }

    #[test]
    fn parses_aider_latest_chat() {
        let text = "# aider chat started at 2025-01-01 10:00:00\n\n#### old prompt\n\nold answer\n\n# aider chat started at 2026-02-02 11:00:00\n\n> Aider v0.80\n\n#### fix the tests\n\nI updated test_app.py.\n\n#### thanks\n\nYou're welcome.\n";
        let session = parse_aider_history(text, Path::new("/tmp/p/.aider.chat.history.md"));
        let roles: Vec<&str> = session.messages.iter().map(|m| m.role.as_str()).collect();
        assert_eq!(roles, vec!["user", "assistant", "user", "assistant"]);
        assert_eq!(session.messages[0].content, "fix the tests");
        assert!(session.session_id.starts_with("aider-"));
    }

    #[test]
    fn parses_cursor_bubbles() {
        let composer: Value = serde_json::json!({
            "composerId": "abc", "name": "Refactor", "createdAt": 1, "lastUpdatedAt": 2,
            "conversation": [],
            "fullConversationHeadersOnly": [{"bubbleId": "b1"}, {"bubbleId": "b2"}]
        });
        let mut bubbles = std::collections::HashMap::new();
        bubbles.insert("b1".to_string(), serde_json::json!({"type": 1, "text": "Refactor utils"}));
        bubbles.insert("b2".to_string(), serde_json::json!({"type": 2, "text": "Split into two files."}));
        let session = parse_cursor_composer(&composer, &bubbles, Path::new("/tmp/state.vscdb"), None);
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.title, "Refactor");
        assert_eq!(session.messages[1].content, "Split into two files.");
    }

    #[test]
    fn parses_opencode_storage() {
        let dir = std::env::temp_dir().join(format!("kode-opencode-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("session/proj")).unwrap();
        std::fs::create_dir_all(dir.join("message/ses1")).unwrap();
        std::fs::create_dir_all(dir.join("part/m1")).unwrap();
        std::fs::create_dir_all(dir.join("part/m2")).unwrap();
        std::fs::write(dir.join("session/proj/ses1.json"), r#"{"id":"ses1","title":"Fix bug","directory":"/tmp/x","time":{"created":1,"updated":5}}"#).unwrap();
        std::fs::write(dir.join("message/ses1/m1.json"), r#"{"id":"m1","role":"user","time":{"created":1}}"#).unwrap();
        std::fs::write(dir.join("message/ses1/m2.json"), r#"{"id":"m2","role":"assistant","modelID":"m","time":{"created":2}}"#).unwrap();
        std::fs::write(dir.join("part/m1/p1.json"), r#"{"id":"p1","type":"text","text":"Fix the crash"}"#).unwrap();
        std::fs::write(dir.join("part/m2/p1.json"), r#"{"id":"p1","type":"tool","tool":"bash","callID":"c1","state":{"status":"completed","input":{"command":"npm test"},"output":"ok"}}"#).unwrap();
        std::fs::write(dir.join("part/m2/p2.json"), r#"{"id":"p2","type":"text","text":"Fixed it."}"#).unwrap();
        let session = parse_opencode_session(&dir, &dir.join("session/proj/ses1.json")).unwrap();
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.tool_events[0].detail.as_deref(), Some("npm test"));
        assert_eq!(session.tool_events[0].output.as_deref(), Some("ok"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn gemini_hash_is_sha256_of_path() {
        let hash = gemini_project_hash(Path::new("/definitely/not/here"));
        assert_eq!(hash.len(), 64);
    }
}
