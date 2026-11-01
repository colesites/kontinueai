// Local coding-session import bridge.
//
// Discovers and parses the on-disk transcripts that Claude Code and OpenAI Codex
// already keep on this machine, normalizes them into a provider-independent
// shape, and gathers the live project state (git + project instructions) so the
// Kode agent can continue the work instead of starting over.
//
// Everything here runs locally in the Tauri process. Transcripts are only sent
// to Convex after the user explicitly confirms the import in the UI.

use regex::Regex;
use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

const CLAUDE_PROVIDER: &str = "claude_code";
const CODEX_PROVIDER: &str = "codex";

// Keep imports bounded so one enormous transcript can't blow past Convex's
// per-message document size or the model context window. Older turns beyond the
// cap are dropped and flagged in the UI.
const MAX_MESSAGES: usize = 400;
const MAX_TOTAL_MESSAGE_CHARS: usize = 300_000;
const MAX_MESSAGE_CHARS: usize = 24_000;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CodingSessionSummary {
    provider: String,
    session_id: String,
    title: String,
    project_path: Option<String>,
    project_root: Option<String>,
    project_exists: bool,
    git_branch: Option<String>,
    model: Option<String>,
    last_activity: Option<i64>,
    source_path: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CodingSessionMessage {
    role: String,
    content: String,
    timestamp: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CodingToolEvent {
    name: String,
    summary: String,
    timestamp: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CodingSession {
    provider: String,
    session_id: String,
    title: String,
    project_path: Option<String>,
    project_root: Option<String>,
    git_branch: Option<String>,
    model: Option<String>,
    started_at: Option<i64>,
    last_activity: Option<i64>,
    source_path: String,
    messages: Vec<CodingSessionMessage>,
    tool_events: Vec<CodingToolEvent>,
    files_changed: Vec<String>,
    messages_dropped: u32,
    redactions: u32,
    truncated: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CodingInstruction {
    path: String,
    content: String,
    truncated: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CodingProjectState {
    root: String,
    branch: Option<String>,
    status: String,
    diff_stat: String,
    recent_commits: Vec<String>,
    changed_files: Vec<String>,
    instructions: Vec<CodingInstruction>,
    scripts: Vec<String>,
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

fn home_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .home_dir()
        .map_err(|error| format!("Could not resolve the home directory: {error}"))
}

fn provider_history_root(home: &Path, provider: &str) -> Result<PathBuf, String> {
    match provider {
        CLAUDE_PROVIDER => Ok(home.join(".claude").join("projects")),
        CODEX_PROVIDER => Ok(home.join(".codex").join("sessions")),
        _ => Err(format!("Unsupported coding session provider: {provider}")),
    }
}

pub(crate) fn canonical_or_original(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn paths_match(session: &Path, filter: &Path) -> bool {
    let session = canonical_or_original(session);
    let filter = canonical_or_original(filter);
    session == filter || session.starts_with(&filter)
}

/// Resolve the actual project root from a coding session's working directory.
/// Claude/Codex often run inside a subdirectory (`apps/compute-worker`), which is
/// not the project the user thinks of — the git/workspace root is.
fn resolve_project_root(cwd: &Path) -> Option<PathBuf> {
    let start = canonical_or_original(cwd);
    if !start.is_dir() {
        return None;
    }

    for ancestor in start.ancestors() {
        if ancestor.join(".git").exists() {
            return Some(ancestor.to_path_buf());
        }
    }

    // Non-git workspace roots (pnpm/turbo/nx/lerna/rush).
    for ancestor in start.ancestors() {
        let is_workspace = [
            "pnpm-workspace.yaml",
            "turbo.json",
            "nx.json",
            "lerna.json",
            "rush.json",
        ]
        .iter()
        .any(|marker| ancestor.join(marker).exists());
        if is_workspace {
            return Some(ancestor.to_path_buf());
        }
    }

    None
}

fn file_modified_ms(path: &Path) -> Option<i64> {
    std::fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
}

fn read_head(path: &Path, max_bytes: usize) -> String {
    let Ok(file) = File::open(path) else {
        return String::new();
    };
    let mut buffer = Vec::new();
    let _ = file.take(max_bytes as u64).read_to_end(&mut buffer);
    String::from_utf8_lossy(&buffer).to_string()
}

fn read_tail(path: &Path, max_bytes: usize) -> String {
    let Ok(mut file) = File::open(path) else {
        return String::new();
    };
    let Ok(meta) = file.metadata() else {
        return String::new();
    };
    let start = meta.len().saturating_sub(max_bytes as u64);
    if file.seek(SeekFrom::Start(start)).is_err() {
        return String::new();
    }
    let mut buffer = Vec::new();
    let _ = file.take(max_bytes as u64).read_to_end(&mut buffer);
    let text = String::from_utf8_lossy(&buffer).to_string();
    if start > 0 {
        // The first line is likely a partial fragment of a JSON object.
        text.split_once('\n')
            .map(|(_, rest)| rest.to_string())
            .unwrap_or_default()
    } else {
        text
    }
}

fn parse_iso_ms(raw: &str) -> Option<i64> {
    let s = raw.trim();
    if s.len() < 19 {
        return None;
    }
    let year: i64 = s.get(0..4)?.parse().ok()?;
    let month: i64 = s.get(5..7)?.parse().ok()?;
    let day: i64 = s.get(8..10)?.parse().ok()?;
    let hour: i64 = s.get(11..13)?.parse().ok()?;
    let minute: i64 = s.get(14..16)?.parse().ok()?;
    let second: i64 = s.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut millis = 0i64;
    if let Some(rest) = s.get(19..) {
        if let Some(fraction) = rest.strip_prefix('.') {
            let digits: String = fraction
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if !digits.is_empty() {
                let padded = format!("{:0<3}", &digits[..digits.len().min(3)]);
                millis = padded.parse().ok()?;
            }
        }
    }

    Some(
        (days_from_civil(year, month, day) * 86_400 + hour * 3_600 + minute * 60 + second) * 1_000
            + millis,
    )
}

// Howard Hinnant's days-from-civil algorithm (no chrono dependency needed).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = year - i64::from(month <= 2);
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let month_adjusted = month + if month > 2 { -3 } else { 9 };
    let doy = (153 * month_adjusted + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn json_timestamp(value: &Value) -> Option<i64> {
    value
        .get("timestamp")
        .and_then(Value::as_str)
        .and_then(parse_iso_ms)
        .or_else(|| {
            value
                .get("payload")
                .and_then(|payload| payload.get("timestamp"))
                .and_then(Value::as_str)
                .and_then(parse_iso_ms)
        })
}

fn walk_files(root: &Path, out: &mut Vec<PathBuf>, depth: usize, max_files: usize) {
    if out.len() >= max_files || depth > 5 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_files(&path, out, depth + 1, max_files);
        } else if path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.eq_ignore_ascii_case("jsonl"))
            .unwrap_or(false)
        {
            out.push(path);
            if out.len() >= max_files {
                return;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Shared text helpers
// ---------------------------------------------------------------------------

fn secret_patterns() -> &'static Vec<Regex> {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        [
            r"sk-(?:ant-|proj-|live-)?[A-Za-z0-9_\-]{16,}",
            r"(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}",
            r"github_pat_[A-Za-z0-9_]{20,}",
            r"xox[abposr]-[A-Za-z0-9\-]{10,}",
            r"AKIA[0-9A-Z]{16}",
            r"AIza[0-9A-Za-z_\-]{35}",
            r#"(?i)(?:api[_-]?key|secret|token|password|passwd|authorization)\s*[:=]\s*['"]?[A-Za-z0-9_\-./+]{8,}['"]?"#,
            r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",
        ]
        .into_iter()
        .filter_map(|pattern| Regex::new(pattern).ok())
        .collect()
    })
}

fn internal_block_patterns() -> &'static Vec<Regex> {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        [
            r"(?s)<system-reminder>.*?</system-reminder>",
            r"(?s)<environment_context>.*?</environment_context>",
            r"(?s)<permissions instructions>.*?</permissions instructions>",
            r"(?s)<user_instructions>.*?</user_instructions>",
            r"(?is)<INSTRUCTIONS>.*?</INSTRUCTIONS>",
            r"(?is)<instructions>.*?</instructions>",
            r"(?is)<recommended_plugins>.*?</recommended_plugins>",
            r"(?is)<permission_profile>.*?</permission_profile>",
            r"(?s)<local-command-caveat>.*?</local-command-caveat>",
            r"(?s)<command-name>.*?</command-name>",
            r"(?s)<command-message>.*?</command-message>",
            r"(?s)<command-args>.*?</command-args>",
        ]
        .into_iter()
        .filter_map(|pattern| Regex::new(pattern).ok())
        .collect()
    })
}

