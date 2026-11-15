// Background tasks: long-running commands the agent (or you) start and leave
// running, like a dev server or a watcher. Unlike `kode_run_command`, which
// waits for the command to finish, these keep running and keep their latest
// output, so the agent can check on them and you can see and stop them in
// the right panel (Servers / Background tasks), like Claude Code.
//
// Each task runs in its own process group so Stop ends the whole tree
// (`bun dev` → node → …). Everything still running is stopped when the app
// quits.

use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::io::{AsyncBufReadExt, BufReader};

const LOG_CAP: usize = 64 * 1024;
const MAX_FINISHED: usize = 50;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskInfo {
    id: String,
    command: String,
    name: Option<String>,
    root: String,
    chat_id: Option<String>,
    started_at: i64,
    ended_at: Option<i64>,
    /// "running" | "exited" | "stopped" | "failed"
    status: String,
    exit_code: Option<i32>,
    /// First local port the task printed (`localhost:3000`) — a server.
    port: Option<u16>,
    pid: Option<u32>,
}

struct Task {
    info: TaskInfo,
    log: String,
}

type Registry = Arc<Mutex<HashMap<String, Task>>>;

fn registry() -> &'static Registry {
    static R: OnceLock<Registry> = OnceLock::new();
    R.get_or_init(|| Arc::new(Mutex::new(HashMap::new())))
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn port_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        Regex::new(r"(?i)(?:https?://)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})|(?:listening|running|started|ready)\b[^\n]{0,40}?\bport\s*:?\s*(\d{2,5})")
            .expect("valid regex")
    })
}

/// The first local port mentioned in a line of output.
pub(crate) fn detect_port(line: &str) -> Option<u16> {
    let caps = port_re().captures(line)?;
    let raw = caps.get(1).or_else(|| caps.get(2))?.as_str();
    raw.parse::<u16>().ok().filter(|port| *port >= 80)
}

/// Strip terminal colour codes from output.
pub(crate) fn strip_ansi(line: &str) -> String {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"\x1b\[[0-9;?]*[ -/]*[@-~]").expect("valid regex"))
        .replace_all(line, "")
        .to_string()
}

fn append_log(id: &str, line: &str) {
    let mut tasks = registry().lock().unwrap();
    let Some(task) = tasks.get_mut(id) else { return };
    let clean = strip_ansi(line);
    if task.info.port.is_none() {
        task.info.port = detect_port(&clean);
    }
    task.log.push_str(&clean);
    task.log.push('\n');
    if task.log.len() > LOG_CAP {
        let cut = task.log.len() - LOG_CAP;
        let cut = task.log[cut..].find('\n').map(|i| cut + i + 1).unwrap_or(cut);
        task.log.drain(..cut);
    }
}

fn prune_finished(tasks: &mut HashMap<String, Task>) {
    let mut finished: Vec<(i64, String)> = tasks
        .values()
        .filter(|task| task.info.status != "running")
        .map(|task| (task.info.ended_at.unwrap_or(0), task.info.id.clone()))
        .collect();
    if finished.len() <= MAX_FINISHED {
        return;
    }
    finished.sort();
    for (_, id) in finished.iter().take(finished.len() - MAX_FINISHED) {
        tasks.remove(id);
    }
}

