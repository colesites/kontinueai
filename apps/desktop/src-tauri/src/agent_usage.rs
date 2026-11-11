// Plan usage of the coding agents Kode runs (Settings → Usage → Your own plans).
//
// Asked live from each CLI, without using any of the plan:
// - Claude Code: `claude -p /usage` is a local command (no model turn). It
//   refreshes the cache in <config>/.claude.json (`cachedUsageUtilization`),
//   which is then read for the structured numbers.
// - Codex: `codex app-server` answers `account/read` and
//   `account/rateLimits/read`.
// When a CLI can't be reached, the last numbers it saved are shown instead
// (Claude's cache, or the `rate_limits` snapshot in Codex session logs).
// Cursor and Gemini keep no usage locally; their dashboards have it.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageAccount {
    /// Provider instance id and label, as in Settings → Providers.
    pub id: String,
    pub label: String,
    /// "claude" or "codex".
    pub kind: String,
    /// The account's own config folder (CLAUDE_CONFIG_DIR / CODEX_HOME), if any.
    pub home_dir: String,
    /// Binary path override from Settings → Providers ("" = find on PATH).
    #[serde(default)]
    pub binary_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageLimit {
    /// "5-hour session", "Weekly · all models", "Weekly · Fable", …
    pub label: String,
    pub percent: f64,
    /// Unix ms.
    pub resets_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentUsage {
    pub id: String,
    pub label: String,
    pub kind: String,
    /// "pro", "plus", "free", … when the CLI says.
    pub plan: Option<String>,
    /// Signed-in account, so two accounts of the same CLI can be told apart.
    pub email: Option<String>,
    /// True when the numbers came straight from the CLI just now.
    pub live: bool,
    pub limits: Vec<UsageLimit>,
    /// When the CLI last recorded these numbers (Unix ms).
    pub as_of: Option<i64>,
    /// Why there is nothing to show, when there isn't.
    pub note: Option<String>,
}

fn home() -> String {
    std::env::var("HOME").unwrap_or_default()
}

fn expand(path: &str) -> PathBuf {
    let home = home();
    if path == "~" {
        PathBuf::from(home)
    } else if let Some(rest) = path.strip_prefix("~/") {
        Path::new(&home).join(rest)
    } else {
        PathBuf::from(path)
    }
}

/// "2026-11-11T16:40:00.0135+00:00" or "…Z" → Unix ms.
fn parse_rfc3339(text: &str) -> Option<i64> {
    let (date, rest) = text.split_once('T')?;
    let mut d = date.split('-').map(|p| p.parse::<i64>().ok());
    let (y, m, day) = (d.next()??, d.next()??, d.next()??);
    let (clock, offset_secs) = if let Some(c) = rest.strip_suffix('Z') {
        (c, 0)
    } else {
        let at = rest.rfind(['+', '-'])?;
        let (c, off) = rest.split_at(at);
        let sign = if off.starts_with('-') { -1 } else { 1 };
        let mut parts = off[1..].split(':').map(|p| p.parse::<i64>().ok());
        let (oh, om) = (parts.next()??, parts.next().flatten().unwrap_or(0));
        (c, sign * (oh * 3600 + om * 60))
    };
    let mut t = clock.split(':');
    let (h, min) = (t.next()?.parse::<i64>().ok()?, t.next()?.parse::<i64>().ok()?);
    let sec_f: f64 = t.next().unwrap_or("0").parse().ok()?;
    // Days from 1970-01-01 (Howard Hinnant's days_from_civil).
    let yy = if m <= 2 { y - 1 } else { y };
    let era = if yy >= 0 { yy } else { yy - 399 } / 400;
    let yoe = yy - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400 + h * 3600 + min * 60 - offset_secs;
    Some(secs * 1000 + (sec_f * 1000.0).round() as i64)
}

fn iso_ms(value: &Value) -> Option<i64> {
    parse_rfc3339(value.as_str()?)
}

fn claude_usage(account: &UsageAccount) -> AgentUsage {
    let mut out = AgentUsage {
        id: account.id.clone(),
        label: account.label.clone(),
        kind: "claude".into(),
        plan: None,
        email: None,
        live: false,
        limits: Vec::new(),
        as_of: None,
        note: None,
    };
    // Claude Code keeps .claude.json inside CLAUDE_CONFIG_DIR when it is set.
    let config_dir = if !account.home_dir.trim().is_empty() {
        Some(expand(account.home_dir.trim()))
    } else {
        crate::cli_agents::login_var("CLAUDE_CONFIG_DIR").map(|d| expand(&d))
    };
    let file = match &config_dir {
        Some(dir) => dir.join(".claude.json"),
        None => Path::new(&home()).join(".claude.json"),
    };
    let Some(json) = std::fs::read_to_string(&file).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()) else {
        out.note = Some("Claude Code hasn't been set up on this Mac yet.".into());
        return out;
    };
    out.email = json.pointer("/oauthAccount/emailAddress").and_then(Value::as_str).map(str::to_string);
    let Some(cache) = json.get("cachedUsageUtilization") else {
        out.note = Some("No plan usage yet. Claude Code saves it after you use it with a Claude plan.".into());
        return out;
    };
    out.as_of = cache.get("fetchedAtMs").and_then(Value::as_i64);
    let limits = cache.pointer("/utilization/limits").and_then(Value::as_array).cloned().unwrap_or_default();
    for limit in &limits {
        let Some(percent) = limit.get("percent").and_then(Value::as_f64) else { continue };
        let kind = limit.get("kind").and_then(Value::as_str).unwrap_or("");
        let scope = limit.pointer("/scope/model/display_name").and_then(Value::as_str);
        let label = match (kind, scope) {
            ("session", _) => "5-hour session".to_string(),
            ("weekly_all", _) => "Weekly · all models".to_string(),
            (_, Some(model)) => format!("Weekly · {model}"),
            (other, None) => other.replace('_', " "),
        };
        out.limits.push(UsageLimit { label, percent, resets_at: limit.get("resets_at").and_then(iso_ms) });
    }
    // Older caches have only five_hour / seven_day.
    if out.limits.is_empty() {
        for (key, label) in [("five_hour", "5-hour session"), ("seven_day", "Weekly · all models")] {
            if let Some(entry) = cache.pointer(&format!("/utilization/{key}")) {
                if let Some(percent) = entry.get("utilization").and_then(Value::as_f64) {
                    out.limits.push(UsageLimit { label: label.into(), percent, resets_at: entry.get("resets_at").and_then(iso_ms) });
                }
            }
        }
    }
    if out.limits.is_empty() {
        out.note = Some("No plan limits recorded.".into());
    }
    out
}

