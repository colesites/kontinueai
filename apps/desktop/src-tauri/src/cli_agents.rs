// "Use your Claude Code / Codex subscription" for Kode.
//
// Runs the user's own, already signed-in `claude` and `codex` CLIs as
// subprocesses in the project folder and streams their JSON events to the
// frontend. Nothing here calls a model API or the Kontinue server, and nothing
// reads, copies or forwards the CLIs' credentials: we only invoke the official
// binaries and let them handle their own sign-in.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};

// Agents that speak the Agent Client Protocol (Gemini CLI, OpenCode, …).
#[path = "cli_acp.rs"]
mod acp;

// ---------------------------------------------------------------------------
// Locating the CLIs
// ---------------------------------------------------------------------------

/// Apps launched from Finder/Dock get a minimal PATH, so ask the user's login
/// shell for the PATH they see in a terminal. Cached for the app's lifetime.
pub(crate) fn login_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let current = std::env::var("PATH").unwrap_or_default();
        if cfg!(windows) {
            return current;
        }
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let from_shell = std::process::Command::new(&shell)
            .args(["-lc", "printf '__KODE_PATH__%s__KODE_PATH__' \"$PATH\""])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .ok()
            .and_then(|out| {
                let text = String::from_utf8_lossy(&out.stdout).to_string();
                text.split("__KODE_PATH__").nth(1).map(str::to_string)
            })
            .unwrap_or_default();

        // Login PATH first, then the app's PATH, then common install folders.
        let home = std::env::var("HOME").unwrap_or_default();
        let extra = [
            format!("{home}/.claude/local"),
            format!("{home}/.local/bin"),
            format!("{home}/.bun/bin"),
            format!("{home}/.npm-global/bin"),
            format!("{home}/.volta/bin"),
            "/opt/homebrew/bin".to_string(),
            "/usr/local/bin".to_string(),
        ];
        let mut seen = std::collections::HashSet::new();
        from_shell
            .split(':')
            .chain(current.split(':'))
            .map(str::to_string)
            .chain(extra)
            .filter(|dir| !dir.is_empty() && seen.insert(dir.clone()))
            .collect::<Vec<_>>()
            .join(":")
    })
}

pub(crate) fn find_binary(name: &str) -> Option<PathBuf> {
    let sep = if cfg!(windows) { ';' } else { ':' };
    let names: Vec<String> = if cfg!(windows) {
        vec![format!("{name}.exe"), format!("{name}.cmd"), name.to_string()]
    } else {
        vec![name.to_string()]
    };
    login_path()
        .split(sep)
        .flat_map(|dir| names.iter().map(move |n| Path::new(dir).join(n)))
        .find(|path| path.is_file())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CliProvider {
    Claude,
    Codex,
    Cursor,
    /// Any agent started with an ACP command (stdio JSON-RPC).
    Acp,
}

impl CliProvider {
    fn binary(self) -> &'static str {
        match self {
            CliProvider::Claude => "claude",
            CliProvider::Codex => "codex",
            CliProvider::Cursor => "cursor-agent",
            CliProvider::Acp => "agent",
        }
    }

    /// Env var that points the CLI at a different config/home folder.
    fn home_env(self) -> Option<&'static str> {
        match self {
            CliProvider::Claude => Some("CLAUDE_CONFIG_DIR"),
            CliProvider::Codex => Some("CODEX_HOME"),
            CliProvider::Cursor | CliProvider::Acp => None,
        }
    }

    fn package(self) -> (&'static str, &'static str) {
        // (Homebrew name, npm package)
        match self {
            CliProvider::Claude => ("claude-code", "@anthropic-ai/claude-code@latest"),
            CliProvider::Codex => ("codex", "@openai/codex@latest"),
            CliProvider::Cursor => ("cursor-cli", ""),
            CliProvider::Acp => ("", ""),
        }
    }
}

/// Per-provider settings from Settings → Providers. Empty values mean "use
/// the CLI's defaults".
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CliConfig {
    /// Provider instance id; namespaces its keychain secrets.
    instance: String,
    /// Command name or full path to the binary.
    binary_path: String,
    /// Config folder (`CLAUDE_CONFIG_DIR` / `CODEX_HOME`).
    home_dir: String,
    /// Extra arguments added to every turn.
    launch_args: Vec<String>,
    /// ACP: the command that starts the agent, already split into words.
    command: Vec<String>,
    /// ACP: known agent ("gemini", "opencode") or "custom".
    preset: String,
    /// ACP: sign-in method id passed to `authenticate`.
    auth_method: String,
    /// Plain environment variables for this instance.
    env: HashMap<String, String>,
    /// Names of secret variables kept in the keychain for this instance.
    secret_env: Vec<String>,
}

/// One provider instance to check (Settings → Providers).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceSpec {
    id: String,
    provider: CliProvider,
    #[serde(default)]
    config: CliConfig,
}

// ---------------------------------------------------------------------------
// Secret variables (keychain). Values are written from Settings and only read
// here, when starting the CLI; they are never sent back to the web view.
// ---------------------------------------------------------------------------

const ENV_KEYRING_SERVICE: &str = "com.kontinue.kode-ide.cli-env";

fn env_entry(instance: &str, name: &str) -> Result<keyring::Entry, String> {
    let valid = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if !valid(instance) || !valid(name) {
        return Err("Invalid variable name.".to_string());
    }
    keyring::Entry::new(ENV_KEYRING_SERVICE, &format!("{instance}/{name}"))
        .map_err(|error| format!("Could not access the secure key store: {error}"))
}

fn read_secret(instance: &str, name: &str) -> Option<String> {
    env_entry(instance, name).ok()?.get_password().ok()
}

#[tauri::command]
pub fn kode_cli_secret_set(instance: String, name: String, value: String) -> Result<(), String> {
    env_entry(&instance, &name)?
        .set_password(&value)
        .map_err(|error| format!("Could not save the secret: {error}"))
}

#[tauri::command]
pub fn kode_cli_secret_remove(instance: String, name: String) -> Result<(), String> {
    match env_entry(&instance, &name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Could not remove the secret: {error}")),
    }
}

/// Which of these secrets are saved (never their values).
#[tauri::command]
pub fn kode_cli_secret_status(instance: String, names: Vec<String>) -> Vec<bool> {
    names.iter().map(|name| read_secret(&instance, name).is_some()).collect()
}

fn expand_home(path: &str) -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    if path == "~" {
        home
    } else if let Some(rest) = path.strip_prefix("~/") {
        format!("{home}/{rest}")
    } else {
        path.to_string()
    }
}

fn resolve_binary(provider: CliProvider, config: &CliConfig) -> Option<PathBuf> {
    let custom = config.binary_path.trim();
    let acp_binary = config.command.first().map(String::as_str).unwrap_or("");
    let custom = if custom.is_empty() && provider == CliProvider::Acp { acp_binary } else { custom };
    if custom.is_empty() {
        if provider == CliProvider::Acp {
            return None;
        }
        return find_binary(provider.binary());
    }
    let expanded = expand_home(custom);
    if expanded.contains('/') || expanded.contains('\\') {
        let path = PathBuf::from(expanded);
        return path.is_file().then_some(path);
    }
    find_binary(&expanded)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    /// Provider instance id this status is for.
    instance: String,
    provider: CliProvider,
    installed: bool,
    version: Option<String>,
    path: Option<String>,
    /// From the CLI's own status command; `None` when it could not tell.
    logged_in: Option<bool>,
    /// "homebrew" | "npm" | "native" | "unknown"
    install_method: Option<String>,
    /// What Update runs, shown in the UI.
    update_command: Option<String>,
    /// Why the CLI could not be used, when it could not.
    error: Option<String>,
}