fn redact_text(input: &str) -> (String, u32) {
    let mut output = input.to_string();
    let mut count = 0u32;
    for pattern in secret_patterns() {
        let matches = pattern.find_iter(&output).count();
        if matches > 0 {
            count += matches as u32;
            output = pattern
                .replace_all(&output, "[REDACTED_SECRET]")
                .to_string();
        }
    }
    (output, count)
}

fn clean_transcript_text(raw: &str) -> String {
    let mut output = raw.to_string();
    for pattern in internal_block_patterns() {
        output = pattern.replace_all(&output, "").to_string();
    }
    // Codex may wrap the real prompt in IDE context, e.g.
    // "# Context from my IDE setup: ... ## My request for Codex: <prompt>".
    for marker in ["## My request for Codex:", "## My request:"] {
        if let Some(index) = output.find(marker) {
            output = output[index + marker.len()..].to_string();
            break;
        }
    }
    output.trim().to_string()
}

fn is_internal_message(text: &str) -> bool {
    let trimmed = text.trim_start();
    trimmed.is_empty()
        || trimmed.starts_with("<local-command")
        || trimmed.starts_with("<command-")
        || trimmed.starts_with("# AGENTS.md instructions")
        || trimmed.starts_with("# Context from my IDE setup:")
        || trimmed.starts_with("Caveat: The messages below were generated")
}

/// Claude Code / Codex sometimes persist rate-limit notices and retry prompts
/// as ordinary messages. They are not part of the user's work.
fn is_noise_message(text: &str) -> bool {
    let trimmed = text.trim();
    let normalized = trimmed.to_lowercase();
    if normalized == "try again"
        || normalized == "try again."
        || normalized == "retry"
        || normalized == "retry."
    {
        return true;
    }

    (normalized.starts_with("you've hit your")
        || normalized.starts_with("you have hit your")
        || normalized.starts_with("you've reached your")
        || normalized.starts_with("you have reached your"))
        && normalized.contains("limit")
}

/// Claude Code sometimes inserts a compaction summary at the top of a resumed
/// transcript. Keep it even when the message budget drops older turns.
fn is_continuation_summary(text: &str) -> bool {
    text.trim_start()
        .starts_with("This session is being continued from a previous conversation")
}

fn extract_tag(text: &str, tag: &str) -> Option<String> {
    let start = format!("<{tag}>");
    let end = format!("</{tag}>");
    let start_index = text.find(&start)? + start.len();
    let end_index = text[start_index..].find(&end)? + start_index;
    Some(text[start_index..end_index].to_string())
}

fn remove_tag_blocks(text: &str, tag: &str) -> String {
    let start = format!("<{tag}>");
    let end = format!("</{tag}>");
    let mut output = text.to_string();
    while let Some(start_index) = output.find(&start) {
        let Some(relative_end) = output[start_index..].find(&end) else {
            break;
        };
        let end_index = start_index + relative_end + end.len();
        output.replace_range(start_index..end_index, "");
    }
    output
}

fn block_text(value: &Value) -> Option<String> {
    match value.get("type").and_then(Value::as_str)? {
        "text" | "input_text" | "output_text" | "summary_text" => value
            .get("text")
            .and_then(Value::as_str)
            .map(str::to_string),
        "image" => Some("[Image attached]".to_string()),
        _ => None,
    }
}

fn collect_text_blocks(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .filter_map(block_text)
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(_) => block_text(value).unwrap_or_default(),
        _ => String::new(),
    }
}

/// Text from a tool result, which may be a string or an array of text blocks.
fn collect_result_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .map(|item| match item {
                Value::String(text) => text.clone(),
                Value::Object(_) => item
                    .get("text")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_default(),
                _ => String::new(),
            })
            .collect::<Vec<_>>()
            .join("\n"),
        Value::Object(_) => value
            .get("text")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_default(),
        _ => String::new(),
    }
}

fn truncate_chars(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let mut output: String = text.chars().take(max).collect();
    output.push('…');
    output
}

fn truncate_middle(text: &str, max: usize) -> String {
    let total = text.chars().count();
    if total <= max {
        return text.to_string();
    }
    let head = max * 2 / 3;
    let tail = max - head;
    let mut output: String = text.chars().take(head).collect();
    output.push_str("\n\n…[truncated]…\n\n");
    output.extend(text.chars().skip(total - tail));
    output
}

fn push_notice(
    messages: &mut Vec<CodingSessionMessage>,
    content: String,
    timestamp: Option<i64>,
    redactions: &mut u32,
) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return;
    }
    let (clean, count) = redact_text(trimmed);
    *redactions += count;
    messages.push(CodingSessionMessage {
        role: "system".to_string(),
        content: clean,
        timestamp,
    });
}

fn push_message(
    messages: &mut Vec<CodingSessionMessage>,
    role: &str,
    content: String,
    timestamp: Option<i64>,
    redactions: &mut u32,
) {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return;
    }
    if is_noise_message(trimmed) {
        // Keep retry/limit events visible, but as a system notice rather than a
        // fake user or assistant turn.
        push_notice(messages, trimmed.to_string(), timestamp, redactions);
        return;
    }
    let (clean, count) = redact_text(trimmed);
    *redactions += count;
    // Keep every provider turn as its own normalized message. Merging adjacent
    // same-role turns makes incremental session sync ambiguous: when the last
    // turn grows, the old message count no longer maps to a stable prefix.
    messages.push(CodingSessionMessage {
        role: role.to_string(),
        content: clean,
        timestamp,
    });
}

fn push_message_dedup(
    messages: &mut Vec<CodingSessionMessage>,
    role: &str,
    content: String,
    timestamp: Option<i64>,
    redactions: &mut u32,
) {
    if let Some(last) = messages.last() {
        if last.role == role && last.content.trim() == content.trim() {
            return;
        }
    }
    push_message(messages, role, content, timestamp, redactions);
}

fn push_tool_event(
    events: &mut Vec<CodingToolEvent>,
    name: &str,
    summary: String,
    timestamp: Option<i64>,
) {
    let trimmed = summary.trim();
    if trimmed.is_empty() {
        return;
    }
    events.push(CodingToolEvent {
        name: name.to_string(),
        summary: truncate_chars(trimmed, 400),
        timestamp,
    });
}

fn tool_input_path(input: &Value) -> Option<String> {
    for key in ["file_path", "path", "filename", "file", "target_file"] {
        if let Some(path) = input.get(key).and_then(Value::as_str) {
            if !path.trim().is_empty() && path.trim() != "<unknown>" {
                return Some(path.trim().to_string());
            }
        }
    }
    None
}

fn extract_patch_files(text: &str) -> Vec<String> {
    let mut files = BTreeSet::new();
    for line in text.lines() {
        for prefix in [
            "*** Update File: ",
            "*** Add File: ",
            "*** Delete File: ",
            "*** Move to: ",
            "*** Rename File: ",
        ] {
            if let Some(path) = line.strip_prefix(prefix) {
                let path = path.trim();
                if !path.is_empty() {
                    files.insert(path.to_string());
                }
            }
        }
    }
    files.into_iter().collect()
}