fn window_label(minutes: i64) -> String {
    match minutes {
        300 => "5-hour window".into(),
        10_080 => "Weekly".into(),
        43_200 => "Monthly".into(),
        m if m % 1440 == 0 => format!("{}-day window", m / 1440),
        m if m % 60 == 0 => format!("{}-hour window", m / 60),
        m => format!("{m}-minute window"),
    }
}

/// Newest session logs first (sessions/YYYY/MM/DD/*.jsonl), at most `max`.
fn newest_sessions(root: &Path, max: usize) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let sorted_dirs = |dir: &Path| -> Vec<PathBuf> {
        let mut entries: Vec<PathBuf> = std::fs::read_dir(dir).map(|r| r.flatten().map(|e| e.path()).collect()).unwrap_or_default();
        entries.sort();
        entries.reverse();
        entries
    };
    for year in sorted_dirs(root).into_iter().filter(|p| p.is_dir()) {
        for month in sorted_dirs(&year).into_iter().filter(|p| p.is_dir()) {
            for day in sorted_dirs(&month).into_iter().filter(|p| p.is_dir()) {
                let mut files: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(&day)
                    .map(|r| r.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "jsonl")).collect::<Vec<_>>())
                    .unwrap_or_default()
                    .into_iter()
                    .map(|p| (std::fs::metadata(&p).and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), p))
                    .collect();
                files.sort_by(|a, b| b.0.cmp(&a.0));
                for (_, file) in files {
                    out.push(file);
                    if out.len() >= max {
                        return out;
                    }
                }
            }
        }
    }
    out
}