fn base_command(binary: &Path) -> Command {
    let mut cmd = Command::new(binary);
    cmd.env("PATH", login_path());
    // Make the CLIs use the user's subscription login, not an API key that
    // happens to be in this app's environment.
    cmd.env_remove("ANTHROPIC_API_KEY");
    cmd.env_remove("OPENAI_API_KEY");
    cmd
}

fn cli_command(provider: CliProvider, binary: &Path, config: &CliConfig) -> Command {
    let mut cmd = base_command(binary);
    let home = config.home_dir.trim();
    if let (Some(var), false) = (provider.home_env(), home.is_empty()) {
        cmd.env(var, expand_home(home));
    }
    for (name, value) in &config.env {
        if !name.trim().is_empty() {
            cmd.env(name.trim(), value);
        }
    }
    for name in &config.secret_env {
        if let Some(value) = read_secret(&config.instance, name) {
            cmd.env(name, value);
        }
    }
    cmd
}

fn install_method(path: &Path) -> &'static str {
    let real = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let text = real.to_string_lossy();
    if text.contains("/Caskroom/") || text.contains("/Cellar/") || text.contains("/homebrew/") {
        "homebrew"
    } else if text.contains("node_modules") {
        "npm"
    } else if text.contains("/.local/share/claude") || text.contains("/.claude/") {
        "native"
    } else {
        "unknown"
    }
}

/// The official way to update the CLI, based on how it was installed.
fn update_command(provider: CliProvider, binary: &Path, config: &CliConfig) -> Option<(PathBuf, Vec<String>)> {
    // Cursor Agent and OpenCode update themselves.
    if provider == CliProvider::Cursor {
        return Some((binary.to_path_buf(), vec!["update".to_string()]));
    }
    if provider == CliProvider::Acp {
        return match config.preset.as_str() {
            "opencode" => Some((binary.to_path_buf(), vec!["upgrade".to_string()])),
            "gemini" if install_method(binary) == "homebrew" => Some((
                find_binary("brew").unwrap_or_else(|| PathBuf::from("brew")),
                vec!["upgrade".into(), "gemini-cli".into()],
            )),
            "gemini" => Some((
                find_binary("npm").unwrap_or_else(|| PathBuf::from("npm")),
                vec!["install".into(), "-g".into(), "@google/gemini-cli@latest".into()],
            )),
            _ => None,
        };
    }
    Some(update_command_for(provider, binary))
}

fn update_command_for(provider: CliProvider, binary: &Path) -> (PathBuf, Vec<String>) {
    let (brew_name, npm_package) = provider.package();
    let real = std::fs::canonicalize(binary).unwrap_or_else(|_| binary.to_path_buf());
    match install_method(binary) {
        "homebrew" => {
            let brew = find_binary("brew").unwrap_or_else(|| PathBuf::from("brew"));
            let mut args = vec!["upgrade".to_string()];
            if real.to_string_lossy().contains("/Caskroom/") {
                args.push("--cask".to_string());
            }
            args.push(brew_name.to_string());
            (brew, args)
        }
        "native" if provider == CliProvider::Claude => {
            (binary.to_path_buf(), vec!["update".to_string()])
        }
        "unknown" if provider == CliProvider::Claude => {
            (binary.to_path_buf(), vec!["update".to_string()])
        }
        _ => {
            let npm = find_binary("npm").unwrap_or_else(|| PathBuf::from("npm"));
            (npm, vec!["install".into(), "-g".into(), npm_package.into()])
        }
    }
}

fn describe(program: &Path, args: &[String]) -> String {
    let name = program
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    std::iter::once(name)
        .chain(args.iter().cloned())
        .collect::<Vec<_>>()
        .join(" ")
}

async fn detect(instance: String, provider: CliProvider, config: &CliConfig) -> CliStatus {
    let mut status = CliStatus {
        instance,
        provider,
        installed: false,
        version: None,
        path: None,
        logged_in: None,
        install_method: None,
        update_command: None,
        error: None,
    };
    let Some(path) = resolve_binary(provider, config) else {
        status.error = Some(if provider == CliProvider::Acp && config.command.is_empty() {
            "Set the command that starts this agent.".to_string()
        } else if provider == CliProvider::Acp {
            format!("`{}` was not found on your PATH.", config.command[0])
        } else if config.binary_path.trim().is_empty() {
            format!("`{}` was not found on your PATH.", provider.binary())
        } else {
            format!("Nothing to run at `{}`.", config.binary_path.trim())
        });
        return status;
    };
    status.path = Some(path.to_string_lossy().to_string());
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        cli_command(provider, &path, config)
            .arg("--version")
            .stdin(Stdio::null())
            .output(),
    )
    .await;
    status.version = match output {
        Ok(Ok(out)) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
            // "2.1.77 (Claude Code)" / "codex-cli 0.50.0"
            text.split_whitespace()
                .find(|part| part.chars().next().is_some_and(|c| c.is_ascii_digit()))
                .map(str::to_string)
                .or(Some(text))
        }
        Ok(Ok(out)) => {
            status.error = Some(String::from_utf8_lossy(&out.stderr).trim().to_string());
            None
        }
        Ok(Err(error)) => {
            status.error = Some(format!("Could not start `{}`: {error}", path.display()));
            None
        }
        Err(_) => {
            status.error = Some("Timed out asking the CLI for its version.".to_string());
            None
        }
    };
    if provider == CliProvider::Acp {
        // Custom agents may not support --version; the binary existing is enough.
        status.error = None;
    } else if status.version.is_none() {
        return status;
    }
    status.installed = true;
    status.logged_in = login_status(provider, &path, config).await;
    status.install_method = Some(install_method(&path).to_string());
    status.update_command = update_command(provider, &path, config).map(|(program, args)| describe(&program, &args));
    status
}

/// Ask the CLI itself whether it is signed in (`claude auth status`,
/// `codex login status`). Never reads credential files.
async fn login_status(provider: CliProvider, path: &Path, config: &CliConfig) -> Option<bool> {
    let args: &[&str] = match provider {
        CliProvider::Claude => &["auth", "status", "--json"],
        CliProvider::Codex => &["login", "status"],
        CliProvider::Cursor => &["status"],
        // ACP agents report sign-in only when a session is opened.
        CliProvider::Acp => return None,
    };
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        cli_command(provider, path, config)
            .args(args)
            .stdin(Stdio::null())
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    match provider {
        CliProvider::Claude => serde_json::from_slice::<Value>(&out.stdout)
            .ok()?
            .get("loggedIn")
            .and_then(Value::as_bool),
        CliProvider::Codex => {
            let text = format!(
                "{}{}",
                String::from_utf8_lossy(&out.stdout),
                String::from_utf8_lossy(&out.stderr)
            )
            .to_lowercase();
            Some(out.status.success() && !text.contains("not logged in"))
        }
        CliProvider::Acp => None,
        CliProvider::Cursor => {
            // "✓ Logged in as …" / "Not logged in" (with terminal escapes).
            let text = strip_ansi(&String::from_utf8_lossy(&out.stdout)).to_lowercase();
            if text.contains("not logged in") || text.contains("not authenticated") {
                Some(false)
            } else if text.contains("logged in") {
                Some(true)
            } else {
                None
            }
        }
    }
}

fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                // Skip parameters until the final letter.
                for next in chars.by_ref() {
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

#[derive(Debug, Serialize)]
pub struct CliModel {
    id: String,
    name: String,
}

/// Models the signed-in account can use, for CLIs that can list them
/// (Cursor). Others return an empty list and the app uses its own catalog.
#[tauri::command]
pub async fn kode_cli_models(
    provider: CliProvider,
    config: Option<CliConfig>,
) -> Result<Vec<CliModel>, String> {
    let config = config.unwrap_or_default();
    if provider == CliProvider::Acp {
        return acp::probe_models(&config).await;
    }
    if provider != CliProvider::Cursor {
        return Ok(Vec::new());
    }
    let binary = resolve_binary(provider, &config)
        .ok_or_else(|| format!("`{}` is not installed.", provider.binary()))?;
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        cli_command(provider, &binary, &config)
            .arg("models")
            .stdin(Stdio::null())
            .output(),
    )
    .await
    .map_err(|_| "Timed out listing models.".to_string())?
    .map_err(|error| error.to_string())?;
    Ok(parse_cursor_models(&strip_ansi(&String::from_utf8_lossy(&out.stdout))))
}

/// Lines like "sonnet-4.5 - Claude 4.5 Sonnet  (current)".
fn parse_cursor_models(text: &str) -> Vec<CliModel> {
    text.lines()
        .filter_map(|line| {
            let line = line.trim();
            let (id, name) = line.split_once(" - ")?;
            let id = id.trim();
            if id.is_empty() || id.contains(' ') {
                return None;
            }
            let name = name
                .trim()
                .trim_end_matches("(current)")
                .trim_end_matches("(default)")
                .trim();
            Some(CliModel { id: id.to_string(), name: name.to_string() })
        })
        .collect()
}

/// Install, version and sign-in state for each provider instance.
#[tauri::command]
pub async fn kode_cli_detect(instances: Vec<InstanceSpec>) -> Vec<CliStatus> {
    futures_util::future::join_all(instances.into_iter().map(|spec| async move {
        let mut config = spec.config;
        config.instance = spec.id.clone();
        detect(spec.id, spec.provider, &config).await
    }))
    .await
}

// ---------------------------------------------------------------------------
// Maintenance: update, sign in, sign out (all via the official CLIs)
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliTaskResult {
    success: bool,
    stopped: bool,
    /// Last part of the combined output.
    output: String,
}

/// Run a command, streaming each output line, until it exits, is stopped
/// (`kode_cli_stop` with the same run id) or times out.
async fn run_streaming(
    state: &CliRunState,
    run_id: u32,
    mut cmd: Command,
    on_line: Channel<String>,
    timeout_secs: u64,
) -> Result<CliTaskResult, String> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("HOMEBREW_NO_ENV_HINTS", "1")
        .kill_on_drop(true);
    #[cfg(unix)]
    cmd.process_group(0);
    let mut child = cmd.spawn().map_err(|error| format!("Could not start: {error}"))?;
    let pid = child.id().unwrap_or(0);
    state.runs.lock().map_err(|_| "Run state unavailable")?.insert(run_id, pid);
    if state.stopped.lock().map(|set| set.contains(&run_id)).unwrap_or(false) {
        kill_tree(pid);
    }

    let collected = std::sync::Arc::new(Mutex::new(String::new()));
    let mut readers = Vec::new();
    let stdout = child.stdout.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>);
    let stderr = child.stderr.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>);
    for stream in [stdout, stderr].into_iter().flatten() {
        let channel = on_line.clone();
        let collected = collected.clone();
        readers.push(tokio::spawn(async move {
            let mut lines = BufReader::new(stream).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(mut all) = collected.lock() {
                    all.push_str(&line);
                    all.push('\n');
                }
                let _ = channel.send(line);
            }
        }));
    }

    let waited = tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), child.wait()).await;
    let success = match waited {
        Ok(Ok(status)) => status.success(),
        _ => {
            kill_tree(pid);
            let _ = child.start_kill();
            false
        }
    };
    for reader in readers {
        let _ = reader.await;
    }
    if let Ok(mut runs) = state.runs.lock() {
        runs.remove(&run_id);
    }
    let stopped = state
        .stopped
        .lock()
        .map(|mut set| set.remove(&run_id))
        .unwrap_or(false);
    let output = collected.lock().map(|s| s.clone()).unwrap_or_default();
    let start = output.len().saturating_sub(4000);
    let tail = output[output.floor_char_boundary_compat(start)..].trim().to_string();
    Ok(CliTaskResult { success: success && !stopped, stopped, output: tail })
}

/// Update the CLI the way it was installed (Homebrew, npm or `claude update`).
#[tauri::command]
pub async fn kode_cli_update(
    state: tauri::State<'_, CliRunState>,
    run_id: u32,
    provider: CliProvider,
    config: Option<CliConfig>,
    on_line: Channel<String>,
) -> Result<CliTaskResult, String> {
    let config = config.unwrap_or_default();
    let binary = resolve_binary(provider, &config)
        .ok_or_else(|| format!("`{}` is not installed.", provider.binary()))?;
    let (program, args) = update_command(provider, &binary, &config)
        .ok_or_else(|| "Update this agent with its own installer.".to_string())?;
    let _ = on_line.send(format!("$ {}", describe(&program, &args)));
    let mut cmd = base_command(&program);
    cmd.args(&args);
    run_streaming(&state, run_id, cmd, on_line, 900).await
}

/// Sign in or out with the CLI's own command. Sign-in opens the browser; the
/// CLI stores its own credentials, which this app never reads.
#[tauri::command]
pub async fn kode_cli_auth(
    state: tauri::State<'_, CliRunState>,
    run_id: u32,
    provider: CliProvider,
    action: String,
    config: Option<CliConfig>,
    on_line: Channel<String>,
) -> Result<CliTaskResult, String> {
    let config = config.unwrap_or_default();
    let binary = resolve_binary(provider, &config)
        .ok_or_else(|| format!("`{}` is not installed.", provider.binary()))?;
    if provider == CliProvider::Acp {
        return match action.as_str() {
            "login" => acp::authenticate(&state, run_id, &binary, &config, on_line).await,
            _ => Err("Sign out from the agent itself.".to_string()),
        };
    }
    let args: &[&str] = match (provider, action.as_str()) {
        (CliProvider::Claude, "login") => &["auth", "login", "--claudeai"],
        (CliProvider::Claude, "logout") => &["auth", "logout"],
        (CliProvider::Codex, "login") => &["login"],
        (CliProvider::Codex, "logout") => &["logout"],
        (CliProvider::Cursor, "login") => &["login"],
        (CliProvider::Cursor, "logout") => &["logout"],
        (CliProvider::Acp, _) => unreachable!(),
        _ => return Err(format!("Unknown action `{action}`.")),
    };
    let mut cmd = cli_command(provider, &binary, &config);
    cmd.args(args);
    run_streaming(&state, run_id, cmd, on_line, 600).await
}