fn summarize_tool_input(name: &str, input: &Value) -> String {
    if name == "apply_patch" {
        let text = match input {
            Value::String(text) => text.clone(),
            Value::Object(map) => map
                .get("input")
                .or_else(|| map.get("patch"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            _ => String::new(),
        };
        let files = extract_patch_files(&text);
        if files.is_empty() {
            return "apply_patch".to_string();
        }
        return format!(
            "apply_patch · {} file{}",
            files.len(),
            if files.len() == 1 { "" } else { "s" }
        );
    }

    if let Some(path) = tool_input_path(input) {
        return path;
    }

    for key in ["command", "cmd", "query", "pattern", "url", "description"] {
        if let Some(value) = input.get(key).and_then(Value::as_str) {
            if !value.trim().is_empty() {
                return truncate_chars(value.trim(), 220);
            }
        }
    }

    if let Value::String(text) = input {
        return truncate_chars(text.trim(), 220);
    }

    truncate_chars(input.to_string().trim(), 220)
}

fn finalize_session(
    provider: &str,
    source_path: &Path,
    mut session: CodingSession,
    messages: Vec<CodingSessionMessage>,
    tool_events: Vec<CodingToolEvent>,
    files: BTreeSet<String>,
    redactions: u32,
) -> CodingSession {
    let mut messages = messages;
    let mut truncated = false;

    for message in messages.iter_mut() {
        if message.content.chars().count() > MAX_MESSAGE_CHARS {
            message.content = truncate_middle(&message.content, MAX_MESSAGE_CHARS);
            truncated = true;
        }
    }

    // Keep the most recent turns when a transcript exceeds the import budget,
    // but preserve a leading compaction summary — it usually contains the
    // project decisions and constraints from earlier in the session.
    let pinned_index = messages
        .iter()
        .take(3)
        .position(|message| is_continuation_summary(&message.content));
    let pinned_summary = pinned_index.map(|index| messages.remove(index));

    let mut kept_reversed = Vec::new();
    let mut total_chars = 0usize;
    let mut dropped = 0u32;
    for message in messages.into_iter().rev() {
        if kept_reversed.len() >= MAX_MESSAGES
            || (total_chars + message.content.len() > MAX_TOTAL_MESSAGE_CHARS
                && !kept_reversed.is_empty())
        {
            dropped += 1;
            continue;
        }
        total_chars += message.content.len();
        kept_reversed.push(message);
    }
    kept_reversed.reverse();
    let mut kept = Vec::with_capacity(kept_reversed.len() + 1);
    if let Some(summary) = pinned_summary {
        kept.push(summary);
    }
    kept.extend(kept_reversed);
    if dropped > 0 {
        truncated = true;
    }

    if session.title.trim().is_empty() {
        session.title = kept
            .iter()
            .find(|message| {
                message.role == "user"
                    && !is_continuation_summary(&message.content)
                    && !is_noise_message(&message.content)
            })
            .map(|message| truncate_chars(message.content.trim(), 90))
            .unwrap_or_else(|| "Imported coding session".to_string());
    }

    // Custom titles come from the raw transcript, so redact them too before
    // they are displayed or persisted.
    let (title, title_redactions) = redact_text(session.title.trim());
    session.title = if title.trim().is_empty() {
        "Imported coding session".to_string()
    } else {
        title
    };
    let redactions = redactions + title_redactions;

    if session.last_activity.is_none() {
        session.last_activity = file_modified_ms(source_path);
    }

    if session.project_root.is_none() {
        session.project_root = session
            .project_path
            .as_deref()
            .and_then(|path| resolve_project_root(Path::new(path)))
            .map(|path| path.to_string_lossy().to_string());
    }

    session.provider = provider.to_string();
    session.source_path = source_path.to_string_lossy().to_string();
    session.messages = kept;
    session.tool_events = tool_events;
    session.files_changed = files.into_iter().collect();
    session.messages_dropped = dropped;
    session.redactions = redactions;
    session.truncated = truncated;
    session
}

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

fn claude_head_summary(head: &str, source: &Path) -> CodingSessionSummary {
    let mut session_id = source
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("unknown")
        .to_string();
    let mut project_path: Option<String> = None;
    let mut git_branch: Option<String> = None;
    let mut model: Option<String> = None;
    let mut title: Option<String> = None;
    let mut first_prompt: Option<String> = None;
    let mut last_timestamp: Option<i64> = None;

    for line in head.lines().take(250) {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if value
            .get("isSidechain")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }
        if let Some(id) = value.get("sessionId").and_then(Value::as_str) {
            session_id = id.to_string();
        }
        if let Some(cwd) = value.get("cwd").and_then(Value::as_str) {
            if !cwd.is_empty() {
                project_path = Some(cwd.to_string());
            }
        }
        if let Some(branch) = value.get("gitBranch").and_then(Value::as_str) {
            if !branch.is_empty() {
                git_branch = Some(branch.to_string());
            }
        }
        if let Some(timestamp) = json_timestamp(&value) {
            last_timestamp = Some(timestamp);
        }

        match value.get("type").and_then(Value::as_str).unwrap_or("") {
            "custom-title" => {
                if let Some(value) = value.get("customTitle").and_then(Value::as_str) {
                    title = Some(value.to_string());
                }
            }
            "last-prompt" => {
                if let Some(prompt) = value.get("lastPrompt").and_then(Value::as_str) {
                    if title.is_none() {
                        title = Some(truncate_chars(prompt.trim(), 90));
                    }
                }
            }
            "user" if first_prompt.is_none() => {
                if value
                    .get("isMeta")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                {
                    continue;
                }
                if let Some(message) = value.get("message") {
                    let raw = message
                        .get("content")
                        .map(collect_text_blocks)
                        .unwrap_or_default();
                    let clean = clean_transcript_text(&raw);
                    if !is_internal_message(&clean) && !is_noise_message(&clean) {
                        first_prompt = Some(clean);
                    }
                }
            }
            "assistant" if model.is_none() => {
                model = value
                    .get("message")
                    .and_then(|message| message.get("model"))
                    .and_then(Value::as_str)
                    .filter(|model| !model.is_empty())
                    .map(str::to_string);
            }
            _ => {}
        }
    }

    if title.is_none() {
        title = first_prompt;
    }

    let title = title
        .map(|value| truncate_chars(value.trim(), 90))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "Claude Code session".to_string());
    let (title, _) = redact_text(&title);

    CodingSessionSummary {
        provider: CLAUDE_PROVIDER.to_string(),
        session_id,
        title,
        project_path: project_path.clone(),
        project_root: project_path
            .as_deref()
            .and_then(|path| resolve_project_root(Path::new(path)))
            .map(|path| path.to_string_lossy().to_string()),
        project_exists: project_path
            .as_deref()
            .map(|path| Path::new(path).is_dir())
            .unwrap_or(false),
        git_branch,
        model,
        last_activity: last_timestamp.or_else(|| file_modified_ms(source)),
        source_path: source.to_string_lossy().to_string(),
        size_bytes: std::fs::metadata(source)
            .map(|meta| meta.len())
            .unwrap_or(0),
    }
}

#[derive(Default)]
struct ClaudeTailInfo {
    title: Option<String>,
    cwd: Option<String>,
    git_branch: Option<String>,
    model: Option<String>,
    last_activity: Option<i64>,
}

fn claude_tail_info(tail: &str) -> ClaudeTailInfo {
    let mut custom_title: Option<String> = None;
    let mut last_prompt: Option<String> = None;
    let mut info = ClaudeTailInfo::default();

    for line in tail.lines() {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if value
            .get("isSidechain")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }

        if let Some(timestamp) = json_timestamp(&value) {
            info.last_activity = Some(timestamp);
        }
        if let Some(cwd) = value.get("cwd").and_then(Value::as_str) {
            if !cwd.is_empty() {
                info.cwd = Some(cwd.to_string());
            }
        }
        if let Some(branch) = value.get("gitBranch").and_then(Value::as_str) {
            if !branch.is_empty() {
                info.git_branch = Some(branch.to_string());
            }
        }
        if let Some(model) = value
            .get("message")
            .and_then(|message| message.get("model"))
            .and_then(Value::as_str)
            .filter(|model| !model.is_empty())
        {
            info.model = Some(model.to_string());
        }

        match value.get("type").and_then(Value::as_str).unwrap_or("") {
            "custom-title" => {
                if let Some(title) = value.get("customTitle").and_then(Value::as_str) {
                    custom_title = Some(title.to_string());
                }
            }
            "last-prompt" => {
                if let Some(prompt) = value.get("lastPrompt").and_then(Value::as_str) {
                    if !is_noise_message(prompt) {
                        last_prompt = Some(prompt.to_string());
                    }
                }
            }
            _ => {}
        }
    }

    info.title = custom_title
        .or(last_prompt)
        .map(|title| truncate_chars(title.trim(), 90))
        .filter(|title| !title.is_empty() && !is_noise_message(title));
    info
}