fn codex_usage(account: &UsageAccount) -> AgentUsage {
    let mut out = AgentUsage {
        id: account.id.clone(),
        label: account.label.clone(),
        kind: "codex".into(),
        plan: None,
        email: None,
        live: false,
        limits: Vec::new(),
        as_of: None,
        note: None,
    };
    let root = if !account.home_dir.trim().is_empty() {
        expand(account.home_dir.trim())
    } else {
        crate::cli_agents::login_var("CODEX_HOME").map(|d| expand(&d)).unwrap_or_else(|| Path::new(&home()).join(".codex"))
    };
    // The newest snapshot is in the newest session that has one.
    for file in newest_sessions(&root.join("sessions"), 20) {
        let Ok(handle) = std::fs::File::open(&file) else { continue };
        let mut latest: Option<Value> = None;
        for line in BufReader::new(handle).lines().map_while(Result::ok) {
            if line.contains("\"rate_limits\":{") {
                latest = serde_json::from_str::<Value>(&line).ok();
            }
        }
        let Some(event) = latest else { continue };
        let Some(limits) = event.pointer("/payload/rate_limits") else { continue };
        out.as_of = event.get("timestamp").and_then(iso_ms);
        out.plan = limits.get("plan_type").and_then(Value::as_str).map(str::to_string);
        for key in ["primary", "secondary"] {
            let Some(window) = limits.get(key).filter(|w| w.is_object()) else { continue };
            let Some(percent) = window.get("used_percent").and_then(Value::as_f64) else { continue };
            let minutes = window.get("window_minutes").and_then(Value::as_i64).unwrap_or(0);
            out.limits.push(UsageLimit {
                label: window_label(minutes),
                percent,
                resets_at: window.get("resets_at").and_then(Value::as_i64).map(|s| s * 1000),
            });
        }
        break;
    }
    if out.limits.is_empty() {
        out.note = Some("No plan usage yet. Codex records it when you use it signed in with ChatGPT.".into());
    }
    out
}

fn account_command(account: &UsageAccount, default_binary: &str, home_var: &str) -> tokio::process::Command {
    let binary = if account.binary_path.trim().is_empty() { default_binary } else { account.binary_path.trim() };
    let mut cmd = tokio::process::Command::new(crate::cli_agents::program_path(&expand(binary).to_string_lossy()));
    cmd.env("PATH", crate::cli_agents::login_path());
    for name in ["CLAUDE_CONFIG_DIR", "CODEX_HOME"] {
        if let Some(value) = crate::cli_agents::login_var(name) {
            cmd.env(name, value);
        }
    }
    if !account.home_dir.trim().is_empty() {
        cmd.env(home_var, expand(account.home_dir.trim()));
    }
    cmd.current_dir(std::env::temp_dir())
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    cmd
}

/// `claude -p /usage`: a local command (no model turn) that refreshes the cache.
async fn refresh_claude(account: &UsageAccount) -> bool {
    let mut cmd = account_command(account, "claude", "CLAUDE_CONFIG_DIR");
    cmd.args(["-p", "/usage", "--output-format", "json", "--no-session-persistence"]);
    let Ok(Ok(out)) = tokio::time::timeout(std::time::Duration::from_secs(30), cmd.output()).await else { return false };
    serde_json::from_slice::<Value>(&out.stdout)
        .ok()
        .is_some_and(|v| v.get("is_error") == Some(&Value::Bool(false)))
}

async fn claude_live(account: &UsageAccount) -> AgentUsage {
    let refreshed = refresh_claude(account).await;
    let mut usage = claude_usage(account);
    usage.live = refreshed && !usage.limits.is_empty();
    usage
}

