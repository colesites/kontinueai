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
    let mut cmd = tokio::process::Command::new("sh");
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
#[tauri::command]
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
#[tauri::command]
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

#[tauri::command]
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
#[tauri::command]
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

#[cfg(test)]
mod tests {
    use super::*;

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
