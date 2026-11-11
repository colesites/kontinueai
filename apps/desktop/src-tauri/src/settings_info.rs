// Read-only facts for Settings → Source control and Storage: which git tools
// are installed, the worktrees Kode created under ~/.kontinue/worktrees, and
// how much disk ~/.kontinue uses. The only write is removing a worktree, and
// only one inside ~/.kontinue/worktrees.

use serde::Serialize;
use std::path::{Path, PathBuf};
use tokio::process::Command;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    /// "git" | "gh"
    pub id: String,
    pub available: bool,
    pub version: Option<String>,
    /// gh: the signed-in account, or why it isn't signed in.
    pub detail: Option<String>,
    pub signed_in: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub repo: String,
    pub branch: String,
    pub bytes: u64,
    /// Uncommitted or untracked files.
    pub changes: u32,
    /// Seconds since epoch of the last change to the folder.
    pub modified: u64,
    /// Commits on this branch that the default branch doesn't have.
    pub ahead: Option<u32>,
    /// Commits not on any remote branch.
    pub unpushed: Option<u32>,
    /// The default branch it was compared with (e.g. origin/main).
    pub default_branch: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StorageEntry {
    pub id: String,
    pub path: String,
    pub bytes: u64,
}

fn kontinue_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "Couldn't find your home folder".to_string())?;
    Ok(Path::new(&home).join(".kontinue"))
}

/// Where Kode puts worktrees: Settings → Storage → Worktree location, or
/// ~/.kontinue/worktrees. "~" expands to the home folder.
pub fn worktree_base(location: Option<&str>) -> Result<PathBuf, String> {
    match location.map(str::trim).filter(|l| !l.is_empty()) {
        Some(loc) => {
            let home = std::env::var("HOME").map_err(|_| "Couldn't find your home folder".to_string())?;
            let expanded = if loc == "~" {
                home
            } else if let Some(rest) = loc.strip_prefix("~/") {
                format!("{home}/{rest}")
            } else {
                loc.to_string()
            };
            let path = PathBuf::from(expanded);
            if !path.is_absolute() {
                return Err("Worktree location must be a full path, like ~/worktrees.".into());
            }
            Ok(path)
        }
        None => Ok(kontinue_dir()?.join("worktrees")),
    }
}

fn is_under_base(target: &Path, location: Option<&str>) -> bool {
    let mut bases = vec![kontinue_dir().map(|d| d.join("worktrees"))];
    if location.is_some() {
        bases.push(worktree_base(location));
    }
    bases.into_iter().flatten().filter_map(|b| std::fs::canonicalize(b).ok()).any(|base| {
        target.starts_with(&base) && target != base && target.parent() != Some(base.as_path())
    })
}

async fn git_out(dir: &Path, args: &[&str]) -> Option<String> {
    run("git", args, Some(dir))
        .await
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

async fn default_branch(dir: &Path) -> Option<String> {
    if let Some(head) = git_out(dir, &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).await {
        return Some(head);
    }
    for candidate in ["origin/main", "origin/master", "main", "master"] {
        if git_out(dir, &["rev-parse", "--verify", "--quiet", candidate]).await.is_some() {
            return Some(candidate.to_string());
        }
    }
    None
}

async fn run(program: &str, args: &[&str], cwd: Option<&Path>) -> Option<std::process::Output> {
    let mut cmd = Command::new(crate::cli_agents::program_path(program));
    cmd.args(args)
        .env("PATH", crate::cli_agents::login_path())
        .env("GH_PROMPT_DISABLED", "1")
        .env("NO_COLOR", "1")
        .stdin(std::process::Stdio::null());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    tokio::time::timeout(std::time::Duration::from_secs(20), cmd.output())
        .await
        .ok()?
        .ok()
}

fn first_line(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).lines().next().unwrap_or_default().trim().to_string()
}

/// Folder size in bytes (`du -sk`, fast even for big node_modules).
async fn size_of(path: &Path) -> u64 {
    if !path.exists() {
        return 0;
    }
    let Some(out) = run("du", &["-sk", &path.to_string_lossy()], None).await else {
        return 0;
    };
    first_line(&out.stdout)
        .split_whitespace()
        .next()
        .and_then(|kb| kb.parse::<u64>().ok())
        .map(|kb| kb * 1024)
        .unwrap_or(0)
}

