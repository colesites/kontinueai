// Diagnostics for `/triage`: what's installed, which versions, and the state
// of the project, as text an agent (Claude Code or Codex) can act on.
// Never includes environment values or file contents, only names and versions.

use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCheck {
    name: String,
    path: Option<String>,
    version: Option<String>,
    error: Option<String>,
}

const TOOLS: &[(&str, &[&str])] = &[
    ("git", &["--version"]),
    ("node", &["--version"]),
    ("bun", &["--version"]),
    ("npm", &["--version"]),
    ("pnpm", &["--version"]),
    ("gh", &["--version"]),
    ("claude", &["--version"]),
    ("codex", &["--version"]),
    ("cursor-agent", &["--version"]),
    ("sqlite3", &["-version"]),
    ("cargo", &["--version"]),
];

fn first_line(text: &[u8]) -> String {
    String::from_utf8_lossy(text).lines().next().unwrap_or("").trim().chars().take(160).collect()
}

fn check(name: &str, args: &[&str]) -> ToolCheck {
    let path = crate::cli_agents::find_binary(name);
    let Some(binary) = path.clone() else {
        return ToolCheck { name: name.into(), path: None, version: None, error: Some("not found on PATH".into()) };
    };
    match Command::new(&binary).args(args).env("PATH", crate::cli_agents::login_path()).output() {
        Ok(out) if out.status.success() => ToolCheck {
            name: name.into(),
            path: Some(binary.to_string_lossy().into()),
            version: Some(first_line(if out.stdout.is_empty() { &out.stderr } else { &out.stdout })),
            error: None,
        },
        Ok(out) => ToolCheck {
            name: name.into(),
            path: Some(binary.to_string_lossy().into()),
            version: None,
            error: Some(format!("exited {}: {}", out.status, first_line(&out.stderr))),
        },
        Err(e) => ToolCheck { name: name.into(), path: Some(binary.to_string_lossy().into()), version: None, error: Some(e.to_string()) },
    }
}

fn git(root: &Path, args: &[&str]) -> String {
    Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().chars().take(4_000).collect())
        .unwrap_or_default()
}

/// Lockfiles / manifests present at the root (names only).
fn project_files(root: &Path) -> Vec<String> {
    [
        "package.json", "bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
        "Cargo.toml", "Cargo.lock", "pyproject.toml", "requirements.txt", "go.mod", ".nvmrc", ".tool-versions",
        "node_modules",
    ]
    .iter()
    .filter(|name| root.join(name).exists())
    .map(|name| name.to_string())
    .collect()
}

/// Markdown report. `root` adds the project section.
pub fn report(root: Option<&Path>, tools: &[ToolCheck]) -> String {
    let mut out = String::new();
    out.push_str("## Diagnostics\n\n");
    out.push_str(&format!(
        "- App: Kontinue {} ({} {})\n",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
    if let Ok(version) = Command::new("sw_vers").arg("-productVersion").output() {
        if version.status.success() {
            out.push_str(&format!("- macOS: {}\n", first_line(&version.stdout)));
        }
    }
    out.push_str("\n### Tools\n");
    for tool in tools {
        match (&tool.version, &tool.error) {
            (Some(version), _) => out.push_str(&format!("- {}: {} ({})\n", tool.name, version, tool.path.as_deref().unwrap_or(""))),
            (None, Some(error)) => out.push_str(&format!("- {}: {}\n", tool.name, error)),
            _ => {}
        }
    }
    if let Some(root) = root {
        out.push_str(&format!("\n### Project\n- Folder: {}\n", root.display()));
        let files = project_files(root);
        out.push_str(&format!("- Files: {}\n", if files.is_empty() { "none of the usual manifests".into() } else { files.join(", ") }));
        let branch = git(root, &["rev-parse", "--abbrev-ref", "HEAD"]);
        if !branch.is_empty() {
            out.push_str(&format!("- Branch: {branch}\n"));
            let status = git(root, &["status", "--short"]);
            let changed = status.lines().count();
            out.push_str(&format!("- Uncommitted changes: {changed} file(s)\n"));
            let log = git(root, &["log", "--oneline", "-5"]);
            if !log.is_empty() {
                out.push_str("- Recent commits:\n");
                for line in log.lines() {
                    out.push_str(&format!("  - {line}\n"));
                }
            }
        }
    }
    out
}

#[tauri::command]
pub async fn kode_triage_report(root: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let tools: Vec<ToolCheck> = TOOLS.iter().map(|(name, args)| check(name, args)).collect();
        report(root.as_deref().map(Path::new).filter(|p| p.is_dir()), &tools)
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_lists_tools_and_project_without_env_values() {
        let tools = vec![
            ToolCheck { name: "git".into(), path: Some("/usr/bin/git".into()), version: Some("git version 2.44".into()), error: None },
            ToolCheck { name: "codex".into(), path: None, version: None, error: Some("not found on PATH".into()) },
        ];
        let dir = std::env::temp_dir().join(format!("kode-triage-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("package.json"), "{}").unwrap();
        let text = report(Some(&dir), &tools);
        assert!(text.contains("- git: git version 2.44 (/usr/bin/git)"));
        assert!(text.contains("- codex: not found on PATH"));
        assert!(text.contains("- Files: package.json"));
        assert!(!text.contains("HOME="));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