/// Ask `codex app-server` for the account and its rate limits.
async fn codex_live(account: &UsageAccount) -> Option<(Option<String>, Value)> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let mut cmd = account_command(account, "codex", "CODEX_HOME");
    cmd.arg("app-server").stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped());
    let mut child = cmd.spawn().ok()?;
    let mut stdin = child.stdin.take()?;
    let stdout = child.stdout.take()?;
    let requests = [
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"kontinue-kode","title":"Kontinue Kode","version":"1"},"capabilities":null}}"#,
        r#"{"jsonrpc":"2.0","method":"initialized"}"#,
        r#"{"jsonrpc":"2.0","id":2,"method":"account/read","params":{"refreshToken":false}}"#,
        r#"{"jsonrpc":"2.0","id":3,"method":"account/rateLimits/read"}"#,
    ];
    for request in requests {
        stdin.write_all(format!("{request}\n").as_bytes()).await.ok()?;
    }
    stdin.flush().await.ok()?;
    let mut lines = BufReader::new(stdout).lines();
    let mut email = None;
    let read = async {
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(message) = serde_json::from_str::<Value>(&line) else { continue };
            match message.get("id").and_then(Value::as_i64) {
                Some(2) => email = message.pointer("/result/account/email").and_then(Value::as_str).map(str::to_string),
                Some(3) => return message.get("result").cloned(),
                _ => {}
            }
        }
        None
    };
    let result = tokio::time::timeout(std::time::Duration::from_secs(20), read).await.ok().flatten();
    let _ = child.start_kill();
    Some((email, result?))
}

async fn codex_usage_live(account: &UsageAccount) -> AgentUsage {
    let Some((email, result)) = codex_live(account).await else {
        return codex_usage(account);
    };
    let mut out = AgentUsage {
        id: account.id.clone(),
        label: account.label.clone(),
        kind: "codex".into(),
        plan: None,
        email,
        live: true,
        limits: Vec::new(),
        as_of: Some(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)),
        note: None,
    };
    let limits = result.get("rateLimits").cloned().unwrap_or(Value::Null);
    out.plan = limits.get("planType").and_then(Value::as_str).map(str::to_string);
    for key in ["primary", "secondary"] {
        let Some(window) = limits.get(key).filter(|w| w.is_object()) else { continue };
        let Some(percent) = window.get("usedPercent").and_then(Value::as_f64) else { continue };
        let minutes = window.get("windowDurationMins").and_then(Value::as_i64).unwrap_or(0);
        out.limits.push(UsageLimit {
            label: window_label(minutes),
            percent,
            resets_at: window.get("resetsAt").and_then(Value::as_i64).map(|s| s * 1000),
        });
    }
    if out.limits.is_empty() {
        out.note = Some(if out.email.is_none() {
            "Codex isn't signed in with ChatGPT, so there are no plan limits.".into()
        } else {
            "Codex didn't report any plan limits.".into()
        });
    }
    out
}

#[tauri::command]
pub async fn settings_agent_usage(accounts: Vec<UsageAccount>) -> Vec<AgentUsage> {
    // Every account at once; each CLI answers in a second or two.
    let jobs = accounts.iter().map(|account| async move {
        match account.kind.as_str() {
            "claude" => Some(claude_live(account).await),
            "codex" => Some(codex_usage_live(account).await),
            _ => None,
        }
    });
    futures_util::future::join_all(jobs).await.into_iter().flatten().collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn parses_timestamps() {
        assert_eq!(super::parse_rfc3339("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(super::parse_rfc3339("2026-11-07T07:53:18.315Z"), Some(1_794_037_998_315));
        assert_eq!(super::parse_rfc3339("2026-11-11T16:40:00+00:00"), super::parse_rfc3339("2026-11-11T17:40:00+01:00"));
    }

    /// Reads this Mac's real data: `cargo test --lib agent_usage -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn reads_local_agent_usage() {
        let accounts = ["claude", "codex"]
            .iter()
            .map(|kind| super::UsageAccount {
                id: kind.to_string(),
                label: kind.to_string(),
                kind: kind.to_string(),
                home_dir: String::new(),
                binary_path: String::new(),
            })
            .collect();
        for usage in super::settings_agent_usage(accounts).await {
            println!("{}", serde_json::to_string(&usage).unwrap());
        }
    }
}