#[tauri::command]
pub async fn settings_tool_status() -> Vec<ToolStatus> {
    let mut out = Vec::new();

    // git and gh are checked at the same time.
    let (git, gh) = tokio::join!(run("git", &["--version"], None), run("gh", &["--version"], None));
    out.push(ToolStatus {
        id: "git".into(),
        available: git.as_ref().is_some_and(|o| o.status.success()),
        version: git
            .as_ref()
            .filter(|o| o.status.success())
            .map(|o| first_line(&o.stdout).trim_start_matches("git version ").to_string()),
        detail: None,
        signed_in: None,
    });

    let gh_ok = gh.as_ref().is_some_and(|o| o.status.success());
    let (detail, signed_in) = if gh_ok {
        match run("gh", &["auth", "status", "--active"], None).await {
            Some(o) => {
                // gh prints status to stderr on older versions, stdout on newer.
                let text = format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr));
                let account = text
                    .lines()
                    .find_map(|l| l.split(" account ").nth(1))
                    .and_then(|rest| rest.split_whitespace().next())
                    .map(|s| s.to_string());
                if o.status.success() {
                    (account.or(Some("Signed in".into())), Some(true))
                } else {
                    (Some("Not signed in. Run `gh auth login`.".into()), Some(false))
                }
            }
            None => (None, None),
        }
    } else {
        (None, None)
    };
    out.push(ToolStatus {
        id: "gh".into(),
        available: gh_ok,
        version: gh
            .as_ref()
            .filter(|o| o.status.success())
            .map(|o| first_line(&o.stdout).trim_start_matches("gh version ").to_string()),
        detail,
        signed_in,
    });
    out
}

#[tauri::command]
pub async fn settings_list_worktrees(location: Option<String>) -> Result<Vec<WorktreeInfo>, String> {
    let mut roots = vec![kontinue_dir()?.join("worktrees")];
    if let Ok(custom) = worktree_base(location.as_deref()) {
        if !roots.contains(&custom) {
            roots.push(custom);
        }
    }
    let mut out = Vec::new();
    for root in roots {
        let Ok(repos) = std::fs::read_dir(&root) else { continue };
        for repo in repos.flatten() {
            if !repo.path().is_dir() {
                continue;
            }
            let Ok(branches) = std::fs::read_dir(repo.path()) else { continue };
            for entry in branches.flatten() {
                let path = entry.path();
                // Only real worktrees (a .git file pointing at the main repo).
                if !path.is_dir() || !path.join(".git").is_file() {
                    continue;
                }
                let branch = git_out(&path, &["rev-parse", "--abbrev-ref", "HEAD"])
                    .await
                    .unwrap_or_else(|| entry.file_name().to_string_lossy().to_string());
                let changes = git_out(&path, &["status", "--porcelain"])
                    .await
                    .map(|o| o.lines().filter(|l| !l.trim().is_empty()).count() as u32)
                    .unwrap_or(0);
                let default = default_branch(&path).await;
                let ahead = match &default {
                    Some(base) => git_out(&path, &["rev-list", "--count", &format!("{base}..HEAD")])
                        .await
                        .and_then(|n| n.parse().ok()),
                    None => None,
                };
                let unpushed = git_out(&path, &["rev-list", "--count", "HEAD", "--not", "--remotes"])
                    .await
                    .and_then(|n| n.parse().ok());
                let modified = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                out.push(WorktreeInfo {
                    path: path.to_string_lossy().to_string(),
                    repo: repo.file_name().to_string_lossy().to_string(),
                    branch,
                    bytes: size_of(&path).await,
                    changes,
                    modified,
                    ahead,
                    unpushed,
                    default_branch: default,
                });
            }
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

/// Remove a Kode worktree. Refuses paths outside ~/.kontinue/worktrees, and
/// worktrees with uncommitted changes unless `force`. The branch is kept.
#[tauri::command]
pub async fn settings_remove_worktree(path: String, force: bool, location: Option<String>) -> Result<(), String> {
    let target = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
    if !is_under_base(&target, location.as_deref()) || !target.join(".git").is_file() {
        return Err("Only worktrees Kode created can be removed here.".into());
    }
    let target_str = target.to_string_lossy().to_string();
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(&target_str);
    let out = run("git", &args, Some(&target))
        .await
        .ok_or_else(|| "Could not run git".to_string())?;
    if out.status.success() {
        // Drop the repo folder once its last worktree is gone.
        if let Some(parent) = target.parent() {
            let _ = std::fs::remove_dir(parent);
        }
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() { "git worktree remove failed".into() } else { err })
    }
}

#[tauri::command]
pub async fn settings_storage_usage(location: Option<String>) -> Result<Vec<StorageEntry>, String> {
    let base = kontinue_dir()?;
    let mut out = Vec::new();
    for id in ["worktrees", "plugins", "skills", "commands", "kode", "acp-agents"] {
        // Worktrees live wherever Settings → Storage → Worktree location points.
        let path = if id == "worktrees" { worktree_base(location.as_deref())? } else { base.join(id) };
        out.push(StorageEntry {
            id: id.into(),
            path: path.to_string_lossy().to_string(),
            bytes: size_of(&path).await,
        });
    }
    Ok(out)
}

/// Folders the coding agents Kode runs keep on this Mac (sessions, caches,
/// installed versions). Shown in Settings → Storage; read only.
const AGENT_FOLDERS: &[(&str, &str, &[&str])] = &[
    ("claude", "Claude Code", &[".claude", ".local/share/claude"]),
    ("codex", "Codex", &[".codex"]),
    ("cursor", "Cursor", &[".cursor", ".local/share/cursor-agent"]),
    ("gemini", "Gemini and Antigravity", &[".gemini"]),
    ("opencode", "OpenCode", &[".local/share/opencode", ".config/opencode"]),
    ("copilot", "GitHub Copilot", &[".copilot"]),
    ("qwen", "Qwen Code", &[".qwen"]),
];

#[derive(Serialize)]
pub struct AgentFolder {
    pub path: String,
    pub bytes: u64,
    /// Biggest folders and files inside, largest first.
    pub children: Vec<StorageEntry>,
}

#[derive(Serialize)]
pub struct AgentStorage {
    pub id: String,
    pub name: String,
    pub bytes: u64,
    pub folders: Vec<AgentFolder>,
}

/// An agent's folders, following the settings that move them
/// (CLAUDE_CONFIG_DIR, CODEX_HOME, XDG_*), read from the login shell.
fn agent_dirs(id: &str, dirs: &[&str], home: &str) -> Vec<PathBuf> {
    let var = |name: &str| crate::cli_agents::login_var(name).map(|v| expand_home(&v, home));
    dirs.iter()
        .map(|dir| match (id, *dir) {
            ("claude", ".claude") => var("CLAUDE_CONFIG_DIR"),
            ("codex", ".codex") => var("CODEX_HOME"),
            (_, d) if d.starts_with(".local/share/") => var("XDG_DATA_HOME").map(|x| x.join(&d[".local/share/".len()..])),
            (_, d) if d.starts_with(".config/") => var("XDG_CONFIG_HOME").map(|x| x.join(&d[".config/".len()..])),
            _ => None,
        }
        .unwrap_or_else(|| Path::new(home).join(dir)))
        .collect()
}

fn agent_roots() -> Vec<PathBuf> {
    let Ok(home) = std::env::var("HOME") else { return Vec::new() };
    AGENT_FOLDERS.iter().flat_map(|(id, _, dirs)| agent_dirs(id, dirs, &home)).collect()
}

/// `du -k -d 1`: the folder's total and each item directly inside it.
async fn folder_breakdown(root: &Path) -> Option<AgentFolder> {
    if !root.is_dir() {
        return None;
    }
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        Command::new("du").args(["-k", "-d", "1"]).arg(root).stdin(std::process::Stdio::null()).output(),
    )
    .await
    .ok()?
    .ok()?;
    let mut total = 0;
    let mut children = Vec::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        let Some((kb, path)) = line.split_once('\t') else { continue };
        let bytes = kb.trim().parse::<u64>().unwrap_or(0) * 1024;
        if Path::new(path) == root {
            total = bytes;
        } else {
            let id = Path::new(path).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            children.push(StorageEntry { id, path: path.to_string(), bytes });
        }
    }
    // du -d 1 lists folders only; loose files make up the rest.
    let listed: u64 = children.iter().map(|c| c.bytes).sum();
    if total > listed + 1024 * 1024 {
        children.push(StorageEntry { id: "Other files".into(), path: root.to_string_lossy().to_string(), bytes: total - listed });
    }
    children.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    children.truncate(8);
    Some(AgentFolder { path: root.to_string_lossy().to_string(), bytes: total, children })
}