#[tauri::command]
pub async fn kode_bg_start(
    root: String,
    command: String,
    name: Option<String>,
    chat_id: Option<String>,
    env: Option<HashMap<String, String>>,
) -> Result<TaskInfo, String> {
    if command.trim().is_empty() {
        return Err("No command.".into());
    }
    let dir = std::path::Path::new(&root);
    if !dir.is_dir() {
        return Err("The project folder doesn't exist.".into());
    }
    let mut cmd = tokio::process::Command::new("/bin/sh");
    cmd.arg("-lc")
        .arg(&command)
        .current_dir(dir)
        .env("PATH", crate::cli_agents::login_path())
        .env("FORCE_COLOR", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    cmd.process_group(0);
    for (key, value) in crate::panel::allowed_env(env) {
        cmd.env(key, value);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Could not start the command: {e}"))?;
    let id = format!("task-{}-{}", now_ms(), rand::random::<u16>());
    let info = TaskInfo {
        id: id.clone(),
        command: command.clone(),
        name,
        root: root.clone(),
        chat_id,
        started_at: now_ms(),
        ended_at: None,
        status: "running".into(),
        exit_code: None,
        port: None,
        pid: child.id(),
    };
    {
        let mut tasks = registry().lock().unwrap();
        prune_finished(&mut tasks);
        tasks.insert(id.clone(), Task { info: info.clone(), log: String::new() });
    }
    for stream in [child.stdout.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>), child.stderr.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>)].into_iter().flatten() {
        let id = id.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stream).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                append_log(&id, &line);
            }
        });
    }
    let wait_id = id.clone();
    tauri::async_runtime::spawn(async move {
        let status = child.wait().await;
        let mut tasks = registry().lock().unwrap();
        if let Some(task) = tasks.get_mut(&wait_id) {
            task.info.ended_at = Some(now_ms());
            if task.info.status == "running" {
                match status {
                    Ok(status) => {
                        task.info.exit_code = status.code();
                        task.info.status = if status.success() { "exited".into() } else { "failed".into() };
                    }
                    Err(_) => task.info.status = "failed".into(),
                }
            }
        }
    });
    Ok(info)
}

/// Tasks for a chat (or all when no chat is given), running first, newest first.
#[tauri::command(async)]
pub fn kode_bg_list(chat_id: Option<String>) -> Vec<TaskInfo> {
    let tasks = registry().lock().unwrap();
    let mut list: Vec<TaskInfo> = tasks
        .values()
        .filter(|task| chat_id.is_none() || task.info.chat_id == chat_id)
        .map(|task| task.info.clone())
        .collect();
    list.sort_by(|a, b| (b.status == "running").cmp(&(a.status == "running")).then(b.started_at.cmp(&a.started_at)));
    list
}

/// The latest output of a task (up to `max_chars`, newest kept).
#[tauri::command(async)]
pub fn kode_bg_output(id: String, max_chars: Option<usize>) -> Result<String, String> {
    let tasks = registry().lock().unwrap();
    let task = tasks.get(&id).ok_or("No such background task.")?;
    let max = max_chars.unwrap_or(8_000).min(LOG_CAP);
    let log = &task.log;
    if log.len() <= max {
        return Ok(log.clone());
    }
    let mut start = log.len() - max;
    while !log.is_char_boundary(start) {
        start += 1;
    }
    Ok(format!("…\n{}", &log[start..]))
}

fn kill_group(pid: u32) {
    #[cfg(unix)]
    {
        // Negative pid = the whole process group.
        let _ = std::process::Command::new("kill").arg("-TERM").arg(format!("-{pid}")).status();
    }
    #[cfg(not(unix))]
    {
        let _ = std::process::Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).status();
    }
}

#[tauri::command(async)]
pub fn kode_bg_stop(id: String) -> Result<(), String> {
    let pid = {
        let mut tasks = registry().lock().unwrap();
        let task = tasks.get_mut(&id).ok_or("No such background task.")?;
        if task.info.status != "running" {
            return Ok(());
        }
        task.info.status = "stopped".into();
        task.info.ended_at = Some(now_ms());
        task.info.pid
    };
    if let Some(pid) = pid {
        kill_group(pid);
    }
    Ok(())
}

/// Forget finished tasks (for a chat, or all).
#[tauri::command(async)]
pub fn kode_bg_clear_finished(chat_id: Option<String>) {
    let mut tasks = registry().lock().unwrap();
    tasks.retain(|_, task| task.info.status == "running" || (chat_id.is_some() && task.info.chat_id != chat_id));
}

