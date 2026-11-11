// Pull requests on GitLab (gitlab.com or self-hosted) and Bitbucket Cloud,
// next to GitHub (which stays on the `gh` CLI in panel.rs).
//
// The host comes from the project's `origin` remote. GitLab and Bitbucket use
// their REST APIs with a token the user adds once; it lives in the system
// keychain and is never returned to the webview. Results are converted to the
// same shape `gh pr list --json` gives, so the PR tab works unchanged.

use serde::Serialize;
use serde_json::{json, Value};
use std::path::Path;

const KEYRING_SERVICE: &str = "kontinue-kode-git-hosts";
/// Error prefix the UI turns into an "add token" form.
pub const NEEDS_TOKEN: &str = "[[needs-token:";

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitRemote {
    /// "github" | "gitlab" | "bitbucket" | "other"
    pub kind: String,
    pub host: String,
    /// "group/sub/repo" (GitLab) or "workspace/repo".
    pub path: String,
}

/// Parse a remote URL (ssh, scp-style or https).
pub fn parse_remote(url: &str) -> Option<(String, String)> {
    let url = url.trim();
    let (host, path) = if let Some(rest) = url.strip_prefix("ssh://") {
        let rest = rest.split_once('@').map(|(_, r)| r).unwrap_or(rest);
        let (host, path) = rest.split_once('/')?;
        (host.split(':').next()?.to_string(), path.to_string())
    } else if let Some(rest) = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://")) {
        let rest = rest.split_once('@').map(|(_, r)| r).unwrap_or(rest);
        let (host, path) = rest.split_once('/')?;
        (host.split(':').next()?.to_string(), path.to_string())
    } else if let Some((user_host, path)) = url.split_once(':') {
        // scp-style: git@host:path
        let host = user_host.split_once('@').map(|(_, h)| h).unwrap_or(user_host);
        (host.to_string(), path.to_string())
    } else {
        return None;
    };
    let path = path.trim_end_matches('/').trim_end_matches(".git").to_string();
    if host.is_empty() || path.is_empty() {
        return None;
    }
    Some((host.to_lowercase(), path))
}

pub fn classify(host: &str, path: &str, known_gitlab: &[String]) -> GitRemote {
    let kind = if host == "github.com" || host.ends_with(".github.com") {
        "github"
    } else if host == "bitbucket.org" {
        "bitbucket"
    } else if host.contains("gitlab") || known_gitlab.iter().any(|h| h == host) {
        "gitlab"
    } else {
        "other"
    };
    GitRemote { kind: kind.into(), host: host.into(), path: path.into() }
}

fn token_entry(host: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, host).map_err(|e| e.to_string())
}

fn read_token(host: &str) -> Option<String> {
    token_entry(host).ok()?.get_password().ok().filter(|t| !t.trim().is_empty())
}

/// Self-hosted GitLab hosts the user added a token for (so we recognize them).
fn known_gitlab_hosts() -> Vec<String> {
    let path = crate::kode_hooks::kode_dir().map(|d| d.join("gitlab-hosts.json"));
    path.and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok())
        .unwrap_or_default()
}

fn remember_gitlab_host(host: &str) {
    let mut hosts = known_gitlab_hosts();
    if hosts.iter().any(|h| h == host) {
        return;
    }
    hosts.push(host.to_string());
    if let Some(dir) = crate::kode_hooks::kode_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join("gitlab-hosts.json"), serde_json::to_string(&hosts).unwrap_or_default());
    }
}

pub fn remote_for(root: &str) -> Option<GitRemote> {
    let output = std::process::Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(Path::new(root))
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let url = String::from_utf8_lossy(&output.stdout);
    let (host, path) = parse_remote(&url)?;
    Some(classify(&host, &path, &known_gitlab_hosts()))
}

#[tauri::command(async)]
pub fn kode_git_remote(root: String) -> Option<GitRemote> {
    remote_for(&root)
}

/// Whether a token is saved for a host (the token itself never leaves Rust).
#[tauri::command(async)]
pub fn kode_git_host_token_status(host: String) -> bool {
    read_token(&host).is_some()
}

