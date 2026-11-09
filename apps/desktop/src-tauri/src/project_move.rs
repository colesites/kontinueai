// Moving a project to another machine.
//
// `kode_project_bundle` packs what another machine needs to pick up the work:
// the git remote, branch and commit, plus uncommitted changes (tracked and
// untracked) as a binary-safe patch. It builds the patch with a temporary
// index, so the real index and working tree are never touched.
// `kode_project_restore` clones (or reuses) the folder on the other machine,
// checks out the branch/commit and applies the patch.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Larger patches don't fit one Convex document; commit and push instead.
const MAX_PATCH: usize = 800_000;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBundle {
    pub name: String,
    pub remote_url: Option<String>,
    pub branch: Option<String>,
    pub head_sha: Option<String>,
    /// `git diff --binary` of uncommitted work against HEAD ("" = clean).
    pub patch: String,
    pub changed_files: Vec<String>,
    /// Whether HEAD exists on the remote (else the other machine can't fetch it).
    pub head_pushed: bool,
}

fn git(root: &Path, args: &[&str]) -> Result<String, String> {
    git_env(root, args, &[])
}

fn git_env(root: &Path, args: &[&str], env: &[(&str, &Path)]) -> Result<String, String> {
    let mut command = Command::new("git");
    command.args(args).current_dir(root).env("GIT_TERMINAL_PROMPT", "0");
    for (key, value) in env {
        command.env(key, value);
    }
    let output = command.output().map_err(|e| format!("Could not run git: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn bundle(root: &Path) -> Result<ProjectBundle, String> {
    if git(root, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return Err("Only git projects can be moved. Run git init first.".into());
    }
    let name = root.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "project".into());
    let remote_url = git(root, &["remote", "get-url", "origin"]).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let branch = git(root, &["rev-parse", "--abbrev-ref", "HEAD"]).ok().map(|s| s.trim().to_string()).filter(|s| s != "HEAD");
    let head_sha = git(root, &["rev-parse", "HEAD"]).ok().map(|s| s.trim().to_string());

    // Temporary index: HEAD + everything in the working tree (respecting .gitignore).
    let index = std::env::temp_dir().join(format!("kode-move-index-{}-{}", std::process::id(), rand::random::<u32>()));
    let env = [("GIT_INDEX_FILE", index.as_path())];
    let result = (|| {
        if head_sha.is_some() {
            git_env(root, &["read-tree", "HEAD"], &env)?;
        }
        git_env(root, &["add", "-A"], &env)?;
        let base = if head_sha.is_some() { "HEAD" } else { "4b825dc642cb6eb9a060e54bf8d69288fbee4904" }; // empty tree
        let patch = git_env(root, &["diff", "--cached", "--binary", base], &env)?;
        let files = git_env(root, &["diff", "--cached", "--name-only", base], &env)?;
        Ok::<_, String>((patch, files))
    })();
    let _ = std::fs::remove_file(&index);
    let (patch, files) = result?;
    if patch.len() > MAX_PATCH {
        return Err(format!(
            "The uncommitted changes are too large to move ({} KB). Commit and push them, then move the project.",
            patch.len() / 1024
        ));
    }
    let head_pushed = match (&head_sha, &remote_url) {
        (Some(sha), Some(_)) => git(root, &["branch", "-r", "--contains", sha]).map(|s| !s.trim().is_empty()).unwrap_or(false),
        _ => false,
    };
    Ok(ProjectBundle {
        name,
        remote_url,
        branch,
        head_sha,
        patch,
        changed_files: files.lines().map(str::to_string).collect(),
        head_pushed,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub path: String,
    pub cloned: bool,
    pub warnings: Vec<String>,
}

pub fn restore(target: &Path, bundle: &ProjectBundle) -> Result<RestoreResult, String> {
    let mut warnings = Vec::new();
    let mut cloned = false;
    let has_repo = target.join(".git").exists();
    if !has_repo {
        let empty = !target.exists() || std::fs::read_dir(target).map(|mut d| d.next().is_none()).unwrap_or(false);
        if !empty {
            return Err("That folder isn't empty and isn't a git repo. Pick an empty folder or the existing checkout.".into());
        }
        let url = bundle.remote_url.as_deref().ok_or("This project has no git remote, so pick a folder that already has a copy of it.")?;
        let parent = target.parent().ok_or("Invalid folder.")?;
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        git(parent, &["clone", url, &target.to_string_lossy()])?;
        cloned = true;
    } else if bundle.remote_url.is_some() {
        if let Err(error) = git(target, &["fetch", "--all", "--prune"]) {
            warnings.push(format!("Fetch failed: {error}"));
        }
    }

    // Refuse to overwrite local work in an existing checkout.
    if !cloned && !git(target, &["status", "--porcelain"])?.trim().is_empty() {
        return Err("That checkout has uncommitted changes. Commit or stash them first, so nothing is overwritten.".into());
    }

    if let Some(sha) = &bundle.head_sha {
        let has_commit = git(target, &["cat-file", "-e", &format!("{sha}^{{commit}}")]).is_ok();
        match (&bundle.branch, has_commit) {
            (Some(branch), true) => {
                git(target, &["checkout", "-B", branch, sha])?;
            }
            (None, true) => {
                git(target, &["checkout", "--detach", sha])?;
            }
            (Some(branch), false) => {
                warnings.push(format!(
                    "Commit {} isn't on the remote yet (push it from the other machine). Checked out {branch} as it is on the remote.",
                    &sha[..sha.len().min(8)]
                ));
                if git(target, &["checkout", branch]).is_err() {
                    warnings.push(format!("Branch {branch} isn't on the remote either; staying on the default branch."));
                }
            }
            (None, false) => warnings.push("The commit isn't available here; staying on the default branch.".into()),
        }
    }

    if !bundle.patch.trim().is_empty() {
        let mut child = Command::new("git")
            .args(["apply", "--binary", "--3way", "--whitespace=nowarn", "-"])
            .current_dir(target)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        child.stdin.take().ok_or("no stdin")?.write_all(bundle.patch.as_bytes()).map_err(|e| e.to_string())?;
        let output = child.wait_with_output().map_err(|e| e.to_string())?;
        if !output.status.success() {
            warnings.push(format!(
                "Some uncommitted changes didn't apply cleanly: {}",
                String::from_utf8_lossy(&output.stderr).trim().chars().take(400).collect::<String>()
            ));
        } else {
            // `--3way` stages what it applied; leave changes unstaged like on the source.
            let _ = git(target, &["reset", "-q"]);
        }
    }
    Ok(RestoreResult { path: target.to_string_lossy().to_string(), cloned, warnings })
}

#[tauri::command]
pub async fn kode_project_bundle(root: String) -> Result<ProjectBundle, String> {
    tauri::async_runtime::spawn_blocking(move || bundle(Path::new(&root))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn kode_project_restore(target: String, bundle: ProjectBundle) -> Result<RestoreResult, String> {
    tauri::async_runtime::spawn_blocking(move || restore(&PathBuf::from(target), &bundle))
        .await
        .map_err(|e| e.to_string())?
}

/// Whether a path exists (to tell an existing checkout from a parent folder).
#[tauri::command]
pub fn kode_path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// A readable name for this machine ("Cole's MacBook Pro").
#[tauri::command]
pub fn kode_device_name() -> String {
    let try_cmd = |cmd: &str, args: &[&str]| {
        Command::new(cmd)
            .args(args)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .filter(|s| !s.is_empty())
    };
    try_cmd("scutil", &["--get", "ComputerName"])
        .or_else(|| try_cmd("hostname", &[]))
        .unwrap_or_else(|| "This computer".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sh(dir: &Path, args: &[&str]) {
        let ok = Command::new("git")
            .args(args)
            .current_dir(dir)
            .env("GIT_AUTHOR_NAME", "t")
            .env("GIT_AUTHOR_EMAIL", "t@t")
            .env("GIT_COMMITTER_NAME", "t")
            .env("GIT_COMMITTER_EMAIL", "t@t")
            .output()
            .unwrap();
        assert!(ok.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&ok.stderr));
    }

    #[test]
    fn moves_uncommitted_work_without_touching_the_source_index() {
        let base = std::env::temp_dir().join(format!("kode-move-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let origin = base.join("origin.git");
        let source = base.join("source");
        std::fs::create_dir_all(&source).unwrap();
        sh(&base, &["init", "--bare", "-q", "-b", "main", &origin.to_string_lossy()]);
        sh(&source, &["init", "-q", "-b", "main"]);
        std::fs::write(source.join("a.txt"), "one\n").unwrap();
        std::fs::write(source.join(".gitignore"), "secret.env\n").unwrap();
        sh(&source, &["add", "-A"]);
        sh(&source, &["commit", "-q", "-m", "init"]);
        sh(&source, &["remote", "add", "origin", &origin.to_string_lossy()]);
        sh(&source, &["push", "-q", "origin", "main"]);
        // Uncommitted: an edit, a new file, a staged file and an ignored file.
        std::fs::write(source.join("a.txt"), "one\ntwo\n").unwrap();
        std::fs::write(source.join("new.txt"), "fresh\n").unwrap();
        std::fs::write(source.join("staged.txt"), "staged\n").unwrap();
        sh(&source, &["add", "staged.txt"]);
        std::fs::write(source.join("secret.env"), "KEY=1\n").unwrap();
        let status_before = git(&source, &["status", "--porcelain"]).unwrap();

        let bundle = bundle(&source).unwrap();
        assert_eq!(bundle.branch.as_deref(), Some("main"));
        assert!(bundle.head_pushed);
        assert!(bundle.changed_files.contains(&"new.txt".to_string()));
        assert!(!bundle.patch.contains("KEY=1"), "ignored files must not move");
        assert_eq!(git(&source, &["status", "--porcelain"]).unwrap(), status_before, "source index untouched");

        let target = base.join("elsewhere/app");
        let result = restore(&target, &bundle).unwrap();
        assert!(result.cloned, "{:?}", result.warnings);
        assert!(result.warnings.is_empty(), "{:?}", result.warnings);
        assert_eq!(std::fs::read_to_string(target.join("a.txt")).unwrap(), "one\ntwo\n");
        assert_eq!(std::fs::read_to_string(target.join("new.txt")).unwrap(), "fresh\n");
        assert!(target.join("staged.txt").exists());
        assert!(!target.join("secret.env").exists());

        // An existing checkout with local changes is never overwritten.
        std::fs::write(target.join("a.txt"), "local edit\n").unwrap();
        assert!(restore(&target, &bundle).is_err());
        let _ = std::fs::remove_dir_all(&base);
    }
}
