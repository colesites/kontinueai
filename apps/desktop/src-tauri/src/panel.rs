// Backend for the right-hand workspace panel: git status/diff for the
// Overview and Changes tabs, and interactive terminals (real PTYs) for the
// Terminal tab. All commands are scoped to a project root the user opened.

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::ipc::Channel;

// ---------------------------------------------------------------------------
// Pull requests (GitHub CLI)
// ---------------------------------------------------------------------------

/// Run `gh` in the project with the user's login PATH. Async so network calls
/// don't block the window. Returns stdout, or a readable error.
async fn gh(root: &str, args: &[&str]) -> Result<String, String> {
    let output = tokio::process::Command::new("gh")
        .args(args)
        .current_dir(root)
        .env("PATH", crate::cli_agents::login_path())
        .env("GH_PROMPT_DISABLED", "1")
        .env("NO_COLOR", "1")
        .stdin(std::process::Stdio::null())
        .output()
        .await
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "GitHub CLI isn't installed. Install it (brew install gh), then run `gh auth login`.".to_string()
            } else {
                format!("Could not run gh: {error}")
            }
        })?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.contains("gh auth login") || stderr.contains("not logged") {
        return Err("GitHub CLI isn't signed in. Run `gh auth login` in a terminal.".into());
    }
    if stderr.contains("none of the git remotes") || stderr.contains("no git remotes") {
        return Err("This project has no GitHub remote.".into());
    }
    Err(if stderr.is_empty() { format!("gh exited with {}", output.status) } else { stderr })
}

/// GitLab / Bitbucket remotes go through their APIs; GitHub (and unknown
/// hosts, which may be GitHub Enterprise) stay on `gh`.
fn other_host(root: &str) -> Option<crate::git_hosts::GitRemote> {
    crate::git_hosts::remote_for(root).filter(|r| r.kind == "gitlab" || r.kind == "bitbucket")
}

const PR_FIELDS: &str = "number,title,url,state,isDraft,author,headRefName,baseRefName,updatedAt,reviewDecision,mergeable,mergeStateStatus,statusCheckRollup,additions,deletions";

/// Pull requests for the project's GitHub repo. `state`: "open" | "all".
#[tauri::command]
pub async fn panel_pr_list(root: String, state: Option<String>) -> Result<serde_json::Value, String> {
    let state = match state.as_deref() {
        Some("all") => "all",
        _ => "open",
    };
    if let Some(remote) = other_host(&root) {
        return crate::git_hosts::list(&remote, state).await;
    }
    let out = gh(&root, &["pr", "list", "--state", state, "--limit", "50", "--json", PR_FIELDS]).await?;
    serde_json::from_str(&out).map_err(|error| format!("Couldn't read gh output: {error}"))
}

/// Merge a PR. `method`: "squash" | "merge" | "rebase".
#[tauri::command]
pub async fn panel_pr_merge(root: String, number: u32, method: String) -> Result<(), String> {
    let flag = match method.as_str() {
        "merge" => "--merge",
        "rebase" => "--rebase",
        _ => "--squash",
    };
    if let Some(remote) = other_host(&root) {
        return crate::git_hosts::merge(&remote, number, &method).await;
    }
    let number = number.to_string();
    gh(&root, &["pr", "merge", &number, flag]).await.map(|_| ())
}