/// A provider account's own config folder (CLAUDE_CONFIG_DIR / CODEX_HOME).
#[derive(serde::Deserialize)]
pub struct ExtraAgentFolder {
    pub agent: String,
    pub path: String,
}

fn expand_home(path: &str, home: &str) -> PathBuf {
    if path == "~" {
        PathBuf::from(home)
    } else if let Some(rest) = path.strip_prefix("~/") {
        Path::new(home).join(rest)
    } else {
        PathBuf::from(path)
    }
}

#[tauri::command]
pub async fn settings_agent_storage(
    extra: Option<Vec<ExtraAgentFolder>>,
    only: Option<String>,
) -> Result<Vec<AgentStorage>, String> {
    let home = std::env::var("HOME").map_err(|_| "Couldn't find your home folder".to_string())?;
    let extra = extra.unwrap_or_default();
    // Measure every agent at once; the slowest folder sets the pace.
    // `only`: one agent, so the page can show each as soon as it's measured.
    let jobs = AGENT_FOLDERS.iter().filter(|(id, _, _)| only.as_deref().is_none_or(|o| o == *id)).map(|(id, name, dirs)| {
        let mut roots = agent_dirs(id, dirs, &home);
        for folder in extra.iter().filter(|f| f.agent == *id) {
            let path = expand_home(folder.path.trim(), &home);
            // Skip duplicates and folders already counted inside another root.
            if path.is_absolute() && !roots.iter().any(|r| path.starts_with(r) || r.starts_with(&path)) {
                roots.push(path);
            }
        }
        async move {
            let measured = futures_util::future::join_all(roots.iter().map(|root| folder_breakdown(root))).await;
            // A folder that doesn't exist (agent not installed, or moved away) is simply left out.
            let folders: Vec<AgentFolder> = measured.into_iter().flatten().collect();
            (!folders.is_empty()).then(|| AgentStorage {
                id: (*id).into(),
                name: (*name).into(),
                bytes: folders.iter().map(|f| f.bytes).sum(),
                folders,
            })
        }
    });
    let mut out: Vec<AgentStorage> = futures_util::future::join_all(jobs).await.into_iter().flatten().collect();
    out.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    Ok(out)
}