// ---------------------------------------------------------------------------
// Running a turn
// ---------------------------------------------------------------------------

/// Normalized events sent to the frontend (same shape for both CLIs).
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CliEvent {
    #[serde(rename_all = "camelCase")]
    Session { session_id: String, model: Option<String> },
    Text { delta: String },
    Reasoning { delta: String },
    #[serde(rename_all = "camelCase")]
    ToolStart { id: String, name: String, input: Value },
    #[serde(rename_all = "camelCase")]
    ToolEnd { id: String, output: String, is_error: bool },
    Todos { items: Vec<CliTodo> },
    Notice { message: String },
}

#[derive(Clone, Serialize)]
pub struct CliTodo {
    title: String,
    /// "pending" | "in_progress" | "completed"
    status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRunRequest {
    provider: CliProvider,
    root: String,
    prompt: String,
    /// Resume this CLI session (follow-up turns in the same chat).
    session_id: Option<String>,
    /// Model alias or name (e.g. "opus"); `None` uses the CLI's default.
    model: Option<String>,
    /// Kode agent mode, mapped to each CLI's own permission/sandbox setting.
    mode: String,
    /// Settings → Providers overrides for this CLI.
    #[serde(default)]
    config: CliConfig,
    /// Enabled plugin folders (Claude Code loads them with --plugin-dir).
    #[serde(default)]
    plugin_dirs: Vec<String>,
    /// MCP servers to give the agent (yours, plus plugin ones for CLIs that
    /// can't load plugins).
    #[serde(default)]
    mcp_servers: Vec<McpSpec>,
    /// With `session_id`: start a new session branched from that one instead
    /// of continuing it (Claude Code `--fork-session`, `codex exec fork`).
    #[serde(default)]
    fork: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct McpSpec {
    pub name: String,
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    pub url: Option<String>,
}

/// An MCP server with the sign-in token for remote ones (if signed in).
struct ResolvedMcp {
    spec: McpSpec,
    token: Option<String>,
}

async fn resolve_mcp(servers: &[McpSpec]) -> Vec<ResolvedMcp> {
    let mut out = Vec::new();
    for spec in servers {
        let token = match spec.url.as_deref() {
            Some(url) => crate::mcp_auth::access_token(url).await,
            None => None,
        };
        out.push(ResolvedMcp { spec: spec.clone(), token });
    }
    out
}

/// Only folders inside ~/.kontinue/plugins are passed on.
fn valid_plugin_dirs(dirs: &[String]) -> Vec<String> {
    let Ok(base) = crate::plugins::plugins_dir() else { return Vec::new() };
    dirs.iter()
        .filter(|d| {
            let path = Path::new(d);
            path.is_dir() && path.starts_with(&base) && !path.starts_with(base.join(".staging"))
        })
        .cloned()
        .collect()
}

fn mcp_key(name: &str) -> String {
    let key: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect();
    if key.is_empty() { "server".into() } else { key }
}

/// Claude Code `--mcp-config` JSON.
fn claude_mcp_config(servers: &[ResolvedMcp]) -> Value {
    let mut map = serde_json::Map::new();
    for server in servers {
        let spec = &server.spec;
        let entry = if let Some(url) = spec.url.as_deref() {
            let mut entry = json!({ "type": "http", "url": url });
            if let Some(token) = &server.token {
                entry["headers"] = json!({ "Authorization": format!("Bearer {token}") });
            }
            entry
        } else if let Some(command) = spec.command.as_deref() {
            json!({ "command": command, "args": spec.args, "env": spec.env })
        } else {
            continue;
        };
        map.insert(mcp_key(&spec.name), entry);
    }
    json!({ "mcpServers": map })
}

/// Codex `-c mcp_servers.<name>.…` overrides, plus env vars holding tokens.
fn codex_mcp_overrides(servers: &[ResolvedMcp]) -> (Vec<String>, Vec<(String, String)>) {
    let quote = |text: &str| serde_json::to_string(text).unwrap_or_else(|_| "\"\"".into());
    let mut args = Vec::new();
    let mut env = Vec::new();
    for (index, server) in servers.iter().enumerate() {
        let spec = &server.spec;
        let key = format!("mcp_servers.{}", mcp_key(&spec.name));
        if let Some(url) = spec.url.as_deref() {
            args.push("-c".into());
            args.push(format!("{key}.url={}", quote(url)));
            if let Some(token) = &server.token {
                let var = format!("KONTINUE_MCP_TOKEN_{index}");
                args.push("-c".into());
                args.push(format!("{key}.bearer_token_env_var={}", quote(&var)));
                env.push((var, token.clone()));
            }
        } else if let Some(command) = spec.command.as_deref() {
            args.push("-c".into());
            args.push(format!("{key}.command={}", quote(command)));
            if !spec.args.is_empty() {
                let list: Vec<String> = spec.args.iter().map(|a| quote(a)).collect();
                args.push("-c".into());
                args.push(format!("{key}.args=[{}]", list.join(",")));
            }
            if !spec.env.is_empty() {
                let pairs: Vec<String> = spec
                    .env
                    .iter()
                    .map(|(k, v)| format!("{}={}", quote(k), quote(v)))
                    .collect();
                args.push("-c".into());
                args.push(format!("{key}.env={{{}}}", pairs.join(",")));
            }
        }
    }
    (args, env)
}

/// ACP `session/new` mcpServers (stdio servers; every ACP agent supports those).
pub fn acp_mcp_servers(request: &CliRunRequest) -> Value {
    Value::Array(
        request
            .mcp_servers
            .iter()
            .filter_map(|spec| {
                let command = spec.command.as_deref()?;
                Some(json!({
                    "name": spec.name,
                    "command": command,
                    "args": spec.args,
                    "env": spec.env.iter().map(|(k, v)| json!({ "name": k, "value": v })).collect::<Vec<_>>(),
                }))
            })
            .collect(),
    )
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRunResult {
    session_id: Option<String>,
    text: String,
    stopped: bool,
    error: Option<String>,
    /// Epoch ms when a usage limit that stopped this turn resets (Claude Code
    /// reports it in `rate_limit_event`). The frontend also reads error text.
    limit_resets_at: Option<i64>,
}

#[derive(Default)]
pub struct CliRunState {
    runs: Mutex<HashMap<u32, u32>>, // run id -> child pid
    next_id: AtomicU32,
    stopped: Mutex<std::collections::HashSet<u32>>,
}

fn claude_args(req: &CliRunRequest, mcp: &[ResolvedMcp], plugin_dirs: &[String]) -> Vec<String> {
    let permission = match req.mode.as_str() {
        "plan" => "plan",
        "auto_edits" | "design" | "auto" => "acceptEdits",
        "full_access" => "bypassPermissions",
        // Supervised: Claude Code's own default rules (no edits or commands
        // without approval, which print mode cannot ask for).
        _ => "default",
    };
    let mut args = vec![
        "-p".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--include-partial-messages".to_string(),
        "--permission-mode".to_string(),
        permission.to_string(),
    ];
    if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
        args.push("--model".to_string());
        args.push(model.to_string());
    }
    if let Some(id) = req.session_id.as_deref().filter(|id| !id.is_empty()) {
        args.push("--resume".to_string());
        args.push(id.to_string());
        if req.fork {
            args.push("--fork-session".to_string());
        }
    }
    // Enabled Kontinue plugins (commands, skills, agents, hooks, their MCP).
    for dir in plugin_dirs {
        args.push("--plugin-dir".to_string());
        args.push(dir.clone());
    }
    // MCP servers you added in Settings → Customize.
    if !mcp.is_empty() {
        args.push(format!("--mcp-config={}", claude_mcp_config(mcp)));
    }
    args.extend(req.config.launch_args.iter().cloned());
    args
}

fn codex_args(req: &CliRunRequest, mcp_overrides: &[String]) -> Vec<String> {
    let mut args = vec![
        "exec".to_string(),
        "--json".to_string(),
        "--skip-git-repo-check".to_string(),
        "-C".to_string(),
        req.root.clone(),
    ];
    if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
        args.push("-m".to_string());
        args.push(model.to_string());
    }
    match req.mode.as_str() {
        "full_access" => args.push("--dangerously-bypass-approvals-and-sandbox".to_string()),
        "auto_edits" | "design" | "auto" => {
            args.push("--sandbox".to_string());
            args.push("workspace-write".to_string());
        }
        _ => {
            args.push("--sandbox".to_string());
            args.push("read-only".to_string());
        }
    }
    // Exec options must come before the `resume` subcommand.
    args.extend(mcp_overrides.iter().cloned());
    args.extend(req.config.launch_args.iter().cloned());
    if let Some(id) = req.session_id.as_deref().filter(|id| !id.is_empty()) {
        args.push(if req.fork { "fork" } else { "resume" }.to_string());
        args.push(id.to_string());
    }
    // Read the prompt from stdin so it is never parsed as a flag.
    args.push("-".to_string());
    args
}

fn cursor_args(req: &CliRunRequest) -> Vec<String> {
    let mut args = vec![
        "-p".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--workspace".to_string(),
        req.root.clone(),
    ];
    match req.mode.as_str() {
        "plan" => args.extend(["--mode".to_string(), "plan".to_string()]),
        // Allow commands without asking (print mode cannot ask).
        "full_access" | "auto" => args.push("--force".to_string()),
        "auto_edits" | "design" => {}
        // Supervised: read-only questions and answers.
        _ => args.extend(["--mode".to_string(), "ask".to_string()]),
    }
    if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
        args.push("--model".to_string());
        args.push(model.to_string());
    }
    if let Some(id) = req.session_id.as_deref().filter(|id| !id.is_empty()) {
        args.push("--resume".to_string());
        args.push(id.to_string());
    }
    args.extend(req.config.launch_args.iter().cloned());
    // `--` so a prompt starting with "-" is never read as a flag.
    args.push("--".to_string());
    args.push(req.prompt.clone());
    args
}