/// Stop everything still running (app quit).
pub fn stop_all() {
    let pids: Vec<u32> = registry()
        .lock()
        .unwrap()
        .values()
        .filter(|task| task.info.status == "running")
        .filter_map(|task| task.info.pid)
        .collect();
    for pid in pids {
        kill_group(pid);
    }
}

// ---------------------------------------------------------------------------
// Servers started outside Kode's own tool (Claude Code, Codex, OpenCode… run
// `bun dev` themselves): any process listening on a TCP port whose working
// folder is inside the project. macOS and Linux (lsof); none on Windows.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DetectedServer {
    pid: u32,
    port: u16,
    command: String,
}

/// `lsof -Fpn` output → (pid, port) for each listening socket.
fn parse_listeners(out: &str) -> Vec<(u32, u16)> {
    let mut pid = 0u32;
    let mut found = Vec::new();
    for line in out.lines() {
        if let Some(rest) = line.strip_prefix('p') {
            pid = rest.trim().parse().unwrap_or(0);
        } else if let Some(name) = line.strip_prefix('n') {
            if let Some(port) = name.rsplit(':').next().and_then(|p| p.trim().parse::<u16>().ok()) {
                if pid > 0 && !found.contains(&(pid, port)) {
                    found.push((pid, port));
                }
            }
        }
    }
    found
}

/// `lsof -Fpn -d cwd` output → pid → working folder.
fn parse_cwds(out: &str) -> HashMap<u32, String> {
    let mut pid = 0u32;
    let mut cwds = HashMap::new();
    for line in out.lines() {
        if let Some(rest) = line.strip_prefix('p') {
            pid = rest.trim().parse().unwrap_or(0);
        } else if let Some(path) = line.strip_prefix('n') {
            if pid > 0 {
                cwds.insert(pid, path.to_string());
            }
        }
    }
    cwds
}

fn inside(path: &str, root: &str) -> bool {
    let root = root.trim_end_matches('/');
    !root.is_empty() && (path == root || path.starts_with(&format!("{root}/")))
}

#[cfg(unix)]
fn detect(root: &str) -> Vec<DetectedServer> {
    let run = |program: &str, args: &[&str]| {
        std::process::Command::new(program)
            .args(args)
            .stdin(Stdio::null())
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
            .unwrap_or_default()
    };
    let lsof = if std::path::Path::new("/usr/sbin/lsof").exists() { "/usr/sbin/lsof" } else { "/usr/bin/lsof" };
    let root = std::fs::canonicalize(root).map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|_| root.to_string());
    let me = std::process::id();
    let listeners: Vec<(u32, u16)> = parse_listeners(&run(lsof, &["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]))
        .into_iter()
        .filter(|(pid, _)| *pid != me)
        .collect();
    if listeners.is_empty() {
        return Vec::new();
    }
    let mut pids: Vec<String> = listeners.iter().map(|(pid, _)| pid.to_string()).collect();
    pids.dedup();
    let list = pids.join(",");
    let cwds = parse_cwds(&run(lsof, &["-a", "-p", &list, "-d", "cwd", "-Fpn"]));
    let commands: HashMap<u32, String> = run("/bin/ps", &["-o", "pid=,command=", "-p", &list])
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let (pid, command) = line.split_once(char::is_whitespace)?;
            Some((pid.parse().ok()?, command.trim().chars().take(200).collect()))
        })
        .collect();
    let mut servers: Vec<DetectedServer> = Vec::new();
    for (pid, port) in listeners {
        if !cwds.get(&pid).is_some_and(|cwd| inside(cwd, &root)) {
            continue;
        }
        // One row per process: its lowest port (dev servers often open a second one for reload).
        if servers.iter().any(|s| s.pid == pid) {
            continue;
        }
        servers.push(DetectedServer { pid, port, command: commands.get(&pid).cloned().unwrap_or_default() });
    }
    servers.sort_by_key(|s| s.port);
    servers
}

