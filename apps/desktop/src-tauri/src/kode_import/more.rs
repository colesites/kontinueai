// Sessions from other coding agents: Gemini CLI, Cursor, OpenCode, Aider and
// Antigravity.
//
// Each reader returns the same normalized `CodingSession` as Claude/Codex, so
// the import, sync and continuation code is shared.

use super::*;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::process::Command;

pub(super) const GEMINI_PROVIDER: &str = "gemini_cli";
pub(super) const CURSOR_PROVIDER: &str = "cursor";
pub(super) const OPENCODE_PROVIDER: &str = "opencode";
pub(super) const AIDER_PROVIDER: &str = "aider";
pub(super) const ANTIGRAVITY_PROVIDER: &str = "antigravity";
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
fn opencode_data(home: &Path) -> PathBuf {
    home.join(".local").join("share").join("opencode")
}
fn opencode_root(home: &Path) -> PathBuf {
    opencode_data(home).join("storage")
}
fn opencode_db(home: &Path) -> PathBuf {
    opencode_data(home).join("opencode.db")
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
fn antigravity_roots(home: &Path) -> [PathBuf; 2] {
    let gemini = home.join(".gemini");
    [
        gemini.join("antigravity").join("conversations"),
        gemini.join("antigravity-acp").join("conversations"),
    ]
}

/// Gemini CLI (before its project slugs) named its per-project folder after sha256(cwd).
pub(super) fn gemini_project_hash(path: &Path) -> String {
    let path = canonical_or_original(path);
    let digest = Sha256::digest(path.to_string_lossy().as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Temp folders, including the ones Kontinue probes agents in. Sessions there
/// are not real work, so they are left out of the list.
fn is_scratch_dir(path: &str) -> bool {
    path.contains("kontinue-acp-probe")
        || ["/tmp/", "/private/tmp/", "/var/folders/", "/private/var/folders/"]
            .iter()
            .any(|prefix| path.starts_with(prefix) || format!("{path}/") == *prefix)
}

pub(super) fn detect_sources(home: &Path) -> Vec<SessionSource> {
    let source = |provider: &str, label: &str, detected: bool, readable: bool, note: Option<&str>| SessionSource {
        provider: provider.into(),
        label: label.into(),
        detected,
        readable,
        note: note.map(str::to_string),
    };
    let sqlite = sqlite_available();
    let needs_sqlite = |agent: &str| (!sqlite).then(|| format!("Needs the sqlite3 command to read {agent}'s history."));
    let roots = antigravity_roots(home);
    let has_antigravity = roots.iter().any(|r| r.is_dir());
    let encrypted_antigravity = roots
        .iter()
        .filter_map(|r| std::fs::read_dir(r).ok())
        .flatten()
        .flatten()
        .any(|e| e.path().extension().and_then(|x| x.to_str()) == Some("pb"));
    let antigravity_note = needs_sqlite("Antigravity").or_else(|| {
        encrypted_antigravity.then(|| "Older Antigravity conversations are stored encrypted, so only newer ones are listed.".to_string())
    });
    vec![
        source(CLAUDE_PROVIDER, "Claude Code", home.join(".claude/projects").is_dir(), true, None),
        source(CODEX_PROVIDER, "Codex", home.join(".codex/sessions").is_dir(), true, None),
        source(GEMINI_PROVIDER, "Gemini CLI", gemini_root(home).is_dir(), true, None),
        source(
            CURSOR_PROVIDER,
            "Cursor",
            cursor_user_dir(home).join("globalStorage/state.vscdb").is_file(),
            sqlite,
            needs_sqlite("Cursor").as_deref(),
        ),
        source(
            OPENCODE_PROVIDER,
            "OpenCode",
            opencode_db(home).is_file() || opencode_root(home).join("session").is_dir(),
            sqlite || opencode_root(home).join("session").is_dir(),
            needs_sqlite("OpenCode").as_deref(),
        ),
        source(ANTIGRAVITY_PROVIDER, "Antigravity", has_antigravity, sqlite, antigravity_note.as_deref()),
        source(AIDER_PROVIDER, "Aider", true, true, Some("Read from .aider.chat.history.md in the project folder.")),
    ]
}

fn sqlite_available() -> bool {
    Command::new("sqlite3").arg("-version").output().map(|o| o.status.success()).unwrap_or(false)
}

fn run_sqlite(target: &str, readonly: bool, sql: &str) -> Option<Vec<Value>> {
    let mut command = Command::new("sqlite3");
    if readonly {
        command.arg("-readonly");
    }
    let output = command.arg("-json").arg(target).arg(sql).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    if text.trim().is_empty() {
        return Some(Vec::new());
    }
    serde_json::from_str::<Vec<Value>>(&text).ok()
}

/// Rows from an agent's database, read without writing to it. Cursor and
/// OpenCode use WAL mode; when the app is closed there is no `-shm` file and a
/// read-only connection can't create one, so every query fails with
/// SQLITE_CANTOPEN. Then nothing is pending in a WAL either, and opening the
/// file as immutable reads the same data.
fn sqlite_rows(db: &Path, sql: &str) -> Vec<Value> {
    if let Some(rows) = run_sqlite(&db.to_string_lossy(), true, sql) {
        return rows;
    }
    let path = db.to_string_lossy().replace('%', "%25").replace('?', "%3f").replace('#', "%23");
    run_sqlite(&format!("file:{path}?immutable=1"), false, sql).unwrap_or_default()
}

/// Newest change to a SQLite database, counting writes still in its WAL.
fn db_modified_ms(db: &Path) -> Option<i64> {
    let wal = PathBuf::from(format!("{}-wal", db.to_string_lossy()));
    file_modified_ms(db).max(file_modified_ms(&wal))
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
// Gemini CLI: ~/.gemini/tmp/<project>/chats/session-*.json(l). <project> is a
// slug with a `.project_root` file in it (older versions: sha256 of the cwd).
// ---------------------------------------------------------------------------

/// The folder a Gemini CLI project directory belongs to.
fn gemini_project_cwd(dir: &Path, by_hash: &HashMap<String, String>) -> Option<String> {
    if let Ok(text) = std::fs::read_to_string(dir.join(".project_root")) {
        let text = text.trim();
        if !text.is_empty() {
            return Some(text.to_string());
        }
    }
    let name = dir.file_name()?.to_string_lossy().to_string();
    by_hash.get(&name).cloned()
}

fn scan_gemini(home: &Path, filter: Option<&Path>, known: &[PathBuf], out: &mut Vec<CodingSessionSummary>) {
    let root = gemini_root(home);
    let Ok(dirs) = std::fs::read_dir(&root) else { return };
    // Map old-style project hashes back to folders we know about.
    let mut by_hash = HashMap::new();
    for path in known.iter().chain(filter.map(Path::to_path_buf).iter()) {
        by_hash.insert(gemini_project_hash(path), path.to_string_lossy().to_string());
    }
    for dir in dirs.flatten() {
        let cwd = gemini_project_cwd(&dir.path(), &by_hash);
        if cwd.as_deref().map(is_scratch_dir).unwrap_or(false) {
            continue;
        }
        if let Some(filter) = filter {
            match &cwd {
                Some(cwd) if paths_match(Path::new(cwd), filter) => {}
                _ => continue,
            }
        }
        let Ok(chats) = std::fs::read_dir(dir.path().join("chats")) else { continue };
        for chat in chats.flatten() {
            let path = chat.path();
            if !matches!(path.extension().and_then(|e| e.to_str()), Some("json" | "jsonl")) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&path) else { continue };
            let session = parse_gemini_session(&text, &path, cwd.clone());
            if !session.messages.iter().any(|m| m.role == "user") {
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

/// Gemini CLI's JSONL log: a header line, message lines (a message written
/// again replaces the earlier copy) and `{"$set": {...}}` header updates.
/// Folded into the single-document JSON shape older versions wrote.
fn gemini_jsonl_document(text: &str) -> Value {
    let mut header = serde_json::Map::new();
    let mut order: Vec<String> = Vec::new();
    let mut messages: HashMap<String, Value> = HashMap::new();
    for (index, line) in text.lines().enumerate() {
        let Ok(Value::Object(object)) = serde_json::from_str::<Value>(line) else { continue };
        if let Some(Value::Object(patch)) = object.get("$set") {
            header.extend(patch.clone());
        } else if object.contains_key("type") {
            let id = object.get("id").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| format!("line-{index}"));
            if !messages.contains_key(&id) {
                order.push(id.clone());
            }
            messages.insert(id, Value::Object(object));
        } else {
            header.extend(object);
        }
    }
    header.insert("messages".into(), Value::Array(order.iter().filter_map(|id| messages.remove(id)).collect()));
    Value::Object(header)
}

pub(super) fn parse_gemini_session(text: &str, source: &Path, cwd: Option<String>) -> CodingSession {
    let value: Value = if source.extension().and_then(|e| e.to_str()) == Some("jsonl") {
        gemini_jsonl_document(text)
    } else {
        serde_json::from_str(text).unwrap_or(Value::Null)
    };
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
            // Blocks are `{"text": ...}` without a type, so read `.text` directly.
            Some(other) => collect_result_text(other),
            None => String::new(),
        };
        match message.get("type").and_then(Value::as_str).unwrap_or("") {
            // The CLI's own environment preamble, not something the user typed.
            "user" if content.trim_start().starts_with("<session_context>") => {}
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
// OpenCode. Current versions keep sessions in ~/.local/share/opencode/
// opencode.db (`session_v2` + `session_message`, older `session` + `message`
// + `part`); before that, JSON files in storage/session/<project>/<id>.json,
// message/<id>/*.json and part/<messageId>/*.json.
// Database sessions use the source path "<db>#<sessionId>".
// ---------------------------------------------------------------------------

fn scan_opencode(home: &Path, filter: Option<&Path>, out: &mut Vec<CodingSessionSummary>) {
    let mut seen = BTreeSet::new();
    scan_opencode_db(home, filter, &mut seen, out);
    scan_opencode_files(home, filter, &seen, out);
}

fn keep_session_dir(cwd: Option<&str>, filter: Option<&Path>) -> bool {
    match (cwd, filter) {
        (Some(cwd), _) if is_scratch_dir(cwd) => false,
        (Some(cwd), Some(filter)) => paths_match(Path::new(cwd), filter),
        (None, Some(_)) => false,
        _ => true,
    }
}

fn scan_opencode_db(home: &Path, filter: Option<&Path>, seen: &mut BTreeSet<String>, out: &mut Vec<CodingSessionSummary>) {
    let db = opencode_db(home);
    if !db.is_file() || !sqlite_available() {
        return;
    }
    // Sub-agent and archived sessions are left out, and so are sessions
    // nobody typed into (OpenCode starts one whenever it is launched).
    let v2 = sqlite_rows(
        &db,
        "select s.id, s.directory, s.time_updated as updated, \
           coalesce(nullif(s.title, ''), (select json_extract(m.data, '$.text') from session_message m where m.session_id = s.id and m.type = 'user' order by m.seq limit 1)) as title \
         from session_v2 s where s.parent_id is null and s.time_archived is null \
           and exists (select 1 from session_message m where m.session_id = s.id and m.type = 'user') \
         order by s.time_updated desc limit 400",
    );
    let legacy = sqlite_rows(
        &db,
        "select s.id, s.directory, s.time_updated as updated, s.title from session s \
         where s.parent_id is null and s.time_archived is null \
           and exists (select 1 from message m where m.session_id = s.id) \
         order by s.time_updated desc limit 400",
    );
    for row in v2.into_iter().chain(legacy) {
        let Some(id) = row.get("id").and_then(Value::as_str) else { continue };
        let cwd = row.get("directory").and_then(Value::as_str);
        if !keep_session_dir(cwd, filter) || !seen.insert(id.to_string()) {
            continue;
        }
        out.push(summary(
            OPENCODE_PROVIDER,
            id.to_string(),
            row.get("title").and_then(Value::as_str).unwrap_or("OpenCode session").to_string(),
            cwd.map(str::to_string),
            row.get("updated").and_then(Value::as_i64),
            format!("{}#{id}", db.to_string_lossy()),
            0,
        ));
    }
}

fn scan_opencode_files(home: &Path, filter: Option<&Path>, seen: &BTreeSet<String>, out: &mut Vec<CodingSessionSummary>) {
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
        let id = value.get("id").and_then(Value::as_str).unwrap_or_default().to_string();
        if !keep_session_dir(cwd.as_deref(), filter) || seen.contains(&id) {
            continue;
        }
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

/// Collects the transcript of an OpenCode session as it is parsed.
#[derive(Default)]
struct OpenCodeTranscript {
    model: Option<String>,
    messages: Vec<CodingSessionMessage>,
    events: Vec<CodingToolEvent>,
    files: BTreeSet<String>,
    redactions: u32,
}

impl OpenCodeTranscript {
    fn tool(&mut self, name: &str, call_id: Option<String>, input: &Value, status: Option<&str>, output: Option<String>, timestamp: Option<i64>) {
        if let Some(path) = tool_input_path(input) {
            self.files.insert(path);
        }
        push_tool_call(&mut self.events, call_id.clone(), name, summarize_tool_input(name, input), tool_detail(name, input), timestamp, &mut self.redactions);
        if let (Some(call_id), Some(output)) = (call_id, output) {
            attach_tool_result(&mut self.events, &call_id, &output, status == Some("error"), &mut self.redactions);
        }
    }

    fn message(&mut self, role: &str, text: &[String], timestamp: Option<i64>) {
        if role == "user" || role == "assistant" {
            let content = clean_transcript_text(&text.join("\n\n"));
            push_message(&mut self.messages, role, content, timestamp, &mut self.redactions);
        }
    }

    /// A message in the older format: its role and model on the message, the
    /// text and tool calls in separate parts.
    fn legacy_message(&mut self, message: &Value, parts: Vec<Value>) {
        let role = message.get("role").and_then(Value::as_str).unwrap_or("");
        let timestamp = message.pointer("/time/created").and_then(Value::as_i64);
        if self.model.is_none() {
            self.model = message
                .get("modelID")
                .or_else(|| message.pointer("/model/modelID"))
                .and_then(Value::as_str)
                .map(str::to_string);
        }
        let mut text = Vec::new();
        for part in parts {
            match part.get("type").and_then(Value::as_str).unwrap_or("") {
                "text" if !part.get("synthetic").and_then(Value::as_bool).unwrap_or(false) => {
                    if let Some(t) = part.get("text").and_then(Value::as_str) {
                        text.push(t.to_string());
                    }
                }
                "tool" => {
                    let name = part.get("tool").and_then(Value::as_str).unwrap_or("tool");
                    let input = part.pointer("/state/input").cloned().unwrap_or(Value::Null);
                    let call_id = part.get("callID").and_then(Value::as_str).map(str::to_string);
                    let output = part.pointer("/state/output").and_then(Value::as_str).map(str::to_string);
                    self.tool(name, call_id, &input, part.pointer("/state/status").and_then(Value::as_str), output, timestamp);
                }
                _ => {}
            }
        }
        self.message(role, &text, timestamp);
    }

    fn finish(self, source: &Path, mut session: CodingSession) -> CodingSession {
        session.model = session.model.or(self.model);
        finalize_session(OPENCODE_PROVIDER, source, session, self.messages, self.events, self.files, self.redactions)
    }
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
    let mut transcript = OpenCodeTranscript::default();
    for message in read_json_dir(&storage.join("message").join(&id)) {
        let message_id = message.get("id").and_then(Value::as_str).unwrap_or("").to_string();
        transcript.legacy_message(&message, read_json_dir(&storage.join("part").join(message_id)));
    }
    Ok(transcript.finish(session_file, session))
}

/// `session_message` rows of a `session_v2` session, in order.
pub(super) fn parse_opencode_v2(session: CodingSession, rows: &[Value], source: &Path) -> CodingSession {
    let mut transcript = OpenCodeTranscript::default();
    for row in rows {
        let kind = row.get("type").and_then(Value::as_str).unwrap_or("");
        let Some(data) = row.get("data").and_then(Value::as_str).and_then(|d| serde_json::from_str::<Value>(d).ok()) else { continue };
        let timestamp = data.pointer("/time/created").and_then(Value::as_i64);
        match kind {
            "user" => {
                let text = data.get("text").and_then(Value::as_str).unwrap_or("").to_string();
                transcript.message("user", &[text], timestamp);
            }
            "assistant" => {
                if transcript.model.is_none() {
                    transcript.model = data.pointer("/model/id").and_then(Value::as_str).map(str::to_string);
                }
                let mut text = Vec::new();
                for block in data.get("content").and_then(Value::as_array).into_iter().flatten() {
                    match block.get("type").and_then(Value::as_str).unwrap_or("") {
                        "text" => text.extend(block.get("text").and_then(Value::as_str).map(str::to_string)),
                        "tool" => {
                            let name = block.get("name").and_then(Value::as_str).unwrap_or("tool");
                            let input = block.pointer("/state/input").cloned().unwrap_or(Value::Null);
                            let output = block
                                .pointer("/state/content")
                                .or_else(|| block.pointer("/state/output"))
                                .map(collect_result_text);
                            let call_id = block.get("id").and_then(Value::as_str).map(str::to_string);
                            transcript.tool(name, call_id, &input, block.pointer("/state/status").and_then(Value::as_str), output, timestamp);
                        }
                        _ => {}
                    }
                }
                transcript.message("assistant", &text, timestamp);
            }
            _ => {}
        }
    }
    transcript.finish(source, session)
}

fn read_opencode_db(home: &Path, source: &str) -> Result<CodingSession, String> {
    let (db, id) = source.rsplit_once('#').ok_or("Not an OpenCode session.")?;
    let expected = opencode_db(home);
    if canonical_or_original(Path::new(db)) != canonical_or_original(&expected) {
        return Err("The session is outside OpenCode's history folder.".into());
    }
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("Invalid OpenCode session id.".into());
    }
    let db = Path::new(db);
    let query = |table: &str| {
        sqlite_rows(db, &format!("select directory, title, time_created as created, time_updated as updated from {table} where id = '{id}'"))
            .into_iter()
            .next()
    };
    let start = |row: &Value| {
        let mut session = empty_session(
            OPENCODE_PROVIDER,
            id.to_string(),
            row.get("title").and_then(Value::as_str).unwrap_or_default().to_string(),
            row.get("directory").and_then(Value::as_str).map(str::to_string),
        );
        session.started_at = row.get("created").and_then(Value::as_i64);
        session.last_activity = row.get("updated").and_then(Value::as_i64);
        session
    };
    let mut session = if let Some(row) = query("session_v2") {
        let rows = sqlite_rows(db, &format!("select type, data from session_message where session_id = '{id}' order by seq"));
        parse_opencode_v2(start(&row), &rows, db)
    } else if let Some(row) = query("session") {
        let messages = sqlite_rows(db, &format!("select id, data from message where session_id = '{id}' order by time_created, id"));
        let mut parts: HashMap<String, Vec<Value>> = HashMap::new();
        for part in sqlite_rows(db, &format!("select message_id, data from part where session_id = '{id}' order by time_created, id")) {
            let (Some(message_id), Some(data)) = (part.get("message_id").and_then(Value::as_str), part.get("data").and_then(Value::as_str)) else { continue };
            if let Ok(data) = serde_json::from_str::<Value>(data) {
                parts.entry(message_id.to_string()).or_default().push(data);
            }
        }
        let mut transcript = OpenCodeTranscript::default();
        for row in messages {
            let (Some(message_id), Some(data)) = (row.get("id").and_then(Value::as_str), row.get("data").and_then(Value::as_str)) else { continue };
            let Ok(message) = serde_json::from_str::<Value>(data) else { continue };
            transcript.legacy_message(&message, parts.remove(message_id).unwrap_or_default());
        }
        transcript.finish(db, start(&row))
    } else {
        return Err("OpenCode session not found.".into());
    };
    session.source_path = source.to_string();
    Ok(session)
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

/// Cursor's workspace folders, and which chats each one listed. Newer Cursor
/// versions stopped listing chats per workspace; `cursor_chat_folder` then
/// works the folder out from the files the chat touched.
struct CursorWorkspaces {
    by_chat: HashMap<String, String>,
    folders: Vec<String>,
}

fn cursor_workspaces(home: &Path) -> CursorWorkspaces {
    let mut workspaces = CursorWorkspaces { by_chat: HashMap::new(), folders: Vec::new() };
    let Ok(entries) = std::fs::read_dir(cursor_user_dir(home).join("workspaceStorage")) else { return workspaces };
    for entry in entries.flatten() {
        let Ok(text) = std::fs::read_to_string(entry.path().join("workspace.json")) else { continue };
        let Ok(value) = serde_json::from_str::<Value>(&text) else { continue };
        let Some(folder) = value.get("folder").and_then(Value::as_str) else { continue };
        let folder = file_uri_path(folder);
        workspaces.folders.push(folder.clone());
        let db = entry.path().join("state.vscdb");
        if !db.is_file() {
            continue;
        }
        for row in sqlite_rows(&db, "select value from ItemTable where key = 'composer.composerData'") {
            let Some(raw) = row.get("value").and_then(Value::as_str) else { continue };
            let Ok(data) = serde_json::from_str::<Value>(raw) else { continue };
            for composer in data.get("allComposers").and_then(Value::as_array).into_iter().flatten() {
                if let Some(id) = composer.get("composerId").and_then(Value::as_str) {
                    workspaces.by_chat.insert(id.to_string(), folder.clone());
                }
            }
        }
    }
    // Longest first, so a nested workspace wins over its parent.
    workspaces.folders.sort_by_key(|folder| std::cmp::Reverse(folder.len()));
    workspaces.folders.dedup();
    workspaces
}

/// `file:///Users/me/My%20App` -> `/Users/me/My App`.
fn file_uri_path(uri: &str) -> String {
    let path = uri.strip_prefix("file://").unwrap_or(uri);
    let bytes = path.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// The folder a Cursor chat ran in: the workspace that listed it, else the
/// workspace (or git repo) holding the files it changed.
fn cursor_chat_folder(id: &str, file_states: Option<&str>, workspaces: &CursorWorkspaces) -> Option<String> {
    if let Some(folder) = workspaces.by_chat.get(id) {
        return Some(folder.clone());
    }
    let states: Value = serde_json::from_str(file_states?).ok()?;
    let file = file_uri_path(states.as_object()?.keys().next()?);
    if let Some(folder) = workspaces.folders.iter().find(|folder| Path::new(&file).starts_with(folder)) {
        return Some(folder.clone());
    }
    resolve_project_root(Path::new(&file).parent()?).map(|root| root.to_string_lossy().to_string())
}

fn scan_cursor(home: &Path, filter: Option<&Path>, out: &mut Vec<CodingSessionSummary>) {
    let db = cursor_user_dir(home).join("globalStorage/state.vscdb");
    if !db.is_file() || !sqlite_available() {
        return;
    }
    let workspaces = cursor_workspaces(home);
    // Chats with messages: older ones keep them inline (`conversation`), newer
    // ones in `bubbleId:<chat>:<bubble>` rows.
    let rows = sqlite_rows(
        &db,
        "select key, json_extract(value,'$.name') as name, json_extract(value,'$.lastUpdatedAt') as updated, length(value) as size, \
           json_extract(value,'$.originalFileStates') as files \
         from cursorDiskKV where key like 'composerData:%' \
           and (json_array_length(json_extract(value,'$.conversation')) > 0 \
             or exists (select 1 from cursorDiskKV b where b.key >= 'bubbleId:' || substr(cursorDiskKV.key, 14) || ':' \
                          and b.key < 'bubbleId:' || substr(cursorDiskKV.key, 14) || ';')) \
         order by updated desc limit 300",
    );
    for row in rows {
        let Some(key) = row.get("key").and_then(Value::as_str) else { continue };
        let id = key.trim_start_matches("composerData:").to_string();
        let cwd = cursor_chat_folder(&id, row.get("files").and_then(Value::as_str), &workspaces);
        if let Some(filter) = filter {
            match &cwd {
                Some(cwd) if paths_match(Path::new(cwd), filter) => {}
                _ => continue,
            }
        }
        out.push(summary(
            CURSOR_PROVIDER,
            id.clone(),
            row.get("name").and_then(Value::as_str).unwrap_or("Cursor chat").to_string(),
            cwd,
            row.get("updated").and_then(Value::as_i64),
            format!("{}#{id}", db.to_string_lossy()),
            row.get("size").and_then(Value::as_u64).unwrap_or(0),
        ));
    }
}

fn sql_quote(text: &str) -> String {
    text.replace('\'', "''")
}

/// When a Cursor bubble was written: epoch ms or an ISO string, by version.
fn cursor_bubble_time(bubble: &Value) -> Option<i64> {
    bubble
        .pointer("/timingInfo/clientStartTime")
        .and_then(Value::as_f64)
        .map(|t| t as i64)
        .or_else(|| bubble.get("startedAtMs").and_then(Value::as_i64))
        .or_else(|| bubble.get("createdAt").and_then(Value::as_i64))
        .or_else(|| bubble.get("createdAt").and_then(Value::as_str).and_then(parse_iso_ms))
}

pub(super) fn parse_cursor_composer(composer: &Value, bubbles: &HashMap<String, Value>, source: &Path, cwd: Option<String>) -> CodingSession {
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
    if turns.is_empty() {
        // Newer versions keep no header list on the chat: order its bubbles by time.
        turns = bubbles.values().cloned().collect();
        turns.sort_by_key(|bubble| cursor_bubble_time(bubble).unwrap_or(0));
    }
    for turn in turns {
        let text = turn.get("text").and_then(Value::as_str).unwrap_or("");
        let role = match turn.get("type").and_then(Value::as_i64) {
            Some(1) => "user",
            Some(2) => "assistant",
            _ => continue,
        };
        push_message(&mut messages, role, clean_transcript_text(text), cursor_bubble_time(&turn), &mut redactions);
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
    let mut bubbles = HashMap::new();
    if composer.get("conversation").and_then(Value::as_array).map(|a| a.is_empty()).unwrap_or(true) {
        let sql = format!(
            "select key, value from cursorDiskKV where key >= 'bubbleId:{id}:' and key < 'bubbleId:{id};'",
            id = sql_quote(id)
        );
        for row in sqlite_rows(db, &sql) {
            let (Some(key), Some(value)) = (row.get("key").and_then(Value::as_str), row.get("value").and_then(Value::as_str)) else { continue };
            if let Ok(value) = serde_json::from_str::<Value>(value) {
                // Keyed by everything after "bubbleId:<chat>:" (ids may contain '/' or ':').
                let bubble = key.splitn(3, ':').nth(2).unwrap_or_default().to_string();
                bubbles.insert(bubble, value);
            }
        }
    }
    let file_states = composer.get("originalFileStates").map(Value::to_string);
    let cwd = cursor_chat_folder(id, file_states.as_deref(), &cursor_workspaces(home));
    let mut session = parse_cursor_composer(&composer, &bubbles, db, cwd);
    session.source_path = source.to_string();
    Ok(session)
}

// ---------------------------------------------------------------------------
// Antigravity: ~/.gemini/antigravity/conversations/<id>.db, one SQLite file
// per conversation. Each row of `steps` is a protobuf message; there is no
// published schema, so only the fields below are read:
//   step.5.1          when it happened (seconds, nanos)
//   step.19           user input: .2 the full text (.3.1 its chunks)
//   step.20           agent reply: .1 the text, .7 tool calls (.1 id, .2 name,
//                     .3 arguments as JSON)
//   trajectory_metadata_blob 'main': .7 (or .1.1) the workspace URI
// Older conversations are encrypted `.pb` files and can't be read.
// ---------------------------------------------------------------------------

const ANTIGRAVITY_USER_INPUT: i64 = 14;
const ANTIGRAVITY_PLANNER_RESPONSE: i64 = 15;

/// One field of a protobuf message.
enum Pb<'a> {
    Varint(u64),
    Bytes(&'a [u8]),
}

fn pb_varint(buf: &[u8], pos: &mut usize) -> Option<u64> {
    let mut value = 0u64;
    for shift in (0..64).step_by(7) {
        let byte = *buf.get(*pos)?;
        *pos += 1;
        value |= u64::from(byte & 0x7f) << shift;
        if byte < 0x80 {
            return Some(value);
        }
    }
    None
}

/// The fields of a protobuf message, or None when `buf` isn't one.
fn pb_fields(buf: &[u8]) -> Option<Vec<(u64, Pb<'_>)>> {
    let mut fields = Vec::new();
    let mut pos = 0;
    while pos < buf.len() {
        let key = pb_varint(buf, &mut pos)?;
        let (field, wire) = (key >> 3, key & 7);
        if field == 0 {
            return None;
        }
        match wire {
            0 => fields.push((field, Pb::Varint(pb_varint(buf, &mut pos)?))),
            1 => pos += 8,
            2 => {
                let len = usize::try_from(pb_varint(buf, &mut pos)?).ok()?;
                let end = pos.checked_add(len).filter(|end| *end <= buf.len())?;
                fields.push((field, Pb::Bytes(&buf[pos..end])));
                pos = end;
            }
            5 => pos += 4,
            _ => return None,
        }
    }
    (pos == buf.len()).then_some(fields)
}

fn pb_bytes(buf: &[u8], field: u64) -> Option<&[u8]> {
    pb_fields(buf)?.into_iter().find_map(|(f, v)| match v {
        Pb::Bytes(bytes) if f == field => Some(bytes),
        _ => None,
    })
}

fn pb_all_bytes(buf: &[u8], field: u64) -> Vec<&[u8]> {
    pb_fields(buf)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|(f, v)| match v {
            Pb::Bytes(bytes) if f == field => Some(bytes),
            _ => None,
        })
        .collect()
}

fn pb_varint_field(buf: &[u8], field: u64) -> Option<u64> {
    pb_fields(buf)?.into_iter().find_map(|(f, v)| match v {
        Pb::Varint(value) if f == field => Some(value),
        _ => None,
    })
}

fn pb_string(buf: &[u8], path: &[u64]) -> Option<String> {
    let mut current = buf;
    for field in path {
        current = pb_bytes(current, *field)?;
    }
    std::str::from_utf8(current).ok().map(str::to_string)
}

fn from_hex(text: &str) -> Vec<u8> {
    text.as_bytes()
        .chunks(2)
        .filter_map(|pair| u8::from_str_radix(std::str::from_utf8(pair).ok()?, 16).ok())
        .collect()
}

fn antigravity_workspace(db: &Path) -> Option<String> {
    if let Some(cwd) = std::fs::read_to_string(db.with_extension("meta"))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|meta| meta.get("cwd")?.as_str().map(str::to_string))
        .filter(|cwd| !cwd.trim().is_empty())
    {
        return Some(cwd);
    }
    let row = sqlite_rows(db, "select hex(data) as data from trajectory_metadata_blob where id = 'main'").into_iter().next()?;
    let blob = from_hex(row.get("data")?.as_str()?);
    let uri = pb_string(&blob, &[7]).filter(|uri| !uri.is_empty()).or_else(|| pb_string(&blob, &[1, 1]))?;
    Some(file_uri_path(&uri))
}

fn antigravity_step_time(step: &[u8]) -> Option<i64> {
    let time = pb_bytes(pb_bytes(step, 5)?, 1)?;
    let seconds = i64::try_from(pb_varint_field(time, 1)?).ok()?;
    let nanos = pb_varint_field(time, 2).unwrap_or(0) as i64;
    Some(seconds * 1000 + nanos / 1_000_000)
}

fn antigravity_user_text(step: &[u8]) -> String {
    let Some(input) = pb_bytes(step, 19) else { return String::new() };
    pb_string(input, &[2]).filter(|t| !t.trim().is_empty()).unwrap_or_else(|| {
        pb_all_bytes(input, 3).into_iter().filter_map(|chunk| pb_string(chunk, &[1])).collect::<String>()
    })
}

/// Parses a conversation's user and agent steps (`(step_type, payload)`, in order).
pub(super) fn parse_antigravity_steps(id: String, cwd: Option<String>, steps: &[(i64, Vec<u8>)], source: &Path) -> CodingSession {
    let mut session = empty_session(ANTIGRAVITY_PROVIDER, id, String::new(), cwd);
    let mut messages = Vec::new();
    let mut events = Vec::new();
    let mut files = BTreeSet::new();
    let mut redactions = 0u32;
    for (kind, step) in steps {
        let timestamp = antigravity_step_time(step);
        session.started_at = session.started_at.or(timestamp);
        session.last_activity = timestamp.or(session.last_activity);
        match *kind {
            ANTIGRAVITY_USER_INPUT => {
                push_message(&mut messages, "user", clean_transcript_text(&antigravity_user_text(step)), timestamp, &mut redactions);
            }
            ANTIGRAVITY_PLANNER_RESPONSE => {
                let Some(reply) = pb_bytes(step, 20) else { continue };
                for call in pb_all_bytes(reply, 7) {
                    let name = pb_string(call, &[2]).unwrap_or_else(|| "tool".into());
                    let args = pb_string(call, &[3]).and_then(|a| serde_json::from_str::<Value>(&a).ok()).unwrap_or(Value::Null);
                    if let Some(path) = tool_input_path(&args) {
                        files.insert(path);
                    }
                    push_tool_call(&mut events, pb_string(call, &[1]), &name, summarize_tool_input(&name, &args), tool_detail(&name, &args), timestamp, &mut redactions);
                }
                let text = pb_string(reply, &[1]).filter(|t| !t.trim().is_empty()).or_else(|| pb_string(reply, &[8])).unwrap_or_default();
                push_message(&mut messages, "assistant", clean_transcript_text(&text), timestamp, &mut redactions);
            }
            _ => {}
        }
    }
    finalize_session(ANTIGRAVITY_PROVIDER, source, session, messages, events, files, redactions)
}

fn scan_antigravity(home: &Path, filter: Option<&Path>, out: &mut Vec<CodingSessionSummary>) {
    if !sqlite_available() {
        return;
    }
    for root in antigravity_roots(home) {
        let Ok(entries) = std::fs::read_dir(root) else { continue };
        for entry in entries.flatten() {
            let db = entry.path();
            if db.extension().and_then(|e| e.to_str()) != Some("db") {
                continue;
            }
            let cwd = antigravity_workspace(&db);
            if !keep_session_dir(cwd.as_deref(), filter) {
                continue;
            }
            let first = sqlite_rows(&db, &format!("select hex(step_payload) as p from steps where step_type = {ANTIGRAVITY_USER_INPUT} order by idx limit 1"));
            let Some(step) = first.first().and_then(|r| r.get("p")).and_then(Value::as_str).map(from_hex) else { continue };
            let title = antigravity_user_text(&step);
            if title.trim().is_empty() {
                continue;
            }
            let id = db.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            out.push(summary(
                ANTIGRAVITY_PROVIDER,
                id,
                title.lines().find(|l| !l.trim().is_empty()).unwrap_or("").to_string(),
                cwd,
                db_modified_ms(&db),
                db.to_string_lossy().to_string(),
                std::fs::metadata(&db).map(|m| m.len()).unwrap_or(0),
            ));
        }
    }
}

fn read_antigravity(db: &Path) -> Result<CodingSession, String> {
    let rows = sqlite_rows(
        db,
        &format!("select step_type as t, hex(step_payload) as p from steps where step_type in ({ANTIGRAVITY_USER_INPUT}, {ANTIGRAVITY_PLANNER_RESPONSE}) order by idx"),
    );
    if rows.is_empty() {
        return Err("Could not read this Antigravity conversation.".into());
    }
    let steps: Vec<(i64, Vec<u8>)> = rows
        .iter()
        .filter_map(|row| Some((row.get("t")?.as_i64()?, from_hex(row.get("p")?.as_str()?))))
        .collect();
    let id = db.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let mut session = parse_antigravity_steps(id, antigravity_workspace(db), &steps, db);
    session.last_activity = db_modified_ms(db).or(session.last_activity);
    Ok(session)
}

// ---------------------------------------------------------------------------
// Entry points used by the main scanner / reader.
// ---------------------------------------------------------------------------

/// One agent's scanner: home, project filter, known project roots, results.
type AgentScan = fn(&Path, Option<&Path>, &[PathBuf], &mut Vec<CodingSessionSummary>);

pub(super) fn scan_more(home: &Path, filter: Option<&Path>, known_roots: &[PathBuf], out: &mut Vec<CodingSessionSummary>) {
    // Each agent's scan mostly waits on sqlite3 processes, so run them side by side.
    let found: Vec<Vec<CodingSessionSummary>> = std::thread::scope(|scope| {
        let scans: [AgentScan; 4] = [
            |home, filter, known, out| scan_gemini(home, filter, known, out),
            |home, filter, _, out| scan_opencode(home, filter, out),
            |home, filter, _, out| scan_cursor(home, filter, out),
            |home, filter, _, out| scan_antigravity(home, filter, out),
        ];
        let handles: Vec<_> = scans
            .into_iter()
            .map(|scan| {
                scope.spawn(move || {
                    let mut found = Vec::new();
                    scan(home, filter, known_roots, &mut found);
                    found
                })
            })
            .collect();
        handles.into_iter().filter_map(|handle| handle.join().ok()).collect()
    });
    out.extend(found.into_iter().flatten());
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
            // <project>/chats/<file>: the project folder knows where it ran.
            let cwd = path.parent().and_then(Path::parent).and_then(|dir| gemini_project_cwd(dir, &HashMap::new()));
            Ok(parse_gemini_session(&text, &path, cwd))
        }),
        OPENCODE_PROVIDER if source.contains('#') => read_opencode_db(home, source),
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
        ANTIGRAVITY_PROVIDER => {
            let roots = antigravity_roots(home);
            let checked = roots
                .iter()
                .find_map(|root| inside(root.clone()).ok())
                .ok_or_else(|| "The session is outside the agent's history folder.".to_string());
            checked.and_then(|path| {
                if path.extension().and_then(|e| e.to_str()) != Some("db") {
                    return Err("Only newer Antigravity conversations can be read; older ones are encrypted.".into());
                }
                read_antigravity(&path)
            })
        }
        _ => return None,
    })
}

/// Modified time for change detection (databases: including their WAL).
pub(super) fn updated_at_more(home: &Path, provider: &str, source: &str) -> Option<Result<i64, String>> {
    let modified = match provider {
        CURSOR_PROVIDER | OPENCODE_PROVIDER if source.contains('#') => {
            db_modified_ms(Path::new(source.rsplit_once('#').map(|(db, _)| db).unwrap_or(source)))
        }
        ANTIGRAVITY_PROVIDER => db_modified_ms(Path::new(source)),
        GEMINI_PROVIDER | OPENCODE_PROVIDER | AIDER_PROVIDER => file_modified_ms(Path::new(source)),
        _ => return None,
    };
    let _ = home;
    Some(modified.ok_or_else(|| "Could not read the session timestamp.".to_string()))
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
        let mut bubbles = HashMap::new();
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
    fn parses_gemini_jsonl_and_skips_session_context() {
        let text = [
            r#"{"sessionId":"g2","startTime":"2026-01-01T00:00:00Z","lastUpdated":"2026-01-01T00:00:00Z","kind":"main"}"#,
            r#"{"id":"u0","type":"user","content":[{"text":"<session_context>\nThis is the Gemini CLI.</session_context>"}]}"#,
            r#"{"id":"u1","type":"user","content":[{"text":"Fix the build"}],"timestamp":"2026-01-01T00:00:01Z"}"#,
            r#"{"id":"a1","type":"gemini","content":"Working","timestamp":"2026-01-01T00:00:02Z"}"#,
            r#"{"id":"a1","type":"gemini","content":"Fixed the build.","model":"gemini-3-pro","timestamp":"2026-01-01T00:00:03Z"}"#,
            r#"{"$set":{"lastUpdated":"2026-01-01T00:09:00Z"}}"#,
        ]
        .join("\n");
        let session = parse_gemini_session(&text, Path::new("/tmp/chats/session-1.jsonl"), None);
        let contents: Vec<&str> = session.messages.iter().map(|m| m.content.as_str()).collect();
        assert_eq!(contents, vec!["Fix the build", "Fixed the build."]);
        assert_eq!(session.session_id, "g2");
        assert_eq!(session.last_activity, parse_iso_ms("2026-01-01T00:09:00Z"));
    }

    #[test]
    fn parses_opencode_v2_messages() {
        let rows = vec![
            serde_json::json!({"type": "model-switched", "data": r#"{"model":{"id":"m"}}"#}),
            serde_json::json!({"type": "user", "data": r#"{"time":{"created":1},"text":"Review the app"}"#}),
            serde_json::json!({"type": "assistant", "data": r#"{"time":{"created":2},"model":{"id":"kimi"},"content":[
                {"type":"tool","id":"c1","name":"read","state":{"status":"completed","input":{"path":"src/a.ts"},"content":[{"type":"text","text":"file body"}]}},
                {"type":"text","text":"Looks good."}]}"#}),
        ];
        let start = empty_session(OPENCODE_PROVIDER, "ses1".into(), "Review".into(), Some("/tmp/x".into()));
        let session = parse_opencode_v2(start, &rows, Path::new("/tmp/opencode.db"));
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.messages[1].content, "Looks good.");
        assert_eq!(session.model.as_deref(), Some("kimi"));
        assert_eq!(session.tool_events[0].output.as_deref(), Some("file body"));
    }

    #[test]
    fn orders_cursor_bubbles_without_headers() {
        let composer = serde_json::json!({"composerId": "c", "name": "Build errors", "fullConversationHeadersOnly": []});
        let mut bubbles = HashMap::new();
        bubbles.insert("b/s:0".to_string(), serde_json::json!({"type": 2, "text": "", "createdAt": "2026-01-01T00:00:02Z"}));
        bubbles.insert("b/s:1".to_string(), serde_json::json!({"type": 2, "text": "Fixed.", "createdAt": "2026-01-01T00:00:03Z"}));
        bubbles.insert("b".to_string(), serde_json::json!({"type": 1, "text": "Fix the errors", "createdAt": "2026-01-01T00:00:01Z"}));
        let session = parse_cursor_composer(&composer, &bubbles, Path::new("/tmp/state.vscdb"), None);
        let roles: Vec<&str> = session.messages.iter().map(|m| m.role.as_str()).collect();
        assert_eq!(roles, vec!["user", "assistant"]);
        assert_eq!(session.messages[1].content, "Fixed.");
    }

    #[test]
    fn cursor_folder_from_changed_files() {
        let workspaces = CursorWorkspaces { by_chat: HashMap::new(), folders: vec!["/Users/me/My App".into()] };
        let states = r#"{"file:///Users/me/My%20App/src/main.ts":{}}"#;
        assert_eq!(cursor_chat_folder("x", Some(states), &workspaces).as_deref(), Some("/Users/me/My App"));
    }

    /// Protobuf encoding helpers for the Antigravity test.
    fn pb_len(field: u64, body: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        for mut value in [(field << 3) | 2, body.len() as u64] {
            loop {
                let byte = (value & 0x7f) as u8;
                value >>= 7;
                out.push(if value == 0 { byte } else { byte | 0x80 });
                if value == 0 {
                    break;
                }
            }
        }
        out.extend_from_slice(body);
        out
    }

    fn pb_var(field: u64, value: u64) -> Vec<u8> {
        let mut out = vec![(field << 3) as u8];
        let mut value = value;
        loop {
            let byte = (value & 0x7f) as u8;
            value >>= 7;
            out.push(if value == 0 { byte } else { byte | 0x80 });
            if value == 0 {
                break;
            }
        }
        out
    }

    #[test]
    fn parses_antigravity_steps() {
        let time = [pb_var(1, 1_790_000_000), pb_var(2, 500_000_000)].concat();
        let meta = pb_len(5, &pb_len(1, &time));
        let user = [pb_var(1, 14), meta.clone(), pb_len(19, &pb_len(2, b"Add dark mode"))].concat();
        let call = [pb_len(1, b"call_1"), pb_len(2, b"view_file"), pb_len(3, br#"{"AbsolutePath":"/p/a.ts"}"#)].concat();
        let reply = [pb_var(1, 15), meta, pb_len(20, &[pb_len(3, b"thinking"), pb_len(7, &call), pb_len(1, b"Dark mode is in.")].concat())].concat();
        let steps = vec![(14, user), (15, reply)];
        let session = parse_antigravity_steps("conv".into(), Some("/p".into()), &steps, Path::new("/tmp/conv.db"));
        let contents: Vec<&str> = session.messages.iter().map(|m| m.content.as_str()).collect();
        assert_eq!(contents, vec!["Add dark mode", "Dark mode is in."]);
        assert_eq!(session.started_at, Some(1_790_000_000_500));
        assert_eq!(session.tool_events.len(), 1);
        assert!(pb_fields(b"\xff\xff").is_none());
    }

    #[test]
    fn scratch_dirs_are_skipped() {
        assert!(is_scratch_dir("/var/folders/1k/x/T/kontinue-acp-probe"));
        assert!(is_scratch_dir("/private/tmp/acptest"));
        assert!(!is_scratch_dir("/Users/me/projects/app"));
    }

    #[test]
    fn gemini_hash_is_sha256_of_path() {
        let hash = gemini_project_hash(Path::new("/definitely/not/here"));
        assert_eq!(hash.len(), 64);
    }
}

