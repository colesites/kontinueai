// Find MCP servers you already set up in other tools so Settings → MCP can
// import them: Claude Code (~/.claude.json, user and per-project), Claude
// Desktop, Cursor (~/.cursor/mcp.json and <project>/.cursor/mcp.json), a
// project's .mcp.json, and Codex (~/.codex/config.toml).

use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FoundMcpServer {
    /// Where it was found, e.g. "Claude Code", "Cursor", "Project (.mcp.json)".
    source: String,
    name: String,
    command: Option<String>,
    args: Vec<String>,
    env: BTreeMap<String, String>,
    url: Option<String>,
    /// HTTP headers can't be carried over (Kode signs in to HTTP servers with OAuth).
    has_headers: bool,
}

fn read_json(path: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// `{ "mcpServers": { name: { command, args, env } | { type, url, headers } } }`
fn from_mcp_servers(source: &str, servers: Option<&Value>, out: &mut Vec<FoundMcpServer>) {
    let Some(map) = servers.and_then(Value::as_object) else { return };
    for (name, spec) in map {
        let command = spec.get("command").and_then(Value::as_str).map(str::to_string);
        let url = spec
            .get("url")
            .or_else(|| spec.get("serverUrl"))
            .and_then(Value::as_str)
            .map(str::to_string);
        if command.is_none() && url.is_none() {
            continue;
        }
        let args = spec
            .get("args")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect())
            .unwrap_or_default();
        let env = spec
            .get("env")
            .and_then(Value::as_object)
            .map(|e| {
                e.iter()
                    .filter_map(|(k, v)| v.as_str().map(|v| (k.clone(), v.to_string())))
                    .collect()
            })
            .unwrap_or_default();
        let has_headers = spec.get("headers").and_then(Value::as_object).map(|h| !h.is_empty()).unwrap_or(false);
        out.push(FoundMcpServer { source: source.into(), name: name.clone(), command, args, env, url, has_headers });
    }
}

/// The few TOML shapes Codex uses for MCP servers:
/// `[mcp_servers.<name>]` with `command`, `args`, `url`, and an optional
/// `[mcp_servers.<name>.env]` table (or inline `env = { K = "v" }`).
fn from_codex_toml(text: &str, out: &mut Vec<FoundMcpServer>) {
    #[derive(Default)]
    struct Draft {
        command: Option<String>,
        args: Vec<String>,
        env: BTreeMap<String, String>,
        url: Option<String>,
        has_headers: bool,
    }
    let mut servers: Vec<(String, Draft)> = Vec::new();
    // (server index, in its env table?)
    let mut current: Option<(usize, bool)> = None;
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') {
            current = None;
            let header = line.trim_matches(|c| c == '[' || c == ']').trim();
            let Some(rest) = header.strip_prefix("mcp_servers.") else { continue };
            let (name, sub) = match rest.split_once('.') {
                Some((name, sub)) => (unquote(name), Some(sub)),
                None => (unquote(rest), None),
            };
            let index = match servers.iter().position(|(n, _)| *n == name) {
                Some(i) => i,
                None => {
                    servers.push((name, Draft::default()));
                    servers.len() - 1
                }
            };
            match sub {
                None => current = Some((index, false)),
                Some("env") => current = Some((index, true)),
                Some(s) if s.starts_with("http_headers") || s.starts_with("headers") => servers[index].1.has_headers = true,
                Some(_) => {}
            }
            continue;
        }
        let Some((index, in_env)) = current else { continue };
        let Some((key, value)) = line.split_once('=') else { continue };
        let key = unquote(key.trim());
        let value = value.trim();
        let draft = &mut servers[index].1;
        if in_env {
            if let Some(v) = toml_string(value) {
                draft.env.insert(key, v);
            }
            continue;
        }
        match key.as_str() {
            "command" => draft.command = toml_string(value),
            "url" => draft.url = toml_string(value),
            "args" => draft.args = toml_string_array(value),
            "env" => {
                // Inline table: env = { KEY = "value", … }
                let inner = value.trim_start_matches('{').trim_end_matches('}');
                for pair in inner.split(',') {
                    if let Some((k, v)) = pair.split_once('=') {
                        if let Some(v) = toml_string(v.trim()) {
                            draft.env.insert(unquote(k.trim()), v);
                        }
                    }
                }
            }
            "http_headers" | "headers" | "bearer_token_env_var" => draft.has_headers = true,
            _ => {}
        }
    }
    for (name, d) in servers {
        if d.command.is_none() && d.url.is_none() {
            continue;
        }
        out.push(FoundMcpServer {
            source: "Codex".into(),
            name,
            command: d.command,
            args: d.args,
            env: d.env,
            url: d.url,
            has_headers: d.has_headers,
        });
    }
}

fn unquote(s: &str) -> String {
    s.trim().trim_matches('"').trim_matches('\'').to_string()
}

fn toml_string(value: &str) -> Option<String> {
    let v = value.trim();
    let quote = v.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let end = v[1..].find(quote)? + 1;
    Some(v[1..end].replace("\\\\", "\\").replace("\\\"", "\""))
}

fn toml_string_array(value: &str) -> Vec<String> {
    let inner = value.trim().trim_start_matches('[').trim_end_matches(']');
    let mut out = Vec::new();
    let mut rest = inner;
    while let Some(start) = rest.find(['"', '\'']) {
        let quote = rest.as_bytes()[start] as char;
        let after = &rest[start + 1..];
        let Some(end) = after.find(quote) else { break };
        out.push(after[..end].to_string());
        rest = &after[end + 1..];
    }
    out
}