fn kill_tree(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(unix)]
    {
        // The child leads its own process group, so this also stops any
        // commands it started.
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &format!("-{pid}")])
            .status();
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .status();
    }
}

/// Stop a running turn (the Stop button).
#[tauri::command]
pub fn kode_cli_stop(state: tauri::State<'_, CliRunState>, run_id: u32) -> Result<(), String> {
    // Mark first so a turn that is still starting stops as soon as it spawns.
    if let Ok(mut stopped) = state.stopped.lock() {
        stopped.insert(run_id);
    }
    let pid = state.runs.lock().map_err(|_| "Run state unavailable")?.remove(&run_id);
    if let Some(pid) = pid {
        kill_tree(pid);
    }
    Ok(())
}

/// Reserve a run id up front so the frontend can stop a turn while it starts.
#[tauri::command]
pub fn kode_cli_new_run(state: tauri::State<'_, CliRunState>) -> u32 {
    state.next_id.fetch_add(1, Ordering::Relaxed) + 1
}

/// Run one turn with the user's installed CLI. Resolves when the CLI exits.
#[tauri::command]
pub async fn kode_cli_run(
    state: tauri::State<'_, CliRunState>,
    run_id: u32,
    request: CliRunRequest,
    on_event: Channel<CliEvent>,
) -> Result<CliRunResult, String> {
    let root = Path::new(&request.root);
    if !root.is_dir() {
        return Err("Open a project folder to use your subscription.".to_string());
    }
    let binary = resolve_binary(request.provider, &request.config).ok_or_else(|| {
        format!("`{}` is not installed or not on your PATH.", request.provider.binary())
    })?;
    if request.provider == CliProvider::Acp {
        return acp::run(&state, run_id, &binary, &request, on_event).await;
    }

    let mcp = resolve_mcp(&request.mcp_servers).await;
    let plugin_dirs = valid_plugin_dirs(&request.plugin_dirs);
    let (codex_overrides, extra_env) = codex_mcp_overrides(&mcp);
    let args = match request.provider {
        CliProvider::Claude => claude_args(&request, &mcp, &plugin_dirs),
        CliProvider::Codex => codex_args(&request, &codex_overrides),
        CliProvider::Cursor => cursor_args(&request),
        CliProvider::Acp => unreachable!(),
    };
    let mut cmd = cli_command(request.provider, &binary, &request.config);
    if request.provider == CliProvider::Codex {
        cmd.envs(extra_env);
    }
    cmd.args(&args)
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    cmd.process_group(0);

    let mut child: Child = cmd
        .spawn()
        .map_err(|error| format!("Could not start {}: {error}", request.provider.binary()))?;
    let pid = child.id().unwrap_or(0);
    state.runs.lock().map_err(|_| "Run state unavailable")?.insert(run_id, pid);
    if state.stopped.lock().map(|set| set.contains(&run_id)).unwrap_or(false) {
        kill_tree(pid);
    }

    let stdin = child.stdin.take().filter(|_| request.provider != CliProvider::Cursor);
    if let Some(mut stdin) = stdin {
        let prompt = request.prompt.clone();
        tokio::spawn(async move {
            let _ = stdin.write_all(prompt.as_bytes()).await;
            let _ = stdin.shutdown().await;
        });
    }

    // Keep the tail of stderr for error messages (e.g. "please log in").
    let stderr_task = child.stderr.take().map(|mut stderr| {
        tokio::spawn(async move {
            let mut buf = Vec::new();
            let _ = stderr.read_to_end(&mut buf).await;
            let text = String::from_utf8_lossy(&buf).to_string();
            let start = text.len().saturating_sub(4000);
            text[text.floor_char_boundary_compat(start)..].trim().to_string()
        })
    });

    let mut parser = Parser::new(request.provider, request.session_id.clone());
    if let Some(stdout) = child.stdout.take() {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let Ok(event) = serde_json::from_str::<Value>(line) else {
                continue;
            };
            for out in parser.handle(&event) {
                let _ = on_event.send(out);
            }
        }
    }

    let status = child.wait().await.ok();
    let stderr = match stderr_task {
        Some(task) => task.await.unwrap_or_default(),
        None => String::new(),
    };
    if let Ok(mut runs) = state.runs.lock() {
        runs.remove(&run_id);
    }
    let stopped = state
        .stopped
        .lock()
        .map(|mut set| set.remove(&run_id))
        .unwrap_or(false);

    let failed = !stopped && !status.map(|s| s.success()).unwrap_or(false);
    let error = parser.error.clone().or_else(|| {
        failed.then(|| {
            if stderr.is_empty() {
                format!("{} exited unexpectedly.", request.provider.binary())
            } else {
                stderr.clone()
            }
        })
    });

    Ok(CliRunResult {
        session_id: parser.session_id,
        text: parser.text,
        stopped,
        error: if stopped { None } else { error },
        limit_resets_at: parser.limit_resets_at,
    })
}