/// Save (or with an empty value, remove) a host's token. Bitbucket tokens are
/// "email:api-token"; GitLab tokens are a personal access token.
#[tauri::command(async)]
pub fn kode_git_host_token_set(host: String, kind: String, token: String) -> Result<(), String> {
    let entry = token_entry(&host)?;
    if token.trim().is_empty() {
        let _ = entry.delete_credential();
        return Ok(());
    }
    entry.set_password(token.trim()).map_err(|e| e.to_string())?;
    if kind == "gitlab" {
        remember_gitlab_host(&host);
    }
    Ok(())
}

fn needs_token(remote: &GitRemote, message: &str) -> String {
    format!("{NEEDS_TOKEN}{}:{}]] {message}", remote.kind, remote.host)
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("Kontinue-Kode")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .unwrap_or_default()
}

fn authed(remote: &GitRemote, request: reqwest::RequestBuilder, token: &str) -> reqwest::RequestBuilder {
    if remote.kind == "gitlab" {
        request.header("PRIVATE-TOKEN", token)
    } else if let Some((user, secret)) = token.split_once(':') {
        request.basic_auth(user, Some(secret))
    } else {
        request.bearer_auth(token)
    }
}

async fn send(remote: &GitRemote, request: reqwest::RequestBuilder) -> Result<Value, String> {
    let response = request.send().await.map_err(|e| format!("Could not reach {}: {e}", remote.host))?;
    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err(needs_token(remote, "The saved token was rejected. Add a new one."));
    }
    if !status.is_success() {
        let detail = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| {
                v.get("message")
                    .or_else(|| v.pointer("/error/message"))
                    .map(|m| m.as_str().map(str::to_string).unwrap_or_else(|| m.to_string()))
            })
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(format!("{}: {detail}", remote.host));
    }
    Ok(serde_json::from_str(&text).unwrap_or(Value::Null))
}

fn gitlab_project(remote: &GitRemote) -> String {
    format!("https://{}/api/v4/projects/{}", remote.host, urlencode(&remote.path))
}