#[cfg(not(unix))]
fn detect(_root: &str) -> Vec<DetectedServer> {
    Vec::new()
}

#[tauri::command(async)]
pub fn kode_detect_servers(root: String) -> Vec<DetectedServer> {
    detect(&root)
}

/// Stop a detected server. Checked again first: only a process that is still
/// listening inside this project can be stopped this way.
#[tauri::command(async)]
pub fn kode_stop_detected_server(root: String, pid: u32) -> Result<(), String> {
    if !detect(&root).iter().any(|s| s.pid == pid) {
        return Err("That server isn't running in this project anymore.".into());
    }
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("/bin/kill").arg("-TERM").arg(pid.to_string()).status();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_lsof_listeners_and_folders() {
        let listen = "p101\nnode\nn*:3210\nn[::1]:3210\nn127.0.0.1:24678\np202\nn*:5432\n";
        assert_eq!(parse_listeners(listen), vec![(101, 3210), (101, 24678), (202, 5432)]);
        let cwds = parse_cwds("p101\nfcwd\nn/Users/me/app\np202\nfcwd\nn/opt/postgres\n");
        assert_eq!(cwds.get(&101).map(String::as_str), Some("/Users/me/app"));
        assert!(inside("/Users/me/app/web", "/Users/me/app"));
        assert!(inside("/Users/me/app", "/Users/me/app/"));
        assert!(!inside("/Users/me/app-old", "/Users/me/app"));
        assert!(!inside("/anything", ""));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn finds_a_server_started_in_the_project() {
        let dir = std::env::temp_dir().join(format!("kontinue-detect-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let mut child = std::process::Command::new("python3")
            .args(["-m", "http.server", &port.to_string(), "--bind", "127.0.0.1"])
            .current_dir(&dir)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let mut found = Vec::new();
        for _ in 0..40 {
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            found = detect(&dir.to_string_lossy());
            if !found.is_empty() {
                break;
            }
        }
        let _ = child.kill();
        let _ = std::fs::remove_dir_all(&dir);
        assert!(found.iter().any(|s| s.port == port && s.command.contains("http.server")), "{found:?}");
        assert!(detect("/nonexistent-kontinue").is_empty());
    }

    #[test]
    fn detects_ports_and_strips_colours() {
        assert_eq!(detect_port("  ➜  Local:   http://localhost:5173/"), Some(5173));
        assert_eq!(detect_port("- Local:         http://localhost:3000"), Some(3000));
        assert_eq!(detect_port("Server listening on port 8080"), Some(8080));
        assert_eq!(detect_port("Listening on 0.0.0.0:4000"), Some(4000));
        assert_eq!(detect_port("compiled 12 modules in 3000ms"), None);
        assert_eq!(strip_ansi("\x1b[32mready\x1b[0m"), "ready");
    }

    #[test]
    fn runs_reads_and_stops_a_background_task() {
        let dir = std::env::temp_dir();
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(async {
            let info = kode_bg_start(
                dir.to_string_lossy().to_string(),
                "echo 'ready on http://localhost:4321'; sleep 30".into(),
                None,
                Some("chat-1".into()),
                None,
            )
            .await
            .unwrap();
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            let listed = kode_bg_list(Some("chat-1".into()));
            let task = listed.iter().find(|t| t.id == info.id).unwrap();
            assert_eq!(task.status, "running");
            assert_eq!(task.port, Some(4321));
            assert!(kode_bg_output(info.id.clone(), None).unwrap().contains("ready on"));
            kode_bg_stop(info.id.clone()).unwrap();
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            let after = kode_bg_list(Some("chat-1".into()));
            assert_eq!(after.iter().find(|t| t.id == info.id).unwrap().status, "stopped");
            assert!(kode_bg_list(Some("other".into())).is_empty());
        });
    }
}