// Rust's `str::floor_char_boundary` is unstable; small local version.
trait FloorCharBoundary {
    fn floor_char_boundary_compat(&self, index: usize) -> usize;
}
impl FloorCharBoundary for String {
    fn floor_char_boundary_compat(&self, mut index: usize) -> usize {
        while index > 0 && !self.is_char_boundary(index) {
            index -= 1;
        }
        index
    }
}

// ---------------------------------------------------------------------------
// Event parsing
// ---------------------------------------------------------------------------

const MAX_TOOL_OUTPUT: usize = 6000;

fn clip(text: &str) -> String {
    if text.len() <= MAX_TOOL_OUTPUT {
        return text.to_string();
    }
    let mut end = MAX_TOOL_OUTPUT;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n…", &text[..end])
}

struct Parser {
    provider: CliProvider,
    session_id: Option<String>,
    /// Full assistant text of the turn (what gets persisted).
    text: String,
    error: Option<String>,
    /// Claude: token deltas arrived, so skip the duplicate full text blocks.
    streamed_text: bool,
    streamed_thinking: bool,
    /// A tool ran since the last text, so start the next text on a new paragraph.
    tool_since_text: bool,
    /// Epoch ms when a rejected usage limit resets.
    limit_resets_at: Option<i64>,
}

impl Parser {
    fn new(provider: CliProvider, session_id: Option<String>) -> Self {
        Self {
            provider,
            session_id,
            text: String::new(),
            error: None,
            streamed_text: false,
            streamed_thinking: false,
            tool_since_text: false,
            limit_resets_at: None,
        }
    }

    fn handle(&mut self, event: &Value) -> Vec<CliEvent> {
        match self.provider {
            CliProvider::Claude => self.claude(event),
            CliProvider::Codex => self.codex(event),
            CliProvider::Cursor => self.cursor(event),
            CliProvider::Acp => acp::map_update(self, event),
        }
    }

    fn push_text(&mut self, delta: &str, out: &mut Vec<CliEvent>) {
        if delta.is_empty() {
            return;
        }
        let mut delta = delta.to_string();
        if self.tool_since_text && !self.text.is_empty() && !self.text.ends_with("\n\n") {
            delta = format!("\n\n{delta}");
        }
        self.tool_since_text = false;
        self.text.push_str(&delta);
        out.push(CliEvent::Text { delta });
    }

    fn set_session(&mut self, id: Option<&str>, model: Option<&str>, out: &mut Vec<CliEvent>) {
        if let Some(id) = id.filter(|id| !id.is_empty()) {
            if self.session_id.as_deref() != Some(id) {
                self.session_id = Some(id.to_string());
                out.push(CliEvent::Session {
                    session_id: id.to_string(),
                    model: model.map(str::to_string),
                });
            }
        }
    }