fn urlencode(text: &str) -> String {
    text.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

// --- Normalizing to the gh shape -------------------------------------------

pub fn normalize_gitlab(mr: &Value) -> Value {
    let state = match mr.get("state").and_then(Value::as_str).unwrap_or("") {
        "merged" => "MERGED",
        "closed" | "locked" => "CLOSED",
        _ => "OPEN",
    };
    let conflicts = mr.get("has_conflicts").and_then(Value::as_bool).unwrap_or(false);
    let pipeline = mr.pointer("/head_pipeline/status").or_else(|| mr.pointer("/pipeline/status")).and_then(Value::as_str);
    let checks: Vec<Value> = pipeline
        .map(|status| {
            let (st, conclusion) = match status {
                "success" => ("COMPLETED", "SUCCESS"),
                "failed" | "canceled" => ("COMPLETED", "FAILURE"),
                "skipped" | "manual" => ("COMPLETED", "SKIPPED"),
                _ => ("IN_PROGRESS", ""),
            };
            vec![json!({ "__typename": "CheckRun", "name": "pipeline", "status": st, "conclusion": conclusion })]
        })
        .unwrap_or_default();
    let detailed = mr.get("detailed_merge_status").and_then(Value::as_str).unwrap_or("");
    json!({
        "number": mr.get("iid").cloned().unwrap_or(json!(0)),
        "title": mr.get("title").cloned().unwrap_or(json!("")),
        "url": mr.get("web_url").cloned().unwrap_or(json!("")),
        "state": state,
        "isDraft": mr.get("draft").and_then(Value::as_bool).or_else(|| mr.get("work_in_progress").and_then(Value::as_bool)).unwrap_or(false),
        "author": { "login": mr.pointer("/author/username").cloned().unwrap_or(json!("")) },
        "headRefName": mr.get("source_branch").cloned().unwrap_or(json!("")),
        "baseRefName": mr.get("target_branch").cloned().unwrap_or(json!("")),
        "updatedAt": mr.get("updated_at").cloned().unwrap_or(json!("")),
        "reviewDecision": if detailed == "not_approved" { "REVIEW_REQUIRED" } else { "" },
        "mergeable": if conflicts { "CONFLICTING" } else if detailed == "mergeable" { "MERGEABLE" } else { "UNKNOWN" },
        "mergeStateStatus": if detailed == "mergeable" || detailed.is_empty() { "CLEAN" } else { "BLOCKED" },
        "statusCheckRollup": checks,
        "additions": 0,
        "deletions": 0,
    })
}

pub fn normalize_bitbucket(pr: &Value) -> Value {
    let state = match pr.get("state").and_then(Value::as_str).unwrap_or("") {
        "MERGED" => "MERGED",
        "DECLINED" | "SUPERSEDED" => "CLOSED",
        _ => "OPEN",
    };
    let participants = pr.get("participants").and_then(Value::as_array).cloned().unwrap_or_default();
    let changes = participants.iter().any(|p| p.get("state").and_then(Value::as_str) == Some("changes_requested"));
    let approved = participants.iter().any(|p| p.get("approved").and_then(Value::as_bool).unwrap_or(false));
    json!({
        "number": pr.get("id").cloned().unwrap_or(json!(0)),
        "title": pr.get("title").cloned().unwrap_or(json!("")),
        "url": pr.pointer("/links/html/href").cloned().unwrap_or(json!("")),
        "state": state,
        "isDraft": pr.get("draft").and_then(Value::as_bool).unwrap_or(false),
        "author": { "login": pr.pointer("/author/nickname").or_else(|| pr.pointer("/author/display_name")).cloned().unwrap_or(json!("")) },
        "headRefName": pr.pointer("/source/branch/name").cloned().unwrap_or(json!("")),
        "baseRefName": pr.pointer("/destination/branch/name").cloned().unwrap_or(json!("")),
        "updatedAt": pr.get("updated_on").cloned().unwrap_or(json!("")),
        "reviewDecision": if changes { "CHANGES_REQUESTED" } else if approved { "APPROVED" } else { "REVIEW_REQUIRED" },
        "mergeable": "UNKNOWN",
        "mergeStateStatus": "CLEAN",
        "statusCheckRollup": [],
        "additions": 0,
        "deletions": 0,
    })
}

// --- Operations --------------------------------------------------------------

fn token_or_ask(remote: &GitRemote) -> Result<String, String> {
    read_token(&remote.host).ok_or_else(|| {
        needs_token(
            remote,
            if remote.kind == "gitlab" {
                "Add a GitLab personal access token (scope: api) to see merge requests."
            } else {
                "Add your Atlassian email and a Bitbucket API token to see pull requests."
            },
        )
    })
}

pub async fn list(remote: &GitRemote, state: &str) -> Result<Value, String> {
    let token = token_or_ask(remote)?;
    let http = client();
    match remote.kind.as_str() {
        "gitlab" => {
            let scope = if state == "all" { "all" } else { "opened" };
            let url = format!("{}/merge_requests?state={scope}&per_page=50&order_by=updated_at", gitlab_project(remote));
            let list = send(remote, authed(remote, http.get(url), &token)).await?;
            Ok(Value::Array(list.as_array().cloned().unwrap_or_default().iter().map(normalize_gitlab).collect()))
        }
        _ => {
            let filter = if state == "all" { "" } else { "&state=OPEN" };
            let url = format!("https://api.bitbucket.org/2.0/repositories/{}/pullrequests?pagelen=50{filter}&fields=%2Bvalues.participants", remote.path);
            let page = send(remote, authed(remote, http.get(url), &token)).await?;
            Ok(Value::Array(page.get("values").and_then(Value::as_array).cloned().unwrap_or_default().iter().map(normalize_bitbucket).collect()))
        }
    }
}

pub async fn merge(remote: &GitRemote, number: u32, method: &str) -> Result<(), String> {
    let token = token_or_ask(remote)?;
    let http = client();
    let request = match remote.kind.as_str() {
        "gitlab" => http
            .put(format!("{}/merge_requests/{number}/merge", gitlab_project(remote)))
            .json(&json!({ "squash": method == "squash" })),
        _ => http
            .post(format!("https://api.bitbucket.org/2.0/repositories/{}/pullrequests/{number}/merge", remote.path))
            .json(&json!({ "merge_strategy": match method { "rebase" => "fast_forward", "merge" => "merge_commit", _ => "squash" } })),
    };
    send(remote, authed(remote, request, &token)).await.map(|_| ())
}

pub async fn review(remote: &GitRemote, number: u32, action: &str, body: &str) -> Result<(), String> {
    let token = token_or_ask(remote)?;
    let http = client();
    let comment = |text: &str| -> reqwest::RequestBuilder {
        match remote.kind.as_str() {
            "gitlab" => http
                .post(format!("{}/merge_requests/{number}/notes", gitlab_project(remote)))
                .json(&json!({ "body": text })),
            _ => http
                .post(format!("https://api.bitbucket.org/2.0/repositories/{}/pullrequests/{number}/comments", remote.path))
                .json(&json!({ "content": { "raw": text } })),
        }
    };
    match (remote.kind.as_str(), action) {
        ("gitlab", "approve") => {
            send(remote, authed(remote, http.post(format!("{}/merge_requests/{number}/approve", gitlab_project(remote))), &token)).await?;
        }
        (_, "approve") => {
            send(remote, authed(remote, http.post(format!("https://api.bitbucket.org/2.0/repositories/{}/pullrequests/{number}/approve", remote.path)), &token)).await?;
        }
        ("bitbucket", "request_changes") => {
            send(remote, authed(remote, http.post(format!("https://api.bitbucket.org/2.0/repositories/{}/pullrequests/{number}/request-changes", remote.path)), &token)).await?;
        }
        // GitLab has no "request changes"; it's a comment there.
        _ => {}
    }
    let text = if body.trim().is_empty() && action == "request_changes" && remote.kind == "gitlab" { "Changes requested." } else { body };
    if !text.trim().is_empty() {
        send(remote, authed(remote, comment(text), &token)).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_classifies_remotes() {
        assert_eq!(parse_remote("git@gitlab.com:group/sub/repo.git"), Some(("gitlab.com".into(), "group/sub/repo".into())));
        assert_eq!(parse_remote("https://user@bitbucket.org/ws/repo.git"), Some(("bitbucket.org".into(), "ws/repo".into())));
        assert_eq!(parse_remote("ssh://git@git.acme.dev:2222/team/app.git\n"), Some(("git.acme.dev".into(), "team/app".into())));
        assert_eq!(parse_remote("https://github.com/o/r"), Some(("github.com".into(), "o/r".into())));
        assert_eq!(classify("gitlab.com", "a/b", &[]).kind, "gitlab");
        assert_eq!(classify("git.acme.dev", "a/b", &["git.acme.dev".into()]).kind, "gitlab");
        assert_eq!(classify("bitbucket.org", "a/b", &[]).kind, "bitbucket");
        assert_eq!(classify("code.corp", "a/b", &[]).kind, "other");
        assert_eq!(urlencode("group/sub repo"), "group%2Fsub%20repo");
    }

    #[test]
    fn normalizes_gitlab_and_bitbucket() {
        let mr = json!({ "iid": 7, "title": "Add CI", "web_url": "https://gitlab.com/g/r/-/merge_requests/7", "state": "opened",
            "draft": false, "author": { "username": "sam" }, "source_branch": "ci", "target_branch": "main",
            "updated_at": "2026-01-01T00:00:00Z", "has_conflicts": false, "detailed_merge_status": "mergeable",
            "head_pipeline": { "status": "failed" } });
        let pr = normalize_gitlab(&mr);
        assert_eq!(pr["number"], 7);
        assert_eq!(pr["mergeable"], "MERGEABLE");
        assert_eq!(pr["statusCheckRollup"][0]["conclusion"], "FAILURE");
        assert_eq!(pr["author"]["login"], "sam");

        let bb = json!({ "id": 3, "title": "Fix", "state": "OPEN", "links": { "html": { "href": "https://bitbucket.org/w/r/pull-requests/3" } },
            "author": { "nickname": "ana" }, "source": { "branch": { "name": "fix" } }, "destination": { "branch": { "name": "main" } },
            "updated_on": "2026-01-02T00:00:00Z", "participants": [{ "state": "changes_requested", "approved": false }] });
        let pr = normalize_bitbucket(&bb);
        assert_eq!(pr["number"], 3);
        assert_eq!(pr["reviewDecision"], "CHANGES_REQUESTED");
        assert_eq!(pr["headRefName"], "fix");
        assert_eq!(normalize_bitbucket(&json!({ "state": "MERGED" }))["state"], "MERGED");
    }
}