fn parse_claude_session(text: &str, source: &Path) -> CodingSession {
    let mut session_id = source
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("unknown")
        .to_string();
    let mut title = String::new();
    let mut project_path: Option<String> = None;
    let mut git_branch: Option<String> = None;
    let mut model: Option<String> = None;
    let mut started_at: Option<i64> = None;
    let mut last_activity: Option<i64> = None;
    let mut messages: Vec<CodingSessionMessage> = Vec::new();
    let mut tool_events: Vec<CodingToolEvent> = Vec::new();
    let mut files: BTreeSet<String> = BTreeSet::new();
    let mut redactions = 0u32;

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };

        // Sub-agent sidechains are separate transcripts; importing them would
        // interleave unrelated work into the main conversation.
        if value
            .get("isSidechain")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            continue;
        }

        if let Some(timestamp) = json_timestamp(&value) {
            if started_at.is_none() {
                started_at = Some(timestamp);
            }
            last_activity = Some(timestamp);
        }
        if let Some(id) = value.get("sessionId").and_then(Value::as_str) {
            session_id = id.to_string();
        }
        if let Some(cwd) = value.get("cwd").and_then(Value::as_str) {
            if !cwd.is_empty() {
                project_path = Some(cwd.to_string());
            }
        }
        if let Some(branch) = value.get("gitBranch").and_then(Value::as_str) {
            if !branch.is_empty() {
                git_branch = Some(branch.to_string());
            }
        }

        let timestamp = json_timestamp(&value);
        match value.get("type").and_then(Value::as_str).unwrap_or("") {
            "custom-title" => {
                if let Some(value) = value.get("customTitle").and_then(Value::as_str) {
                    title = value.to_string();
                }
            }
            "last-prompt" => {
                if title.is_empty() {
                    if let Some(prompt) = value.get("lastPrompt").and_then(Value::as_str) {
                        title = truncate_chars(prompt.trim(), 90);
                    }
                }
            }
            "user" => {
                if value
                    .get("isMeta")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                {
                    continue;
                }
                let Some(message) = value.get("message") else {
                    continue;
                };
                let content = message.get("content").cloned().unwrap_or(Value::Null);
                let raw = collect_text_blocks(&content);

                if let Some(command) = extract_tag(&raw, "bash-input") {
                    let output = extract_tag(&raw, "bash-stdout")
                        .or_else(|| extract_tag(&raw, "bash-stderr"))
                        .unwrap_or_default();
                    let (command, command_redactions) = redact_text(command.trim());
                    let (output, output_redactions) = redact_text(output.trim());
                    redactions += command_redactions + output_redactions;

                    let summary = if output.is_empty() {
                        command.clone()
                    } else {
                        format!("{command}\n{}", truncate_chars(&output, 300))
                    };
                    push_tool_event(&mut tool_events, "bash", summary, timestamp);
                    push_notice(
                        &mut messages,
                        format!("Ran: {}", truncate_chars(&command, 160)),
                        timestamp,
                        &mut redactions,
                    );

                    let mut remainder = remove_tag_blocks(&raw, "bash-input");
                    remainder = remove_tag_blocks(&remainder, "bash-stdout");
                    remainder = remove_tag_blocks(&remainder, "bash-stderr");
                    let remainder = clean_transcript_text(&remainder);
                    if !remainder.is_empty() && !is_internal_message(&remainder) {
                        push_message(
                            &mut messages,
                            "user",
                            remainder,
                            timestamp,
                            &mut redactions,
                        );
                    }
                } else {
                    let clean = clean_transcript_text(&raw);
                    if !is_internal_message(&clean) {
                        push_message(&mut messages, "user", clean, timestamp, &mut redactions);
                    }
                }

                // Failed tool results are useful context ("this fix didn't work").
                if let Value::Array(blocks) = &content {
                    for block in blocks {
                        if block.get("type").and_then(Value::as_str) == Some("tool_result")
                            && block
                                .get("is_error")
                                .and_then(Value::as_bool)
                                .unwrap_or(false)
                        {
                            let error = block
                                .get("content")
                                .map(collect_result_text)
                                .unwrap_or_default();
                            let (error, count) = redact_text(&error);
                            redactions += count;
                            push_tool_event(&mut tool_events, "tool error", error, timestamp);
                        }
                    }
                }
            }
            "assistant" => {
                let Some(message) = value.get("message") else {
                    continue;
                };
                if model.is_none() {
                    model = message
                        .get("model")
                        .and_then(Value::as_str)
                        .filter(|model| !model.is_empty())
                        .map(str::to_string);
                }

                match message.get("content") {
                    Some(Value::Array(blocks)) => {
                        let mut text_parts = Vec::new();
                        for block in blocks {
                            match block.get("type").and_then(Value::as_str).unwrap_or("") {
                                "text" => {
                                    if let Some(text) = block.get("text").and_then(Value::as_str) {
                                        text_parts.push(text.to_string());
                                    }
                                }
                                "tool_use" => {
                                    let name =
                                        block.get("name").and_then(Value::as_str).unwrap_or("tool");
                                    let input = block.get("input").cloned().unwrap_or(Value::Null);
                                    if let Some(path) = tool_input_path(&input) {
                                        files.insert(path);
                                    }
                                    push_tool_event(
                                        &mut tool_events,
                                        name,
                                        summarize_tool_input(name, &input),
                                        timestamp,
                                    );
                                }
                                _ => {}
                            }
                        }
                        let clean = clean_transcript_text(&text_parts.join("\n\n"));
                        if !clean.is_empty() {
                            push_message(
                                &mut messages,
                                "assistant",
                                clean,
                                timestamp,
                                &mut redactions,
                            );
                        }
                    }
                    Some(Value::String(text)) => {
                        let clean = clean_transcript_text(text);
                        if !clean.is_empty() {
                            push_message(
                                &mut messages,
                                "assistant",
                                clean,
                                timestamp,
                                &mut redactions,
                            );
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    finalize_session(
        CLAUDE_PROVIDER,
        source,
        CodingSession {
            provider: CLAUDE_PROVIDER.to_string(),
            session_id,
            title,
            project_path,
            project_root: None,
            git_branch,
            model,
            started_at,
            last_activity,
            source_path: String::new(),
            messages: Vec::new(),
            tool_events: Vec::new(),
            files_changed: Vec::new(),
            messages_dropped: 0,
            redactions: 0,
            truncated: false,
        },
        messages,
        tool_events,
        files,
        redactions,
    )
}

// ---------------------------------------------------------------------------
// OpenAI Codex
// ---------------------------------------------------------------------------

fn codex_payload<'a>(value: &'a Value) -> &'a Value {
    value.get("payload").unwrap_or(&Value::Null)
}

fn codex_tail_title(tail: &str) -> Option<String> {
    let mut fallback: Option<String> = None;
    for line in tail.lines() {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match value.get("type").and_then(Value::as_str).unwrap_or("") {
            "event_msg" => {
                let payload = codex_payload(&value);
                if payload.get("type").and_then(Value::as_str) == Some("task_complete") {
                    if let Some(text) = payload
                        .get("last_agent_message")
                        .and_then(Value::as_str)
                    {
                        let clean = clean_transcript_text(text);
                        let first_line = clean.lines().find(|line| !line.trim().is_empty());
                        if let Some(first_line) = first_line {
                            fallback = Some(truncate_chars(first_line.trim(), 90));
                        }
                    }
                }
            }
            "response_item" => {
                let payload = codex_payload(&value);
                if payload.get("type").and_then(Value::as_str) == Some("message")
                    && payload.get("role").and_then(Value::as_str) == Some("assistant")
                {
                    let raw = payload
                        .get("content")
                        .map(collect_text_blocks)
                        .unwrap_or_default();
                    let clean = clean_transcript_text(&raw);
                    let first_line = clean.lines().find(|line| !line.trim().is_empty());
                    if let Some(first_line) = first_line {
                        fallback = Some(truncate_chars(first_line.trim(), 90));
                    }
                }
            }
            _ => {}
        }
    }
    fallback
        .map(|title| redact_text(&title).0)
        .filter(|title| !title.is_empty() && !is_noise_message(title))
}

fn codex_head_summary(head: &str, source: &Path) -> CodingSessionSummary {
    let mut session_id = source
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("unknown")
        .to_string();
    let mut project_path: Option<String> = None;
    let mut model: Option<String> = None;
    let mut title: Option<String> = None;
    let mut last_timestamp: Option<i64> = None;

    for line in head.lines().take(250) {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        if let Some(timestamp) = json_timestamp(&value) {
            last_timestamp = Some(timestamp);
        }

        match value.get("type").and_then(Value::as_str).unwrap_or("") {
            "session_meta" => {
                let payload = codex_payload(&value);
                if let Some(id) = payload
                    .get("id")
                    .or_else(|| payload.get("session_id"))
                    .and_then(Value::as_str)
                {
                    session_id = id.to_string();
                }
                if let Some(cwd) = payload.get("cwd").and_then(Value::as_str) {
                    if !cwd.is_empty() {
                        project_path = Some(cwd.to_string());
                    }
                }
            }
            "turn_context" => {
                let payload = codex_payload(&value);
                if let Some(cwd) = payload.get("cwd").and_then(Value::as_str) {
                    if !cwd.is_empty() {
                        project_path = Some(cwd.to_string());
                    }
                }
                if model.is_none() {
                    model = payload
                        .get("model")
                        .and_then(Value::as_str)
                        .filter(|model| !model.is_empty())
                        .map(str::to_string);
                }
            }
            "response_item" => {
                let payload = codex_payload(&value);
                if payload.get("type").and_then(Value::as_str) == Some("message")
                    && payload.get("role").and_then(Value::as_str) == Some("user")
                    && title.is_none()
                {
                    let raw = payload
                        .get("content")
                        .map(collect_text_blocks)
                        .unwrap_or_default();
                    let clean = clean_transcript_text(&raw);
                    if !is_internal_message(&clean) && !is_noise_message(&clean) {
                        title = Some(truncate_chars(&clean, 90));
                    }
                }
            }
            "event_msg" => {
                let payload = codex_payload(&value);
                if payload.get("type").and_then(Value::as_str) == Some("item_completed")
                    && title.is_none()
                {
                    let item = payload.get("item").unwrap_or(&Value::Null);
                    if item.get("type").and_then(Value::as_str) == Some("UserMessage") {
                        let raw = item
                            .get("content")
                            .map(collect_text_blocks)
                            .unwrap_or_default();
                        let clean = clean_transcript_text(&raw);
                        if !is_internal_message(&clean) && !is_noise_message(&clean) {
                            title = Some(truncate_chars(&clean, 90));
                        }
                    }
                }
            }
            _ => {}
        }
    }

    let title = title
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Codex session".to_string());
    let (title, _) = redact_text(&title);

    CodingSessionSummary {
        provider: CODEX_PROVIDER.to_string(),
        session_id,
        title,
        project_path: project_path.clone(),
        project_root: project_path
            .as_deref()
            .and_then(|path| resolve_project_root(Path::new(path)))
            .map(|path| path.to_string_lossy().to_string()),
        project_exists: project_path
            .as_deref()
            .map(|path| Path::new(path).is_dir())
            .unwrap_or(false),
        git_branch: None,
        model,
        last_activity: last_timestamp.or_else(|| file_modified_ms(source)),
        source_path: source.to_string_lossy().to_string(),
        size_bytes: std::fs::metadata(source)
            .map(|meta| meta.len())
            .unwrap_or(0),
    }
}

fn parse_codex_session(text: &str, source: &Path) -> CodingSession {
    let mut session_id = source
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("unknown")
        .to_string();
    let mut title = String::new();
    let mut project_path: Option<String> = None;
    let mut model: Option<String> = None;
    let mut started_at: Option<i64> = None;
    let mut last_activity: Option<i64> = None;
    let mut messages: Vec<CodingSessionMessage> = Vec::new();
    let mut tool_events: Vec<CodingToolEvent> = Vec::new();
    let mut files: BTreeSet<String> = BTreeSet::new();
    let mut redactions = 0u32;

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };
        let timestamp = json_timestamp(&value);
        if let Some(timestamp) = timestamp {
            if started_at.is_none() {
                started_at = Some(timestamp);
            }
            last_activity = Some(timestamp);
        }

        match value.get("type").and_then(Value::as_str).unwrap_or("") {
            "session_meta" => {
                let payload = codex_payload(&value);
                if let Some(id) = payload
                    .get("id")
                    .or_else(|| payload.get("session_id"))
                    .and_then(Value::as_str)
                {
                    session_id = id.to_string();
                }
                if let Some(cwd) = payload.get("cwd").and_then(Value::as_str) {
                    if !cwd.is_empty() {
                        project_path = Some(cwd.to_string());
                    }
                }
            }
            "turn_context" => {
                let payload = codex_payload(&value);
                if let Some(cwd) = payload.get("cwd").and_then(Value::as_str) {
                    if !cwd.is_empty() {
                        project_path = Some(cwd.to_string());
                    }
                }
                if model.is_none() {
                    model = payload
                        .get("model")
                        .and_then(Value::as_str)
                        .filter(|model| !model.is_empty())
                        .map(str::to_string);
                }
            }
            "response_item" => {
                let payload = codex_payload(&value);
                match payload.get("type").and_then(Value::as_str).unwrap_or("") {
                    "message" => {
                        let role = payload.get("role").and_then(Value::as_str).unwrap_or("");
                        if role != "user" && role != "assistant" {
                            continue;
                        }
                        let raw = payload
                            .get("content")
                            .map(collect_text_blocks)
                            .unwrap_or_default();
                        let clean = clean_transcript_text(&raw);
                        if is_internal_message(&clean) {
                            continue;
                        }
                        if title.is_empty()
                            && role == "user"
                            && !is_noise_message(&clean)
                        {
                            title = truncate_chars(&clean, 90);
                        }
                        push_message_dedup(&mut messages, role, clean, timestamp, &mut redactions);
                    }
                    "function_call" | "custom_tool_call" => {
                        let name = payload
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or("tool");
                        let raw_input = payload
                            .get("arguments")
                            .or_else(|| payload.get("input"))
                            .cloned()
                            .unwrap_or(Value::Null);
                        let parsed_input = match &raw_input {
                            Value::String(text) => serde_json::from_str::<Value>(text)
                                .unwrap_or_else(|_| Value::String(text.clone())),
                            other => other.clone(),
                        };
                        if name == "apply_patch" {
                            let patch = match &raw_input {
                                Value::String(text) => text.clone(),
                                other => other.to_string(),
                            };
                            for path in extract_patch_files(&patch) {
                                files.insert(path);
                            }
                        } else if let Some(path) = tool_input_path(&parsed_input) {
                            files.insert(path);
                        }
                        let summary = summarize_tool_input(name, &parsed_input);
                        let (summary, count) = redact_text(&summary);
                        redactions += count;
                        push_tool_event(&mut tool_events, name, summary, timestamp);
                    }
                    "function_call_output" | "custom_tool_call_output" => {
                        let output = payload.get("output").and_then(Value::as_str).unwrap_or("");
                        let lower = output.to_lowercase();
                        let failed = lower.contains("process exited with code")
                            && !lower.contains("process exited with code 0")
                            || lower.contains("error:")
                            || lower.contains("failed to");
                        if failed && !output.trim().is_empty() {
                            let (output, count) = redact_text(output);
                            redactions += count;
                            push_tool_event(&mut tool_events, "tool error", output, timestamp);
                        }
                    }
                    _ => {}
                }
            }
            "event_msg" => {
                let payload = codex_payload(&value);
                match payload.get("type").and_then(Value::as_str).unwrap_or("") {
                    "item_completed" => {
                        let item = payload.get("item").unwrap_or(&Value::Null);
                        if item.get("type").and_then(Value::as_str) == Some("UserMessage") {
                            let raw = item
                                .get("content")
                                .map(collect_text_blocks)
                                .unwrap_or_default();
                            let clean = clean_transcript_text(&raw);
                            if !is_internal_message(&clean) {
                                if title.is_empty() && !is_noise_message(&clean) {
                                    title = truncate_chars(&clean, 90);
                                }
                                push_message_dedup(
                                    &mut messages,
                                    "user",
                                    clean,
                                    timestamp,
                                    &mut redactions,
                                );
                            }
                        }
                    }
                    "agent_message" => {
                        if let Some(text) = payload.get("message").and_then(Value::as_str) {
                            let clean = clean_transcript_text(text);
                            if !clean.is_empty() {
                                push_message_dedup(
                                    &mut messages,
                                    "assistant",
                                    clean,
                                    timestamp,
                                    &mut redactions,
                                );
                            }
                        }
                    }
                    "task_complete" => {
                        if let Some(text) =
                            payload.get("last_agent_message").and_then(Value::as_str)
                        {
                            let clean = clean_transcript_text(text);
                            if !clean.is_empty() {
                                push_message_dedup(
                                    &mut messages,
                                    "assistant",
                                    clean,
                                    timestamp,
                                    &mut redactions,
                                );
                            }
                        }
                    }
                    "turn_aborted" => {
                        push_tool_event(
                            &mut tool_events,
                            "turn aborted",
                            "The previous turn was interrupted before it finished.".to_string(),
                            timestamp,
                        );
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    finalize_session(
        CODEX_PROVIDER,
        source,
        CodingSession {
            provider: CODEX_PROVIDER.to_string(),
            session_id,
            title,
            project_path,
            project_root: None,
            git_branch: None,
            model,
            started_at,
            last_activity,
            source_path: String::new(),
            messages: Vec::new(),
            tool_events: Vec::new(),
            files_changed: Vec::new(),
            messages_dropped: 0,
            redactions: 0,
            truncated: false,
        },
        messages,
        tool_events,
        files,
        redactions,
    )
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn kode_scan_coding_sessions(
    app: tauri::AppHandle,
    project_path: Option<String>,
) -> Result<Vec<CodingSessionSummary>, String> {
    let home = home_dir(&app)?;
    scan_sessions(&home, project_path.as_deref())
}

fn scan_sessions(
    home: &Path,
    project_path: Option<&str>,
) -> Result<Vec<CodingSessionSummary>, String> {
    let filter = project_path.map(|path| canonical_or_original(Path::new(path)));

    let mut sessions: Vec<CodingSessionSummary> = Vec::new();

    // Claude Code: ~/.claude/projects/<encoded-project>/<session>.jsonl
    if let Ok(claude_root) = provider_history_root(home, CLAUDE_PROVIDER) {
        let claude_root = canonical_or_original(&claude_root);
        if let Ok(projects) = std::fs::read_dir(&claude_root) {
            let mut files = Vec::new();
            for project in projects.flatten() {
                let project_path = project.path();
                if !project_path.is_dir() {
                    continue;
                }
                if let Ok(entries) = std::fs::read_dir(&project_path) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path
                            .extension()
                            .and_then(|extension| extension.to_str())
                            .map(|extension| extension.eq_ignore_ascii_case("jsonl"))
                            .unwrap_or(false)
                            && !path
                                .file_name()
                                .and_then(|name| name.to_str())
                                .map(|name| name.starts_with("agent-"))
                                .unwrap_or(false)
                        {
                            files.push(path);
                        }
                    }
                }
                if files.len() >= 600 {
                    break;
                }
            }

            for path in files {
                let path = canonical_or_original(&path);
                if !path.starts_with(&claude_root) {
                    continue;
                }
                let head = read_head(&path, 96 * 1024);
                let tail = read_tail(&path, 48 * 1024);
                let mut summary = claude_head_summary(&head, &path);
                // `custom-title`, `last-prompt`, and (for long/resumed sessions)
                // the current `cwd` are written near the end of the transcript.
                let tail_info = claude_tail_info(&tail);
                if let Some(title) = tail_info.title {
                    summary.title = title;
                }
                if let Some(cwd) = tail_info.cwd {
                    summary.project_path = Some(cwd);
                }
                if let Some(branch) = tail_info.git_branch {
                    summary.git_branch = Some(branch);
                }
                if let Some(model) = tail_info.model {
                    summary.model = Some(model);
                }
                if let Some(activity) = tail_info.last_activity {
                    summary.last_activity = Some(activity);
                }
                if let Some(cwd) = &summary.project_path {
                    summary.project_exists = Path::new(cwd).is_dir();
                    summary.project_root = resolve_project_root(Path::new(cwd))
                        .map(|root| root.to_string_lossy().to_string());
                }
                if let Some(cwd) = &summary.project_path {
                    if let Some(filter) = &filter {
                        if !paths_match(Path::new(cwd), filter) {
                            continue;
                        }
                    }
                } else if filter.is_some() {
                    continue;
                }
                sessions.push(summary);
            }
        }
    }

    // OpenAI Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
    if let Ok(codex_root) = provider_history_root(home, CODEX_PROVIDER) {
        let codex_root = canonical_or_original(&codex_root);
        let mut files = Vec::new();
        walk_files(&codex_root, &mut files, 0, 600);
        for path in files {
            let path = canonical_or_original(&path);
            if !path.starts_with(&codex_root) {
                continue;
            }
            let head = read_head(&path, 96 * 1024);
            let tail = read_tail(&path, 64 * 1024);
            let mut summary = codex_head_summary(&head, &path);
            if summary.title == "Codex session" {
                if let Some(title) = codex_tail_title(&tail) {
                    summary.title = title;
                }
            }
            // Some Codex sessions begin with a single very large internal
            // context message, so the real prompt sits past the 96 KB preview.
            // Re-read a bounded larger head only for those sessions.
            if summary.title == "Codex session" {
                let extended_head = read_head(&path, 2 * 1024 * 1024);
                let extended = codex_head_summary(&extended_head, &path);
                if extended.title != "Codex session" {
                    summary.title = extended.title;
                }
            }
            if summary.last_activity.is_none() {
                summary.last_activity = file_modified_ms(&path);
            }
            if let Some(cwd) = &summary.project_path {
                if let Some(filter) = &filter {
                    if !paths_match(Path::new(cwd), filter) {
                        continue;
                    }
                }
            } else if filter.is_some() {
                continue;
            }
            sessions.push(summary);
        }
    }

    sessions.sort_by(|a, b| {
        b.last_activity
            .unwrap_or(0)
            .cmp(&a.last_activity.unwrap_or(0))
    });
    sessions.truncate(60);
    Ok(sessions)
}

#[tauri::command]
pub fn kode_read_coding_session(
    app: tauri::AppHandle,
    provider: String,
    session_path: String,
) -> Result<CodingSession, String> {
    let home = home_dir(&app)?;
    read_session(&home, &provider, &session_path)
}

fn read_session(
    home: &Path,
    provider: &str,
    session_path: &str,
) -> Result<CodingSession, String> {
    let root = provider_history_root(home, provider)?;
    let root = canonical_or_original(&root);
    let path = std::fs::canonicalize(session_path)
        .map_err(|error| format!("Could not open the session transcript: {error}"))?;

    if !path.starts_with(&root) {
        return Err("The session transcript is outside the local history folder.".to_string());
    }
    if path.extension().and_then(|extension| extension.to_str()) != Some("jsonl") {
        return Err("Unsupported session transcript format.".to_string());
    }

    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("Could not read the session transcript: {error}"))?;

    Ok(match provider {
        CLAUDE_PROVIDER => parse_claude_session(&text, &path),
        CODEX_PROVIDER => parse_codex_session(&text, &path),
        other => return Err(format!("Unsupported coding session provider: {other}")),
    })
}

#[tauri::command]
pub fn kode_session_updated_at(
    app: tauri::AppHandle,
    provider: String,
    session_path: String,
) -> Result<i64, String> {
    let home = home_dir(&app)?;
    session_updated_at(&home, &provider, &session_path)
}

fn session_updated_at(
    home: &Path,
    provider: &str,
    session_path: &str,
) -> Result<i64, String> {
    let root = canonical_or_original(&provider_history_root(home, provider)?);
    let path = std::fs::canonicalize(session_path)
        .map_err(|error| format!("Could not open the session transcript: {error}"))?;
    if !path.starts_with(&root) {
        return Err("The session transcript is outside the local history folder.".to_string());
    }
    file_modified_ms(&path)
        .ok_or_else(|| "Could not read the session timestamp.".to_string())
}

// ---------------------------------------------------------------------------
// Live project state
// ---------------------------------------------------------------------------

async fn git_output(root: &Path, args: &[&str]) -> Option<String> {
    let mut command = tokio::process::Command::new("git");
    command.args(args).current_dir(root);
    let output = tokio::time::timeout(std::time::Duration::from_secs(15), command.output())
        .await
        .ok()?
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_status_files(status: &str) -> Vec<String> {
    let mut files = Vec::new();
    for line in status.lines() {
        if line.starts_with("##") || line.trim().is_empty() {
            continue;
        }
        let path = line.get(3..).unwrap_or("").trim();
        if path.is_empty() {
            continue;
        }
        let path = path
            .rsplit_once(" -> ")
            .map(|(_, target)| target)
            .unwrap_or(path)
            .trim_matches('"')
            .to_string();
        if !files.contains(&path) {
            files.push(path);
        }
        if files.len() >= 80 {
            break;
        }
    }
    files
}

fn read_instruction(root: &Path, relative: &str, remaining: usize) -> Option<CodingInstruction> {
    let path = root.join(relative);
    if !path.is_file() {
        return None;
    }
    let text = std::fs::read_to_string(&path).ok()?;
    let (text, _) = redact_text(&text);
    let (content, truncated) = if text.chars().count() > remaining {
        (truncate_chars(&text, remaining), true)
    } else {
        (text, false)
    };
    Some(CodingInstruction {
        path: relative.to_string(),
        content,
        truncated,
    })
}

fn read_package_scripts(root: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(root.join("package.json")) else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_str::<Value>(&text) else {
        return Vec::new();
    };
    let Some(scripts) = json.get("scripts").and_then(Value::as_object) else {
        return Vec::new();
    };
    scripts
        .iter()
        .take(25)
        .map(|(name, command)| {
            let command = command.as_str().unwrap_or_default();
            let (command, _) = redact_text(command);
            format!("{name}: {command}")
        })
        .collect()
}

#[tauri::command]
pub async fn kode_project_state(root: String) -> Result<CodingProjectState, String> {
    let root_path = std::fs::canonicalize(&root)
        .map_err(|error| format!("Project folder not found: {error}"))?;
    if !root_path.is_dir() {
        return Err("Project folder not found.".to_string());
    }

    let branch = git_output(&root_path, &["rev-parse", "--abbrev-ref", "HEAD"])
        .await
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value != "HEAD");

    let status = git_output(&root_path, &["status", "--porcelain=v1", "-b"])
        .await
        .unwrap_or_default();
    let unstaged_diff = git_output(&root_path, &["diff", "--stat"])
        .await
        .unwrap_or_default();
    let staged_diff = git_output(&root_path, &["diff", "--cached", "--stat"])
        .await
        .unwrap_or_default();
    let diff_stat = format!("{}\n{}", unstaged_diff.trim(), staged_diff.trim())
        .trim()
        .to_string();
    let log = git_output(&root_path, &["log", "-8", "--pretty=format:%h %s"])
        .await
        .map(|log| redact_text(&log).0)
        .unwrap_or_default();
    let recent_commits = log
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    let changed_files = parse_status_files(&status);

    // Project instructions tell the continuation agent how this repo expects to
    // be worked on (frameworks, conventions, constraints).
    let mut instructions = Vec::new();
    let mut budget: usize = 12_000;
    for relative in [
        "AGENTS.md",
        "CLAUDE.md",
        ".cursorrules",
        ".github/copilot-instructions.md",
    ] {
        if budget == 0 {
            break;
        }
        if let Some(instruction) = read_instruction(&root_path, relative, budget) {
            budget = budget.saturating_sub(instruction.content.chars().count());
            instructions.push(instruction);
        }
    }

    Ok(CodingProjectState {
        root: root_path.to_string_lossy().to_string(),
        branch,
        status: truncate_chars(&status, 4_000),
        diff_stat: truncate_chars(&diff_stat, 4_000),
        recent_commits,
        changed_files,
        instructions,
        scripts: read_package_scripts(&root_path),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_iso_timestamps() {
        assert_eq!(
            parse_iso_ms("2026-01-01T00:00:00.000Z"),
            Some(1_767_225_600_000)
        );
        assert_eq!(
            parse_iso_ms("2026-01-01T00:00:00Z"),
            Some(1_767_225_600_000)
        );
        assert_eq!(parse_iso_ms("not-a-date"), None);
    }

    #[test]
    fn redacts_common_secrets() {
        let (output, count) = redact_text(
            "key sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345 and ghp_abcdefghijklmnopqrstuvwxyz",
        );
        assert!(output.contains("[REDACTED_SECRET]"));
        assert!(!output.contains("sk-ant-api03"));
        assert_eq!(count, 2);
    }

    #[test]
    fn cleans_codex_context_wrappers() {
        assert_eq!(
            clean_transcript_text(
                "# Context from my IDE setup:\n\n## My request for Codex:\nFix the login flow"
            ),
            "Fix the login flow"
        );
        assert_eq!(
            clean_transcript_text(
                "# Files mentioned by the user:\n\n## My request:\nMigrate to R2"
            ),
            "Migrate to R2"
        );
        let internal = clean_transcript_text(
            "<recommended_plugins>plugins</recommended_plugins># AGENTS.md instructions for /x\n<INSTRUCTIONS>rules</INSTRUCTIONS>",
        );
        assert!(is_internal_message(&internal));
        assert!(!internal.contains("<INSTRUCTIONS>"));
        assert!(!internal.contains("recommended_plugins>plugins"));
    }

    #[test]
    fn normalizes_claude_session() {
        let transcript = [
            r#"{"type":"custom-title","customTitle":"Fix auth","sessionId":"sess-1"}"#,
            r#"{"type":"user","sessionId":"sess-1","cwd":"/tmp/project","gitBranch":"main","timestamp":"2026-01-01T10:00:00.000Z","message":{"role":"user","content":[{"type":"text","text":"Please fix the login flow"}]}}"#,
            r#"{"type":"assistant","sessionId":"sess-1","timestamp":"2026-01-01T10:01:00.000Z","message":{"model":"claude-x","role":"assistant","content":[{"type":"text","text":"I'll inspect it."},{"type":"tool_use","name":"Edit","input":{"file_path":"src/auth.ts"}}]}}"#,
            r#"{"type":"user","sessionId":"sess-1","timestamp":"2026-01-01T10:02:00.000Z","message":{"role":"user","content":[{"type":"text","text":"Try again"}]}}"#,
            r#"{"type":"assistant","sessionId":"sess-1","timestamp":"2026-01-01T10:03:00.000Z","message":{"model":"claude-x","role":"assistant","content":[{"type":"text","text":"You've hit your weekly limit - resets Nov 2 at 4am (Africa/Lagos)"}]}}"#,
        ]
        .join("\n");

        let session = parse_claude_session(&transcript, Path::new("/tmp/sess-1.jsonl"));

        assert_eq!(session.provider, CLAUDE_PROVIDER);
        assert_eq!(session.title, "Fix auth");
        assert_eq!(session.project_path.as_deref(), Some("/tmp/project"));
        assert_eq!(session.git_branch.as_deref(), Some("main"));
        assert_eq!(session.model.as_deref(), Some("claude-x"));
        assert_eq!(session.messages.len(), 4);
        assert_eq!(session.messages[0].role, "user");
        assert_eq!(session.messages[1].role, "assistant");
        assert_eq!(session.messages[2].role, "system");
        assert_eq!(session.messages[2].content, "Try again");
        assert_eq!(session.messages[3].role, "system");
        assert!(session.messages[3]
            .content
            .to_lowercase()
            .contains("weekly limit"));
        assert!(session.files_changed.contains(&"src/auth.ts".to_string()));
    }

    #[test]
    fn imports_claude_terminal_commands_as_notices_not_user_messages() {
        let transcript = [
            r#"{"type":"custom-title","customTitle":"Deploy worker","sessionId":"sess-bash"}"#,
            r#"{"type":"user","sessionId":"sess-bash","timestamp":"2026-01-01T10:00:00.000Z","message":{"role":"user","content":"<bash-input>cd apps/compute-worker && bunx wrangler secret put CONTROL_PLANE_TOKEN</bash-input><bash-stdout>Enter a secret value: ›</bash-stdout>"}}"#,
            r#"{"type":"assistant","sessionId":"sess-bash","timestamp":"2026-01-01T10:01:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Now check the deploy output."}]}}"#,
        ]
        .join("\n");

        let session = parse_claude_session(&transcript, Path::new("/tmp/bash.jsonl"));

        assert_eq!(session.title, "Deploy worker");
        assert!(!session
            .messages
            .iter()
            .any(|message| message.role == "user" && message.content.contains("bash-input")));
        assert!(session.messages.iter().any(|message| {
            message.role == "system" && message.content.starts_with("Ran: cd apps/compute-worker")
        }));
        assert!(session.tool_events.iter().any(|event| {
            event.name == "bash" && event.summary.contains("wrangler secret put")
        }));
        assert_eq!(
            session
                .messages
                .iter()
                .filter(|message| message.role == "assistant")
                .count(),
            1
        );
    }

    #[test]
    fn keeps_leading_compaction_summary_when_trimming_long_sessions() {
        let mut lines = vec![
            r#"{"type":"custom-title","customTitle":"Long session","sessionId":"sess-long"}"#.to_string(),
            r#"{"type":"user","sessionId":"sess-long","cwd":"/tmp/project","timestamp":"2026-01-01T10:00:00.000Z","message":{"role":"user","content":[{"type":"text","text":"This session is being continued from a previous conversation that ran out of context. Decisions: use Convex, never change the API contract."}]}}"#.to_string(),
        ];
        for index in 0..450 {
            let role = if index % 2 == 0 { "user" } else { "assistant" };
            let timestamp = format!("2026-01-01T10:{:02}:{:02}.000Z", index / 60, index % 60);
            lines.push(format!(
                r#"{{"type":"{role}","sessionId":"sess-long","timestamp":"{timestamp}","message":{{"role":"{role}","content":[{{"type":"text","text":"Turn {index}"}}]}}}}"#
            ));
        }

        let session = parse_claude_session(&lines.join("\n"), Path::new("/tmp/long.jsonl"));

        assert_eq!(session.title, "Long session");
        assert!(session.messages_dropped > 0);
        assert!(session.messages.len() <= 401);
        assert!(session.messages[0]
            .content
            .starts_with("This session is being continued"));
        assert!(session
            .messages
            .iter()
            .any(|message| message.content == "Turn 449"));
    }

    #[test]
    fn resolves_repository_root_from_nested_session_cwd() {
        let home = temp_home("root");
        let repo = home.join("multivrs");
        let cwd = repo.join("apps").join("compute-worker");
        std::fs::create_dir_all(&cwd).unwrap();
        std::fs::create_dir_all(repo.join(".git")).unwrap();

        let repo_root = canonical_or_original(&repo);
        assert_eq!(resolve_project_root(&cwd), Some(repo_root.clone()));

        let transcript = claude_fixture(
            &cwd.to_string_lossy(),
            "Dashboard UI",
            "Redesign the dashboard",
        );
        let session = parse_claude_session(&transcript, Path::new("/tmp/session.jsonl"));
        assert_eq!(
            session.project_root.as_deref(),
            Some(repo_root.to_string_lossy().as_ref())
        );
        assert_eq!(
            session.project_path.as_deref(),
            Some(cwd.to_string_lossy().as_ref())
        );

        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn normalizes_codex_session() {
        let transcript = [
            r#"{"type":"session_meta","timestamp":"2026-01-01T10:00:00.000Z","payload":{"id":"codex-1","cwd":"/tmp/project","timestamp":"2026-01-01T10:00:00.000Z"}}"#,
            r#"{"type":"turn_context","timestamp":"2026-01-01T10:00:01.000Z","payload":{"cwd":"/tmp/project","model":"gpt-5-codex"}}"#,
            r##"{"type":"response_item","timestamp":"2026-01-01T10:00:01.500Z","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# AGENTS.md instructions for /tmp/project\n\n<INSTRUCTIONS>\nInternal skill text that must not become a chat message.\n</INSTRUCTIONS>"}]}}"##,
            r#"{"type":"response_item","timestamp":"2026-01-01T10:00:01.750Z","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>\n  <cwd>/tmp/project</cwd>\n</environment_context>"}]}}"#,
            r##"{"type":"response_item","timestamp":"2026-01-01T10:00:02.000Z","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# Context from my IDE setup:\n\n## My request for Codex:\nAdd R2 uploads"}]}}"##,
            r#"{"type":"response_item","timestamp":"2026-01-01T10:00:03.000Z","payload":{"type":"custom_tool_call","name":"apply_patch","input":"*** Begin Patch\n*** Update File: src/storage.ts\n@@\n-a\n+b\n*** End Patch"}}"#,
            r#"{"type":"response_item","timestamp":"2026-01-01T10:00:04.000Z","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Done."}]}}"#,
        ]
        .join("\n");

        let session = parse_codex_session(&transcript, Path::new("/tmp/codex-1.jsonl"));

        assert_eq!(session.provider, CODEX_PROVIDER);
        assert_eq!(session.title, "Add R2 uploads");
        assert_eq!(session.project_path.as_deref(), Some("/tmp/project"));
        assert_eq!(session.model.as_deref(), Some("gpt-5-codex"));
        assert!(session
            .files_changed
            .contains(&"src/storage.ts".to_string()));
        assert!(session
            .messages
            .iter()
            .any(|message| { message.role == "assistant" && message.content.contains("Done.") }));
        assert!(!session
            .messages
            .iter()
            .any(|message| message.content.contains("AGENTS.md instructions")));
        assert!(!session
            .messages
            .iter()
            .any(|message| message.content.contains("environment_context")));
    }

    // ── Bridge tests: discovery, filtering, and path jailing ────────────────

    fn temp_home(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "kontinue-kode-import-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_file(path: &Path, contents: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, contents).unwrap();
    }

    fn claude_fixture(cwd: &str, title: &str, prompt: &str) -> String {
        [
            format!(
                r#"{{"type":"custom-title","customTitle":"{title}","sessionId":"sess-{title}"}}"#
            ),
            format!(
                r#"{{"type":"user","sessionId":"sess-{title}","cwd":"{cwd}","gitBranch":"main","timestamp":"2026-01-01T10:00:00.000Z","message":{{"role":"user","content":[{{"type":"text","text":"{prompt}"}}]}}}}"#
            ),
            format!(
                r#"{{"type":"assistant","sessionId":"sess-{title}","timestamp":"2026-01-01T10:01:00.000Z","message":{{"model":"claude-x","role":"assistant","content":[{{"type":"text","text":"Working on it."}}]}}}}"#
            ),
        ]
        .join("\n")
    }

    fn codex_fixture(cwd: &str, prompt: &str) -> String {
        [
            format!(
                r#"{{"type":"session_meta","timestamp":"2026-01-02T10:00:00.000Z","payload":{{"id":"codex-1","cwd":"{cwd}","timestamp":"2026-01-02T10:00:00.000Z"}}}}"#
            ),
            format!(
                r#"{{"type":"turn_context","timestamp":"2026-01-02T10:00:01.000Z","payload":{{"cwd":"{cwd}","model":"gpt-5-codex"}}}}"#
            ),
            format!(
                r##"{{"type":"response_item","timestamp":"2026-01-02T10:00:02.000Z","payload":{{"type":"message","role":"user","content":[{{"type":"input_text","text":"{prompt}"}}]}}}}"##
            ),
        ]
        .join("\n")
    }

    #[test]
    fn scans_filters_and_reads_local_sessions() {
        let home = temp_home("scan");
        let alpha = home.join("alpha-project");
        let beta = home.join("beta-project");
        std::fs::create_dir_all(&alpha).unwrap();
        std::fs::create_dir_all(&beta).unwrap();
        // Mark alpha as a git repo so the project-root resolver can find it.
        std::fs::create_dir_all(alpha.join(".git")).unwrap();
        let alpha_path = alpha.to_string_lossy().to_string();
        let alpha_root = canonical_or_original(&alpha)
            .to_string_lossy()
            .to_string();
        let beta_path = beta.to_string_lossy().to_string();

        let alpha_claude = home
            .join(".claude")
            .join("projects")
            .join("encoded-alpha")
            .join("session-alpha.jsonl");
        write_file(
            &alpha_claude,
            &claude_fixture(&alpha_path, "Fix auth", "Please fix the login flow"),
        );

        let alpha_codex = home
            .join(".codex")
            .join("sessions")
            .join("2026")
            .join("01")
            .join("02")
            .join("rollout-alpha.jsonl");
        write_file(&alpha_codex, &codex_fixture(&alpha_path, "Add R2 uploads"));

        // Codex sometimes puts a >96 KB internal context message before the real
        // prompt. The scan should fall back to a larger bounded read.
        let huge_internal = "x".repeat(120_000);
        let alpha_codex_large = home
            .join(".codex")
            .join("sessions")
            .join("2026")
            .join("01")
            .join("03")
            .join("rollout-alpha-large.jsonl");
        write_file(
            &alpha_codex_large,
            &[
                format!(
                    r#"{{"type":"session_meta","timestamp":"2026-01-03T10:00:00.000Z","payload":{{"id":"codex-large","cwd":"{alpha_path}","timestamp":"2026-01-03T10:00:00.000Z"}}}}"#
                ),
                format!(
                    r##"{{"type":"response_item","timestamp":"2026-01-03T10:00:01.000Z","payload":{{"type":"message","role":"user","content":[{{"type":"input_text","text":"# AGENTS.md instructions for {alpha_path}\n<INSTRUCTIONS>{huge_internal}</INSTRUCTIONS>"}}]}}}}"##
                ),
                r###"{"type":"response_item","timestamp":"2026-01-03T10:00:02.000Z","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"## My request:\nBig real request"}]}}"###.to_string(),
            ]
            .join("\n"),
        );

        let beta_claude = home
            .join(".claude")
            .join("projects")
            .join("encoded-beta")
            .join("session-beta.jsonl");
        write_file(
            &beta_claude,
            &claude_fixture(&beta_path, "Beta work", "Work on beta"),
        );

        let all = scan_sessions(&home, None).unwrap();
        assert_eq!(all.len(), 4, "all local sessions should be discovered");

        let filtered = scan_sessions(&home, Some(&alpha_path)).unwrap();
        assert_eq!(filtered.len(), 3, "filter should scope to one project");
        assert!(filtered.iter().all(|session| session.project_exists));
        assert!(filtered
            .iter()
            .all(|session| session.project_root.as_deref() == Some(alpha_root.as_str())));
        assert!(filtered.iter().any(|session| {
            session.provider == CLAUDE_PROVIDER && session.title == "Fix auth"
        }));
        assert!(filtered.iter().any(|session| {
            session.provider == CODEX_PROVIDER && session.title == "Add R2 uploads"
        }));
        assert!(filtered.iter().any(|session| {
            session.provider == CODEX_PROVIDER && session.title == "Big real request"
        }));

        let session = read_session(&home, CLAUDE_PROVIDER, alpha_claude.to_str().unwrap())
            .expect("claude fixture should parse");
        assert_eq!(session.messages.len(), 2);
        assert_eq!(session.title, "Fix auth");
        assert_eq!(session.project_path.as_deref(), Some(alpha_path.as_str()));
        assert!(
            session_updated_at(&home, CLAUDE_PROVIDER, alpha_claude.to_str().unwrap())
                .unwrap()
                > 0
        );

        let outside = home.join("outside.jsonl");
        write_file(&outside, "{}");
        assert!(
            read_session(&home, CLAUDE_PROVIDER, outside.to_str().unwrap()).is_err(),
            "transcripts outside the provider history root must be rejected"
        );
        assert!(
            session_updated_at(&home, CLAUDE_PROVIDER, outside.to_str().unwrap()).is_err(),
            "timestamps outside the provider history root must be rejected"
        );

        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn parses_status_and_package_scripts() {
        assert_eq!(
            parse_status_files(
                "## main...origin/main\n M src/a.ts\n?? new.ts\nR  old.ts -> renamed.ts\n"
            ),
            vec!["src/a.ts", "new.ts", "renamed.ts"]
        );

        let home = temp_home("scripts");
        write_file(
            &home.join("package.json"),
            r#"{"scripts":{"dev":"vite","test":"bun test"}}"#,
        );
        assert_eq!(
            read_package_scripts(&home),
            vec!["dev: vite", "test: bun test"]
        );
        let _ = std::fs::remove_dir_all(&home);
    }
}