/// Review a PR. `action`: "approve" | "request_changes" | "comment".
#[tauri::command]
pub async fn panel_pr_review(
    root: String,
    number: u32,
    action: String,
    body: Option<String>,
) -> Result<(), String> {
    let flag = match action.as_str() {
        "approve" => "--approve",
        "request_changes" => "--request-changes",
        _ => "--comment",
    };
    if let Some(remote) = other_host(&root) {
        return crate::git_hosts::review(&remote, number, &action, body.as_deref().unwrap_or("")).await;
    }
    let number = number.to_string();
    let body = body.unwrap_or_default();
    let mut args = vec!["pr", "review", number.as_str(), flag];
    if !body.trim().is_empty() {
        args.push("--body");
        args.push(body.as_str());
    }
    gh(&root, &args).await.map(|_| ())
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitFileChange {
    path: String,
    /// "modified" | "added" | "deleted" | "renamed" | "untracked"
    status: String,
    additions: u32,
    deletions: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    is_repo: bool,
    branch: Option<String>,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
    files: Vec<GitFileChange>,
    additions: u32,
    deletions: u32,
    /// `origin` remote URL, if any (used for "Create PR").
    remote_url: Option<String>,
}

fn git(root: &str, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .output()
        .map_err(|error| format!("Could not run git: {error}"))
}

fn stdout(output: &std::process::Output) -> String {
    String::from_utf8_lossy(&output.stdout).to_string()
}

fn count_lines(path: &Path) -> u32 {
    // Untracked files count as all-added. Skip big or binary files.
    match std::fs::metadata(path) {
        Ok(meta) if meta.is_file() && meta.len() <= 2_000_000 => {}
        _ => return 0,
    }
    std::fs::read(path)
        .ok()
        .filter(|bytes| !bytes.contains(&0))
        .map(|bytes| bytes.iter().filter(|b| **b == b'\n').count() as u32)
        .unwrap_or(0)
}

#[tauri::command]
pub fn panel_git_status(root: String) -> Result<GitStatus, String> {
    let empty = GitStatus {
        is_repo: false,
        branch: None,
        upstream: None,
        ahead: 0,
        behind: 0,
        files: Vec::new(),
        additions: 0,
        deletions: 0,
        remote_url: None,
    };
    let inside = git(&root, &["rev-parse", "--is-inside-work-tree"])?;
    if !inside.status.success() {
        return Ok(empty);
    }

    // Git prints paths relative to the repo's top level. Limit status to the
    // project folder and strip its prefix so every path is relative to `root`
    // (the project may be a subfolder of a larger repo).
    let prefix = stdout(&git(&root, &["rev-parse", "--show-prefix"])?)
        .trim()
        .to_string();
    let status = git(&root, &["status", "--porcelain=v1", "-b", "-uall", "--", "."])?;
    let mut branch = None;
    let mut upstream = None;
    let (mut ahead, mut behind) = (0u32, 0u32);
    let mut files: Vec<GitFileChange> = Vec::new();

    for line in stdout(&status).lines() {
        if let Some(header) = line.strip_prefix("## ") {
            // "main...origin/main [ahead 1, behind 2]" or "No commits yet on main"
            let (names, tracking) = match header.split_once(" [") {
                Some((names, rest)) => (names, Some(rest.trim_end_matches(']'))),
                None => (header, None),
            };
            let names = names.trim_start_matches("No commits yet on ");
            match names.split_once("...") {
                Some((local, remote)) => {
                    branch = Some(local.to_string());
                    upstream = Some(remote.to_string());
                }
                None => branch = Some(names.to_string()),
            }
            if let Some(tracking) = tracking {
                for part in tracking.split(", ") {
                    if let Some(n) = part.strip_prefix("ahead ") {
                        ahead = n.parse().unwrap_or(0);
                    } else if let Some(n) = part.strip_prefix("behind ") {
                        behind = n.parse().unwrap_or(0);
                    }
                }
            }
            continue;
        }
        if line.len() < 4 {
            continue;
        }
        let code = &line[..2];
        let mut path = line[3..].to_string();
        if let Some((_, to)) = path.split_once(" -> ") {
            path = to.to_string();
        }
        let path = path.trim_matches('"');
        let path = path.strip_prefix(prefix.as_str()).unwrap_or(path).to_string();
        let status = match code {
            "??" => "untracked",
            c if c.contains('D') => "deleted",
            c if c.contains('R') => "renamed",
            c if c.contains('A') => "added",
            _ => "modified",
        };
        files.push(GitFileChange {
            path,
            status: status.to_string(),
            additions: 0,
            deletions: 0,
        });
    }

    // Line counts against HEAD (staged + unstaged). Fails before the first
    // commit, in which case counts stay at zero.
    if let Ok(numstat) = git(&root, &["diff", "--numstat", "--relative", "HEAD"]) {
        for line in stdout(&numstat).lines() {
            let mut parts = line.splitn(3, '\t');
            let (Some(add), Some(del), Some(path)) = (parts.next(), parts.next(), parts.next())
            else {
                continue;
            };
            let path = path.rsplit(" => ").next().unwrap_or(path).trim_end_matches('}');
            if let Some(file) = files.iter_mut().find(|f| f.path == path) {
                file.additions = add.parse().unwrap_or(0);
                file.deletions = del.parse().unwrap_or(0);
            }
        }
    }
    for file in files.iter_mut().filter(|f| f.status == "untracked") {
        file.additions = count_lines(&Path::new(&root).join(&file.path));
    }

    let additions = files.iter().map(|f| f.additions).sum();
    let deletions = files.iter().map(|f| f.deletions).sum();
    let remote_url = git(&root, &["remote", "get-url", "origin"])
        .ok()
        .filter(|o| o.status.success())
        .map(|o| stdout(&o).trim().to_string())
        .filter(|u| !u.is_empty());
    Ok(GitStatus {
        is_repo: true,
        branch,
        upstream,
        ahead,
        behind,
        files,
        additions,
        deletions,
        remote_url,
    })
}

/// Unified diff for one file against HEAD. Untracked files diff against an
/// empty file so they show as fully added.
#[tauri::command]
pub fn panel_git_diff(root: String, path: String, untracked: bool) -> Result<String, String> {
    if path.contains("..") {
        return Err("Invalid path".to_string());
    }
    let output = if untracked {
        git(&root, &["diff", "--no-color", "--no-index", "--", "/dev/null", &path])?
    } else {
        let head = git(&root, &["diff", "--no-color", "HEAD", "--", &path])?;
        if head.status.success() {
            head
        } else {
            // No commits yet: show the staged version.
            git(&root, &["diff", "--no-color", "--cached", "--", &path])?
        }
    };
    // `--no-index` exits 1 when files differ, which is the normal case.
    Ok(stdout(&output))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranches {
    is_repo: bool,
    current: Option<String>,
    branches: Vec<String>,
    /// Uncommitted files in the whole repository.
    uncommitted: u32,
}

fn git_ok(root: &str, args: &[&str]) -> Result<String, String> {
    let output = git(root, args)?;
    if output.status.success() {
        Ok(stdout(&output))
    } else {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if err.is_empty() { "git command failed".to_string() } else { err })
    }
}

fn valid_branch(root: &str, branch: &str) -> Result<(), String> {
    if branch.trim().is_empty() || branch.starts_with('-') {
        return Err("Enter a branch name.".to_string());
    }
    git_ok(root, &["check-ref-format", "--branch", branch])
        .map(|_| ())
        .map_err(|_| format!("\"{branch}\" isn't a valid branch name."))
}

#[tauri::command]
pub fn panel_git_branches(root: String) -> Result<GitBranches, String> {
    let inside = git(&root, &["rev-parse", "--is-inside-work-tree"])?;
    if !inside.status.success() {
        return Ok(GitBranches { is_repo: false, current: None, branches: Vec::new(), uncommitted: 0 });
    }
    let current = git_ok(&root, &["branch", "--show-current"])
        .ok()
        .map(|b| b.trim().to_string())
        .filter(|b| !b.is_empty());
    let branches = git_ok(&root, &["branch", "--format=%(refname:short)", "--sort=-committerdate"])?
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();
    let uncommitted = git_ok(&root, &["status", "--porcelain=v1", "-uall"])
        .map(|out| out.lines().filter(|l| !l.trim().is_empty()).count() as u32)
        .unwrap_or(0);
    Ok(GitBranches { is_repo: true, current, branches, uncommitted })
}

/// Push the current branch to origin. Sets the upstream when the branch has none.
#[tauri::command]
pub fn panel_git_push(root: String) -> Result<(), String> {
    let inside = git(&root, &["rev-parse", "--is-inside-work-tree"])?;
    if !inside.status.success() {
        return Err("Not a git repository.".to_string());
    }
    let branch = git_ok(&root, &["branch", "--show-current"])?;
    if branch.trim().is_empty() {
        return Err("This checkout is not on a branch.".to_string());
    }
    git_ok(&root, &["push", "-u", "origin", "HEAD"]).map(|_| ())
}

/// Switch to a branch, or create it from the current HEAD when `create` is set.
#[tauri::command]
pub fn panel_git_switch(root: String, branch: String, create: bool) -> Result<(), String> {
    valid_branch(&root, &branch)?;
    let args: Vec<&str> = if create { vec!["switch", "-c", &branch] } else { vec!["switch", &branch] };
    git_ok(&root, &args).map(|_| ())
}

/// Create a git worktree for `branch` (new branch if it doesn't exist) under
/// ~/.kontinue/worktrees/<repo>/<branch>. Returns the project folder inside it.
#[tauri::command]
pub fn panel_git_worktree_add(root: String, branch: String) -> Result<String, String> {
    valid_branch(&root, &branch)?;
    let top = git_ok(&root, &["rev-parse", "--show-toplevel"])?.trim().to_string();
    let prefix = git_ok(&root, &["rev-parse", "--show-prefix"])?.trim().to_string();
    let repo = Path::new(&top)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "repo".to_string());
    let home = std::env::var("HOME").map_err(|_| "Couldn't find your home folder".to_string())?;
    let safe_branch: String = branch
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '-' })
        .collect();
    let target = Path::new(&home).join(".kontinue").join("worktrees").join(&repo).join(&safe_branch);
    if target.exists() {
        return Err(format!("A worktree for \"{branch}\" already exists at {}", target.display()));
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let target_str = target.to_string_lossy().to_string();
    let exists = git(&top, &["rev-parse", "--verify", "--quiet", &format!("refs/heads/{branch}")])?
        .status
        .success();
    if exists {
        git_ok(&top, &["worktree", "add", &target_str, &branch])?;
    } else {
        git_ok(&top, &["worktree", "add", "-b", &branch, &target_str])?;
    }
    Ok(target.join(prefix.trim_end_matches('/')).to_string_lossy().trim_end_matches('/').to_string())
}