fn same_path(a: &str, b: &Path) -> bool {
    let a = Path::new(a);
    a == b || std::fs::canonicalize(a).ok().as_deref() == std::fs::canonicalize(b).ok().as_deref()
}

pub fn discover(home: &Path, project_roots: &[PathBuf]) -> Vec<FoundMcpServer> {
    let mut out = Vec::new();
    if let Some(claude) = read_json(&home.join(".claude.json")) {
        from_mcp_servers("Claude Code", claude.get("mcpServers"), &mut out);
        if let Some(projects) = claude.get("projects").and_then(Value::as_object) {
            for (path, project) in projects {
                if project_roots.iter().any(|root| same_path(path, root)) {
                    let name = Path::new(path).file_name().and_then(|n| n.to_str()).unwrap_or("project");
                    from_mcp_servers(&format!("Claude Code ({name})"), project.get("mcpServers"), &mut out);
                }
            }
        }
    }
    let desktop = home.join("Library/Application Support/Claude/claude_desktop_config.json");
    if let Some(config) = read_json(&desktop) {
        from_mcp_servers("Claude Desktop", config.get("mcpServers"), &mut out);
    }
    if let Some(config) = read_json(&home.join(".cursor/mcp.json")) {
        from_mcp_servers("Cursor", config.get("mcpServers"), &mut out);
    }
    for root in project_roots {
        let name = root.file_name().and_then(|n| n.to_str()).unwrap_or("project");
        if let Some(config) = read_json(&root.join(".mcp.json")) {
            from_mcp_servers(&format!("{name} (.mcp.json)"), config.get("mcpServers"), &mut out);
        }
        if let Some(config) = read_json(&root.join(".cursor/mcp.json")) {
            from_mcp_servers(&format!("{name} (Cursor)"), config.get("mcpServers"), &mut out);
        }
    }
    let codex_home = std::env::var("CODEX_HOME").map(PathBuf::from).unwrap_or_else(|_| home.join(".codex"));
    if let Ok(text) = std::fs::read_to_string(codex_home.join("config.toml")) {
        from_codex_toml(&text, &mut out);
    }
    out
}

#[tauri::command(async)]
pub fn kode_mcp_discover(project_roots: Option<Vec<String>>) -> Result<Vec<FoundMcpServer>, String> {
    let home = std::env::var("HOME").map(PathBuf::from).map_err(|_| "No home folder.".to_string())?;
    let roots: Vec<PathBuf> = project_roots
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .collect();
    Ok(discover(&home, &roots))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_json_and_codex_configs() {
        let dir = std::env::temp_dir().join(format!("kode-mcp-import-{}", std::process::id()));
        let project = dir.join("app");
        std::fs::create_dir_all(dir.join(".cursor")).unwrap();
        std::fs::create_dir_all(dir.join(".codex")).unwrap();
        std::fs::create_dir_all(&project).unwrap();
        std::fs::write(
            dir.join(".claude.json"),
            serde_json::json!({
                "mcpServers": { "Sanity": { "type": "http", "url": "https://mcp.sanity.io", "headers": { "A": "b" } } },
                "projects": { project.to_string_lossy(): { "mcpServers": { "local": { "command": "node", "args": ["s.js"] } } } }
            })
            .to_string(),
        )
        .unwrap();
        std::fs::write(
            dir.join(".cursor/mcp.json"),
            r#"{"mcpServers":{"context7":{"command":"npx","args":["-y","@upstash/context7-mcp"],"env":{"KEY":"v"}}}}"#,
        )
        .unwrap();
        std::fs::write(project.join(".mcp.json"), r#"{"mcpServers":{"db":{"command":"db-mcp"}}}"#).unwrap();
        std::fs::write(
            dir.join(".codex/config.toml"),
            "model = \"x\"\n[mcp_servers.github]\ncommand = \"npx\"\nargs = [\"-y\", \"gh-mcp\"]\n[mcp_servers.github.env]\nTOKEN = \"t\"\n[mcp_servers.\"docs\"]\nurl = \"https://docs.example/mcp\"\n[other]\ncommand = \"no\"\n",
        )
        .unwrap();
        std::env::remove_var("CODEX_HOME");
        let found = discover(&dir, &[project.clone()]);
        let names: Vec<(String, String)> = found.iter().map(|f| (f.source.clone(), f.name.clone())).collect();
        assert!(names.contains(&("Claude Code".into(), "Sanity".into())));
        assert!(names.contains(&("Claude Code (app)".into(), "local".into())));
        assert!(names.contains(&("Cursor".into(), "context7".into())));
        assert!(names.contains(&("app (.mcp.json)".into(), "db".into())));
        let github = found.iter().find(|f| f.name == "github").unwrap();
        assert_eq!(github.args, vec!["-y", "gh-mcp"]);
        assert_eq!(github.env.get("TOKEN").map(String::as_str), Some("t"));
        assert_eq!(found.iter().find(|f| f.name == "docs").unwrap().url.as_deref(), Some("https://docs.example/mcp"));
        assert!(found.iter().find(|f| f.name == "Sanity").unwrap().has_headers);
        assert!(!found.iter().any(|f| f.name == "other"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