    // Claude Code `--output-format stream-json --verbose --include-partial-messages`.
    fn claude(&mut self, event: &Value) -> Vec<CliEvent> {
        let mut out = Vec::new();
        let str_at = |v: &Value, key: &str| v.get(key).and_then(Value::as_str).map(str::to_string);
        match event.get("type").and_then(Value::as_str) {
            Some("system") => {
                if event.get("subtype").and_then(Value::as_str) == Some("init") {
                    let id = str_at(event, "session_id");
                    let model = str_at(event, "model");
                    self.set_session(id.as_deref(), model.as_deref(), &mut out);
                }
            }
            Some("stream_event") => {
                let Some(inner) = event.get("event") else { return out };
                if inner.get("type").and_then(Value::as_str) == Some("content_block_delta") {
                    let delta = inner.get("delta").cloned().unwrap_or(Value::Null);
                    match delta.get("type").and_then(Value::as_str) {
                        Some("text_delta") => {
                            self.streamed_text = true;
                            let text = str_at(&delta, "text").unwrap_or_default();
                            self.push_text(&text, &mut out);
                        }
                        Some("thinking_delta") => {
                            self.streamed_thinking = true;
                            if let Some(text) = str_at(&delta, "thinking") {
                                out.push(CliEvent::Reasoning { delta: text });
                            }
                        }
                        _ => {}
                    }
                }
            }
            Some("assistant") => {
                let blocks = event
                    .pointer("/message/content")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                for block in blocks {
                    match block.get("type").and_then(Value::as_str) {
                        Some("text") if !self.streamed_text => {
                            let text = str_at(&block, "text").unwrap_or_default();
                            self.push_text(&text, &mut out);
                        }
                        Some("thinking") if !self.streamed_thinking => {
                            if let Some(text) = str_at(&block, "thinking") {
                                out.push(CliEvent::Reasoning { delta: format!("{text}\n") });
                            }
                        }
                        Some("tool_use") => {
                            let name = str_at(&block, "name").unwrap_or_else(|| "tool".into());
                            let input = block.get("input").cloned().unwrap_or(Value::Null);
                            if name == "TodoWrite" {
                                if let Some(items) = claude_todos(&input) {
                                    out.push(CliEvent::Todos { items });
                                }
                            }
                            self.tool_since_text = true;
                            out.push(CliEvent::ToolStart {
                                id: str_at(&block, "id").unwrap_or_default(),
                                name,
                                input,
                            });
                        }
                        _ => {}
                    }
                }
            }
            Some("user") => {
                let blocks = event
                    .pointer("/message/content")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                for block in blocks {
                    if block.get("type").and_then(Value::as_str) != Some("tool_result") {
                        continue;
                    }
                    let output = match block.get("content") {
                        Some(Value::String(text)) => text.clone(),
                        Some(Value::Array(parts)) => parts
                            .iter()
                            .filter_map(|p| p.get("text").and_then(Value::as_str))
                            .collect::<Vec<_>>()
                            .join("\n"),
                        _ => String::new(),
                    };
                    out.push(CliEvent::ToolEnd {
                        id: str_at(&block, "tool_use_id").unwrap_or_default(),
                        output: clip(&output),
                        is_error: block.get("is_error").and_then(Value::as_bool).unwrap_or(false),
                    });
                }
            }
            Some("rate_limit_event") => {
                // {"rate_limit_info":{"status":"rejected","resetsAt":<epoch s>,…}}
                let info = event.get("rate_limit_info").unwrap_or(&Value::Null);
                if info.get("status").and_then(Value::as_str) == Some("rejected") {
                    self.limit_resets_at = info
                        .get("resetsAt")
                        .and_then(Value::as_f64)
                        .filter(|s| *s > 0.0)
                        .map(|s| (s * 1000.0) as i64);
                }
            }
            Some("result") => {
                let id = str_at(event, "session_id");
                self.set_session(id.as_deref(), None, &mut out);
                let is_error = event.get("is_error").and_then(Value::as_bool).unwrap_or(false)
                    || event
                        .get("subtype")
                        .and_then(Value::as_str)
                        .is_some_and(|s| s.starts_with("error"));
                if is_error {
                    self.error = Some(
                        str_at(event, "result")
                            .filter(|r| !r.is_empty())
                            .unwrap_or_else(|| "Claude Code stopped with an error.".into()),
                    );
                } else if self.text.is_empty() {
                    if let Some(result) = str_at(event, "result") {
                        self.push_text(&result, &mut out);
                    }
                }
                let denied = event
                    .get("permission_denials")
                    .and_then(Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(|d| d.get("tool_name").and_then(Value::as_str))
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                if !denied.is_empty() {
                    let mut names: Vec<&str> = denied;
                    names.dedup();
                    out.push(CliEvent::Notice {
                        message: format!(
                            "Claude Code was not allowed to use {} in this mode. Switch Kode to a mode with more access to let it.",
                            names.join(", ")
                        ),
                    });
                }
            }
            _ => {}
        }
        out
    }

    // Cursor Agent `-p --output-format stream-json`: Claude-like system /
    // assistant / result events plus its own tool_call and thinking events.
    fn cursor(&mut self, event: &Value) -> Vec<CliEvent> {
        match event.get("type").and_then(Value::as_str) {
            Some("tool_call") => {
                let id = event
                    .get("call_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let Some((key, call)) = event
                    .get("tool_call")
                    .and_then(Value::as_object)
                    .and_then(|calls| calls.iter().next())
                else {
                    return Vec::new();
                };
                let (name, input) = cursor_tool(key, call);
                match event.get("subtype").and_then(Value::as_str) {
                    Some("started") => {
                        self.tool_since_text = true;
                        vec![CliEvent::ToolStart { id, name, input }]
                    }
                    Some("completed") => {
                        let result = call.get("result").cloned().unwrap_or(Value::Null);
                        let ok = result.get("success");
                        let is_error = ok.is_none() && !result.is_null();
                        let body = ok.or_else(|| result.get("error")).unwrap_or(&result);
                        let output = ["stdout", "content", "message", "error"]
                            .iter()
                            .find_map(|k| body.get(*k).and_then(Value::as_str))
                            .map(str::to_string)
                            .unwrap_or_else(|| if body.is_null() { String::new() } else { body.to_string() });
                        vec![CliEvent::ToolEnd { id, output: clip(&output), is_error }]
                    }
                    _ => Vec::new(),
                }
            }
            Some("thinking") => event
                .get("text")
                .and_then(Value::as_str)
                .filter(|t| !t.is_empty())
                .map(|t| vec![CliEvent::Reasoning { delta: t.to_string() }])
                .unwrap_or_default(),
            _ => self.claude(event),
        }
    }

    // Codex `codex exec --json` (thread/turn/item events).
    fn codex(&mut self, event: &Value) -> Vec<CliEvent> {
        let mut out = Vec::new();
        let str_at = |v: &Value, key: &str| v.get(key).and_then(Value::as_str).map(str::to_string);
        match event.get("type").and_then(Value::as_str) {
            Some("thread.started") => {
                let id = str_at(event, "thread_id");
                self.set_session(id.as_deref(), None, &mut out);
            }
            Some("item.started") | Some("item.updated") | Some("item.completed") => {
                let completed = event.get("type").and_then(Value::as_str) == Some("item.completed");
                let started = event.get("type").and_then(Value::as_str) == Some("item.started");
                let Some(item) = event.get("item") else { return out };
                let id = str_at(item, "id").unwrap_or_default();
                let kind = item
                    .get("type")
                    .or_else(|| item.get("item_type"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                match kind {
                    "agent_message" | "assistant_message" if completed => {
                        let text = str_at(item, "text").unwrap_or_default();
                        self.push_text(&text, &mut out);
                    }
                    "reasoning" if completed => {
                        if let Some(text) = str_at(item, "text") {
                            out.push(CliEvent::Reasoning { delta: format!("{text}\n\n") });
                        }
                    }
                    "command_execution" | "file_change" | "mcp_tool_call" | "web_search" => {
                        // Quick items may skip `item.started`; the frontend
                        // upserts by id, so a second start is harmless.
                        if started || completed {
                            self.tool_since_text = true;
                            out.push(CliEvent::ToolStart {
                                id: id.clone(),
                                name: kind.to_string(),
                                input: item.clone(),
                            });
                        }
                        if completed {
                            let failed = item.get("status").and_then(Value::as_str) == Some("failed")
                                || item
                                    .get("exit_code")
                                    .and_then(Value::as_i64)
                                    .is_some_and(|code| code != 0);
                            let output = str_at(item, "aggregated_output").unwrap_or_default();
                            out.push(CliEvent::ToolEnd {
                                id,
                                output: clip(&output),
                                is_error: failed,
                            });
                        }
                    }
                    "todo_list" => {
                        let items = item
                            .get("items")
                            .and_then(Value::as_array)
                            .map(|list| {
                                list.iter()
                                    .map(|todo| CliTodo {
                                        title: str_at(todo, "text").unwrap_or_default(),
                                        status: if todo
                                            .get("completed")
                                            .and_then(Value::as_bool)
                                            .unwrap_or(false)
                                        {
                                            "completed".into()
                                        } else {
                                            "pending".into()
                                        },
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();
                        out.push(CliEvent::Todos { items });
                    }
                    "error" => {
                        if let Some(message) = str_at(item, "message") {
                            out.push(CliEvent::Notice { message });
                        }
                    }
                    _ => {}
                }
            }
            Some("turn.failed") => {
                self.error = event
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .or_else(|| Some("Codex stopped with an error.".into()));
            }
            Some("error") => {
                if let Some(message) = str_at(event, "message") {
                    self.error = Some(message);
                }
            }
            _ => {}
        }
        out
    }
}

/// Map Cursor's tool call keys ("shellToolCall", "readToolCall", …) to the
/// Claude Code tool names the UI already describes.
fn cursor_tool(key: &str, call: &Value) -> (String, Value) {
    if key == "function" {
        let name = call.get("name").and_then(Value::as_str).unwrap_or("tool").to_string();
        let args = call
            .get("arguments")
            .and_then(Value::as_str)
            .and_then(|a| serde_json::from_str(a).ok())
            .unwrap_or(Value::Null);
        return (name, args);
    }
    let args = call.get("args").cloned().unwrap_or(Value::Null);
    let base = key.trim_end_matches("ToolCall");
    let name = match base {
        "shell" => "Bash",
        "read" => "Read",
        "edit" => "Edit",
        "write" => "Write",
        "delete" => "Delete",
        "grep" => "Grep",
        "glob" => "Glob",
        "ls" => "LS",
        "updateTodos" | "todo" => "TodoWrite",
        other => other,
    };
    (name.to_string(), args)
}

fn claude_todos(input: &Value) -> Option<Vec<CliTodo>> {
    let todos = input.get("todos")?.as_array()?;
    Some(
        todos
            .iter()
            .map(|todo| CliTodo {
                title: todo
                    .get("content")
                    .or_else(|| todo.get("activeForm"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                status: todo
                    .get("status")
                    .and_then(Value::as_str)
                    .unwrap_or("pending")
                    .to_string(),
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {

    #[test]
    fn resumes_or_forks_a_session() {
        let request = |provider: &str, fork: bool| -> CliRunRequest {
            serde_json::from_value(serde_json::json!({
                "provider": provider, "root": "/tmp", "prompt": "hi",
                "sessionId": "abc", "model": null, "mode": "ask", "fork": fork
            }))
            .unwrap()
        };
        let claude = claude_args(&request("claude", true), &[], &[]);
        let at = claude.iter().position(|a| a == "--resume").unwrap();
        assert_eq!(claude[at + 1], "abc");
        assert!(claude.contains(&"--fork-session".to_string()));
        assert!(!claude_args(&request("claude", false), &[], &[]).contains(&"--fork-session".to_string()));
        let codex = codex_args(&request("codex", true), &[]);
        let at = codex.iter().position(|a| a == "fork").unwrap();
        assert_eq!(codex[at + 1], "abc");
        assert!(codex_args(&request("codex", false), &[]).contains(&"resume".to_string()));
    }
    use super::*;
    use serde_json::json;

    // Machine-dependent: run with `cargo test -- --ignored detects_installed`.
    #[test]
    #[ignore]
    fn detects_installed_clis() {
        let specs = ["claude", "codex", "cursor"]
            .iter()
            .map(|p| serde_json::from_value::<InstanceSpec>(json!({ "id": p, "provider": p })).unwrap())
            .collect();
        let statuses = tauri::async_runtime::block_on(kode_cli_detect(specs));
        for status in &statuses {
            println!("{}", serde_json::to_string(status).unwrap());
        }
    }

    #[test]
    fn claude_stream_dedupes_text_and_tracks_session() {
        let mut p = Parser::new(CliProvider::Claude, None);
        let mut all = Vec::new();
        for e in [
            json!({"type":"system","subtype":"init","session_id":"s1","model":"m"}),
            json!({"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}}),
            json!({"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}}),
            json!({"type":"assistant","message":{"content":[{"type":"text","text":"Hello"},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}]}}),
            json!({"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"a\nb"}]}}),
            json!({"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Done"}}}),
            json!({"type":"result","subtype":"success","is_error":false,"result":"Done","session_id":"s1"}),
        ] {
            all.extend(p.handle(&e));
        }
        assert_eq!(p.session_id.as_deref(), Some("s1"));
        assert_eq!(p.text, "Hello\n\nDone");
        assert!(p.error.is_none());
        assert!(all.iter().any(|e| matches!(e, CliEvent::ToolEnd { id, .. } if id == "t1")));
    }

    #[test]
    fn cursor_events_and_model_list() {
        let mut p = Parser::new(CliProvider::Cursor, None);
        let mut all = Vec::new();
        for e in [
            json!({"type":"system","subtype":"init","session_id":"c1","model":"auto"}),
            json!({"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Looking"}]},"session_id":"c1"}),
            json!({"type":"tool_call","subtype":"started","call_id":"t1","tool_call":{"shellToolCall":{"args":{"command":"ls"}}}}),
            json!({"type":"tool_call","subtype":"completed","call_id":"t1","tool_call":{"shellToolCall":{"args":{"command":"ls"},"result":{"success":{"stdout":"a.txt"}}}}}),
            json!({"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Done"}]},"session_id":"c1"}),
            json!({"type":"result","subtype":"success","is_error":false,"result":"LookingDone","session_id":"c1"}),
        ] {
            all.extend(p.handle(&e));
        }
        assert_eq!(p.session_id.as_deref(), Some("c1"));
        assert_eq!(p.text, "Looking\n\nDone");
        assert!(all.iter().any(|e| matches!(e, CliEvent::ToolStart { name, .. } if name == "Bash")));
        assert!(all.iter().any(|e| matches!(e, CliEvent::ToolEnd { output, is_error: false, .. } if output == "a.txt")));

        let models = parse_cursor_models("Loading models…\nauto - Auto  (current)\nsonnet-4.5 - Claude 4.5 Sonnet\n");
        assert_eq!(models.len(), 2);
        assert_eq!(models[1].id, "sonnet-4.5");
        assert_eq!(models[0].name, "Auto");
        assert_eq!(strip_ansi("\u{1b}[2K\u{1b}[GNot logged in"), "Not logged in");
    }

    #[test]
    fn codex_events_map_to_text_tools_and_errors() {
        let mut p = Parser::new(CliProvider::Codex, None);
        for e in [
            json!({"type":"thread.started","thread_id":"th1"}),
            json!({"type":"item.started","item":{"id":"i1","type":"command_execution","command":"ls","status":"in_progress"}}),
            json!({"type":"item.completed","item":{"id":"i1","type":"command_execution","command":"ls","aggregated_output":"x","exit_code":0,"status":"completed"}}),
            json!({"type":"item.completed","item":{"id":"i2","type":"agent_message","text":"All good"}}),
        ] {
            p.handle(&e);
        }
        assert_eq!(p.session_id.as_deref(), Some("th1"));
        assert_eq!(p.text, "All good");
        p.handle(&json!({"type":"turn.failed","error":{"message":"boom"}}));
        assert_eq!(p.error.as_deref(), Some("boom"));
    }

    #[test]
    fn claude_rejected_rate_limit_keeps_reset_time() {
        let mut p = Parser::new(CliProvider::Claude, None);
        p.handle(&json!({"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","resetsAt":1794000000}}));
        assert_eq!(p.limit_resets_at, None);
        p.handle(&json!({"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1794000000,"rateLimitType":"five_hour"}}));
        assert_eq!(p.limit_resets_at, Some(1_794_000_000_000));
    }

    #[test]
    fn mcp_configs_for_claude_and_codex() {
        let servers = vec![
            ResolvedMcp {
                spec: McpSpec {
                    name: "my files".into(),
                    command: Some("npx".into()),
                    args: vec!["-y".into(), "server".into()],
                    env: HashMap::from([("KEY".to_string(), "v\"1".to_string())]),
                    url: None,
                },
                token: None,
            },
            ResolvedMcp {
                spec: McpSpec { name: "vercel".into(), command: None, args: vec![], env: HashMap::new(), url: Some("https://mcp.vercel.com".into()) },
                token: Some("tok".into()),
            },
        ];
        let claude = claude_mcp_config(&servers);
        assert_eq!(claude["mcpServers"]["my_files"]["command"], "npx");
        assert_eq!(claude["mcpServers"]["vercel"]["headers"]["Authorization"], "Bearer tok");

        let (args, env) = codex_mcp_overrides(&servers);
        assert!(args.contains(&"mcp_servers.my_files.command=\"npx\"".to_string()));
        assert!(args.contains(&"mcp_servers.my_files.args=[\"-y\",\"server\"]".to_string()));
        assert!(args.contains(&"mcp_servers.my_files.env={\"KEY\"=\"v\\\"1\"}".to_string()));
        assert!(args.contains(&"mcp_servers.vercel.url=\"https://mcp.vercel.com\"".to_string()));
        assert_eq!(env, vec![("KONTINUE_MCP_TOKEN_1".to_string(), "tok".to_string())]);
    }
}