// ---------------------------------------------------------------------------
// Environment variables (from the project's environment settings)
// ---------------------------------------------------------------------------

const PROTECTED_ENV: &[&str] = &["PATH", "HOME", "SHELL", "USER", "LOGNAME", "TERM", "PWD", "TMPDIR"];

/// Valid, non-protected variables only (NAME = letters, digits, underscore).
pub fn allowed_env(env: Option<HashMap<String, String>>) -> Vec<(String, String)> {
    env.unwrap_or_default()
        .into_iter()
        .filter(|(name, _)| {
            !name.is_empty()
                && !name.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(true)
                && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                && !PROTECTED_ENV.contains(&name.as_str())
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Terminals
// ---------------------------------------------------------------------------

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    sessions: Mutex<HashMap<u32, PtySession>>,
    next_id: AtomicU32,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PtyEvent {
    Data { data: String },
    Exit,
}

#[tauri::command]
pub fn pty_spawn(
    state: tauri::State<'_, PtyState>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    cols: u16,
    rows: u16,
    on_event: Channel<PtyEvent>,
) -> Result<u32, String> {
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: rows.max(2),
            cols: cols.max(10),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("Could not open a terminal: {error}"))?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l");
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    for (name, value) in allowed_env(env) {
        cmd.env(name, value);
    }
    let dir = cwd
        .filter(|dir| Path::new(dir).is_dir())
        .or_else(|| std::env::var("HOME").ok());
    if let Some(dir) = dir {
        cmd.cwd(dir);
    }

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|error| format!("Could not start {shell}: {error}"))?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair.master.take_writer().map_err(|error| error.to_string())?;
    let killer = child.clone_killer();

    // Stream output. Keep incomplete UTF-8 sequences until the next read so
    // multi-byte characters are never split across events.
    let events = on_event.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    let valid = match std::str::from_utf8(&pending) {
                        Ok(_) => pending.len(),
                        Err(error) if error.error_len().is_none() => error.valid_up_to(),
                        Err(_) => pending.len(), // invalid bytes: send lossily
                    };
                    let chunk: Vec<u8> = pending.drain(..valid).collect();
                    if !chunk.is_empty() {
                        let data = String::from_utf8_lossy(&chunk).to_string();
                        if events.send(PtyEvent::Data { data }).is_err() {
                            break;
                        }
                    }
                }
            }
        }
        let _ = events.send(PtyEvent::Exit);
    });
    std::thread::spawn(move || {
        let _ = child.wait();
    });

    let id = state.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    state
        .sessions
        .lock()
        .map_err(|_| "Terminal state is unavailable".to_string())?
        .insert(
            id,
            PtySession {
                master: pair.master,
                writer,
                killer,
            },
        );
    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: tauri::State<'_, PtyState>, id: u32, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|_| "Terminal state is unavailable")?;
    let session = sessions.get_mut(&id).ok_or("Terminal not found")?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<'_, PtyState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|_| "Terminal state is unavailable")?;
    let session = sessions.get(&id).ok_or("Terminal not found")?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(2),
            cols: cols.max(10),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn pty_kill(state: tauri::State<'_, PtyState>, id: u32) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|_| "Terminal state is unavailable")?
        .remove(&id);
    if let Some(mut session) = session {
        let _ = session.killer.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Runs against this repository's own working tree.
    #[test]
    fn lists_branches_for_this_repo() {
        let branches = panel_git_branches(env!("CARGO_MANIFEST_DIR").to_string()).expect("branches");
        assert!(branches.is_repo);
        assert!(!branches.branches.is_empty());
        assert!(branches.current.is_some());
        assert!(valid_branch(env!("CARGO_MANIFEST_DIR"), "bad name..").is_err());
    }

    #[test]
    fn reads_status_and_diff_for_this_repo() {
        let root = env!("CARGO_MANIFEST_DIR").to_string();
        let status = panel_git_status(root.clone()).expect("git status");
        assert!(status.is_repo);
        assert!(status.branch.is_some());
        if let Some(file) = status.files.iter().find(|f| f.status != "deleted") {
            let diff = panel_git_diff(root, file.path.clone(), file.status == "untracked")
                .expect("git diff");
            assert!(diff.contains("@@") || diff.contains("Binary"), "diff for {}", file.path);
        }
    }
}