/// Open a macOS Privacy & Security pane (Settings → Snapshots).
#[tauri::command]
pub async fn settings_open_privacy_pane(pane: String) -> Result<(), String> {
    let anchor = match pane.as_str() {
        "screen" => "Privacy_ScreenCapture",
        "accessibility" => "Privacy_Accessibility",
        _ => return Err("Unknown pane".into()),
    };
    let url = format!("x-apple.systempreferences:com.apple.preference.security?{anchor}");
    Command::new("open")
        .arg(url)
        .status()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Show a folder in Finder (only inside ~/.kontinue or the worktree location).
#[tauri::command]
pub async fn settings_reveal(
    path: String,
    location: Option<String>,
    extra_roots: Option<Vec<String>>,
) -> Result<(), String> {
    let base = std::fs::canonicalize(kontinue_dir()?).map_err(|e| e.to_string())?;
    let target = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let home = std::env::var("HOME").unwrap_or_default();
    let in_agent_folder = agent_roots()
        .into_iter()
        .chain(extra_roots.unwrap_or_default().iter().map(|r| expand_home(r.trim(), &home)))
        .chain(worktree_base(location.as_deref()).ok())
        .filter_map(|root| std::fs::canonicalize(root).ok())
        .any(|root| target.starts_with(root));
    if !target.starts_with(&base) && !is_under_base(&target, location.as_deref()) && !in_agent_folder {
        return Err("Only folders in ~/.kontinue or an agent's own folder can be shown here.".into());
    }
    Command::new("open")
        .arg(&target)
        .status()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// System notification for a Kode thread (finished, failed, needs input).
#[tauri::command(async)]
pub fn notify_send(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

/// macOS alert sounds the notification sound can use.
pub const SOUNDS: &[&str] = &[
    "Basso", "Blow", "Bottle", "Frog", "Funk", "Glass", "Hero", "Morse", "Ping", "Pop", "Purr", "Sosumi", "Submarine", "Tink",
];

/// Play a system sound (Settings → General → Notifications → Sound).
#[tauri::command]
pub async fn play_sound(name: String) -> Result<(), String> {
    if !SOUNDS.contains(&name.as_str()) {
        return Err("Unknown sound".into());
    }
    Command::new("afplay")
        .arg(format!("/System/Library/Sounds/{name}.aiff"))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanResult {
    pub removed: u32,
    pub bytes: u64,
}

/// Delete Kode's saved attachments and snapshots (<project>/.kode/attachments)
/// older than `days`. Nothing else in the project is touched.
#[tauri::command]
pub async fn settings_clean_attachments(roots: Vec<String>, days: u32) -> Result<CleanResult, String> {
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(u64::from(days.max(1)) * 86_400);
    let mut result = CleanResult { removed: 0, bytes: 0 };
    for root in roots {
        let dir = Path::new(&root).join(".kode").join("attachments");
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if !meta.is_file() || meta.modified().map(|m| m > cutoff).unwrap_or(true) {
                continue;
            }
            if std::fs::remove_file(entry.path()).is_ok() {
                result.removed += 1;
                result.bytes += meta.len();
            }
        }
    }
    Ok(result)
}

#[cfg(test)]
mod agent_storage_tests {
    /// Prints this Mac's agent folders: `cargo test --lib agent_storage -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn measures_agent_folders() {
        let agents = super::settings_agent_storage(None, None).await.unwrap();
        for agent in &agents {
            println!("{} {} MB", agent.name, agent.bytes >> 20);
            for folder in &agent.folders {
                let top: Vec<String> = folder.children.iter().take(4).map(|c| format!("{} {}MB", c.id, c.bytes >> 20)).collect();
                println!("  {} {} MB: {}", folder.path, folder.bytes >> 20, top.join(", "));
            }
        }
        assert!(!agents.is_empty());
    }
}

