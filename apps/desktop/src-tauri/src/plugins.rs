// Plugins in the Claude Code plugin format, so existing plugins install as-is.
//
//   <plugin>/
//     .claude-plugin/plugin.json   name, description, version, author
//     commands/*.md                slash commands (frontmatter + prompt)
//     skills/<name>/SKILL.md       skills
//     .mcp.json                    MCP servers (or "mcpServers" in plugin.json)
//     agents/, hooks/              listed, not run yet
//
// A source is a local folder, a GitHub "owner/repo", or a git URL. A source can
// be one plugin or a marketplace (.claude-plugin/marketplace.json) listing
// several. Installed plugins are copied to ~/.kontinue/plugins/<name>, and
// ~/.kontinue/plugins/registry.json records which are installed and enabled.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

fn home() -> Result<PathBuf, String> {
    std::env::var("HOME")
        .map(PathBuf::from)
        .map_err(|_| "Couldn't find your home folder.".to_string())
}

pub fn plugins_dir() -> Result<PathBuf, String> {
    Ok(home()?.join(".kontinue").join("plugins"))
}

fn registry_path() -> Result<PathBuf, String> {
    Ok(plugins_dir()?.join("registry.json"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEntry {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    /// Where it was installed from (folder, owner/repo or git URL).
    pub source: String,
    pub enabled: bool,
    pub installed_at: u64,
    /// Hooks run commands on this Mac, so they stay off until allowed.
    #[serde(default)]
    pub hooks_allowed: bool,
}

fn read_registry() -> Vec<RegistryEntry> {
    registry_path()
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn write_registry(entries: &[RegistryEntry]) -> Result<(), String> {
    let path = registry_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| format!("Couldn't save the plugin list: {e}"))
}

/// Folders of enabled plugins (for skill discovery).
pub fn enabled_plugin_dirs() -> Vec<(String, PathBuf)> {
    let Ok(base) = plugins_dir() else { return Vec::new() };
    read_registry()
        .into_iter()
        .filter(|entry| entry.enabled)
        .map(|entry| {
            let dir = base.join(&entry.name);
            (entry.name, dir)
        })
        .filter(|(_, dir)| dir.is_dir())
        .collect()
}

fn safe_name(name: &str) -> Result<String, String> {
    let clean: String = name
        .trim()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') { c } else { '-' })
        .collect();
    let clean = clean.trim_matches(|c| c == '.' || c == '-').to_string();
    if clean.is_empty() || clean.len() > 80 {
        return Err("This plugin has no usable name.".into());
    }
    Ok(clean)
}

fn read_json(path: &Path) -> Option<Value> {
    std::fs::read_to_string(path).ok().and_then(|text| serde_json::from_str(&text).ok())
}

fn manifest(dir: &Path) -> Option<Value> {
    read_json(&dir.join(".claude-plugin").join("plugin.json"))
}

fn author_of(value: &Value) -> Option<String> {
    match value.get("author") {
        Some(Value::String(name)) => Some(name.clone()),
        Some(Value::Object(obj)) => obj.get("name").and_then(Value::as_str).map(str::to_string),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Looking at a source before installing
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcePlugin {
    name: String,
    description: String,
    version: Option<String>,
    /// Folder inside the staged source, or None when it lives in another repo.
    rel_path: Option<String>,
    /// Another source to look at (marketplace entries that point to a repo).
    remote: Option<String>,
    /// Folder inside `remote` (marketplace "git-subdir" entries).
    remote_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceListing {
    staging_dir: String,
    /// Marketplace name, when the source is one.
    marketplace: Option<String>,
    plugins: Vec<SourcePlugin>,
}

fn git_url(source: &str) -> Option<String> {
    let s = source.trim();
    if s.starts_with("https://") || s.starts_with("git@") || s.ends_with(".git") {
        return Some(s.to_string());
    }
    let parts: Vec<&str> = s.split('/').collect();
    if parts.len() == 2 && parts.iter().all(|p| !p.is_empty() && !p.contains(' ')) && !s.starts_with('.') && !s.starts_with('~') {
        return Some(format!("https://github.com/{s}.git"));
    }
    None
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(from).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name();
        if name == ".git" {
            continue;
        }
        let src = entry.path();
        let dst = to.join(&name);
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() {
            continue; // never follow links out of the plugin
        } else if kind.is_dir() {
            copy_dir(&src, &dst)?;
        } else {
            std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Stage a source (clone or copy) and list the plugins in it.
#[tauri::command]
pub async fn plugin_inspect_source(source: String, subdir: Option<String>) -> Result<SourceListing, String> {
    let source = source.trim().to_string();
    if source.is_empty() {
        return Err("Enter a folder, a GitHub owner/repo, or a git URL.".into());
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let staging = plugins_dir()?.join(".staging").join(stamp.to_string());
    std::fs::create_dir_all(staging.parent().unwrap_or(&staging)).map_err(|e| e.to_string())?;

    if let Some(url) = git_url(&source) {
        let output = tokio::process::Command::new(crate::cli_agents::program_path("git"))
            .args(["clone", "--depth", "1", &url])
            .arg(&staging)
            .env("PATH", crate::cli_agents::login_path())
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .await
            .map_err(|e| format!("Couldn't run git: {e}"))?;
        if !output.status.success() {
            let _ = std::fs::remove_dir_all(&staging);
            let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if err.is_empty() { "Couldn't download that repository.".into() } else { err });
        }
    } else {
        let folder = PathBuf::from(source.replace('~', &home()?.to_string_lossy()));
        if !folder.is_dir() {
            return Err("That folder doesn't exist.".into());
        }
        copy_dir(&folder, &staging)?;
    }

    let mut plugins = Vec::new();
    let mut marketplace_name = None;
    if let Some(market) = read_json(&staging.join(".claude-plugin").join("marketplace.json")) {
        marketplace_name = market.get("name").and_then(Value::as_str).map(str::to_string);
        for item in market.get("plugins").and_then(Value::as_array).cloned().unwrap_or_default() {
            let name = item.get("name").and_then(Value::as_str).unwrap_or("plugin").to_string();
            let description = item.get("description").and_then(Value::as_str).unwrap_or("").to_string();
            let version = item.get("version").and_then(Value::as_str).map(str::to_string);
            // "./plugins/x", or {"source":"github","repo":…}, {"source":"url","url":…},
            // {"source":"git-subdir","url":…,"path":…}.
            let (rel_path, remote, remote_path) = match item.get("source") {
                Some(Value::String(path)) => (Some(path.trim_start_matches("./").to_string()), None, None),
                Some(Value::Object(obj)) => (
                    None,
                    obj.get("repo")
                        .or_else(|| obj.get("url"))
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    obj.get("path").and_then(Value::as_str).map(str::to_string),
                ),
                _ => (None, None, None),
            };
            plugins.push(SourcePlugin { name, description, version, rel_path, remote, remote_path });
        }
    }
    let sub = subdir
        .filter(|s| !s.trim().is_empty() && !s.split('/').any(|p| p == ".."))
        .map(|s| s.trim().trim_start_matches("./").trim_end_matches('/').to_string());
    if sub.is_some() {
        plugins.clear(); // a specific folder was asked for
    }
    if plugins.is_empty() {
        let rel = sub.unwrap_or_default();
        let root = if rel.is_empty() { staging.clone() } else { staging.join(&rel) };
        if let Some(found) = manifest(&root) {
            plugins.push(SourcePlugin {
                name: found.get("name").and_then(Value::as_str).unwrap_or("plugin").to_string(),
                description: found.get("description").and_then(Value::as_str).unwrap_or("").to_string(),
                version: found.get("version").and_then(Value::as_str).map(str::to_string),
                rel_path: Some(rel),
                remote: None,
                remote_path: None,
            });
        }
    }
    if plugins.is_empty() {
        let _ = std::fs::remove_dir_all(&staging);
        return Err("No plugin found there (looked for .claude-plugin/plugin.json or marketplace.json).".into());
    }
    Ok(SourceListing {
        staging_dir: staging.to_string_lossy().to_string(),
        marketplace: marketplace_name,
        plugins,
    })
}

/// Install one plugin from a staged source.
#[tauri::command(async)]
pub fn plugin_install(staging_dir: String, rel_path: String, source: String) -> Result<RegistryEntry, String> {
    let base = plugins_dir()?;
    let staging = PathBuf::from(&staging_dir);
    if !staging.starts_with(base.join(".staging")) {
        return Err("Invalid staging folder.".into());
    }
    if rel_path.split('/').any(|part| part == "..") {
        return Err("Invalid plugin path.".into());
    }
    let dir = if rel_path.is_empty() { staging.clone() } else { staging.join(&rel_path) };
    let found = manifest(&dir).unwrap_or(Value::Null);
    let fallback = dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let name = safe_name(found.get("name").and_then(Value::as_str).unwrap_or(&fallback))?;
    let target = base.join(&name);
    if target.exists() {
        std::fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
    }
    copy_dir(&dir, &target)?;

    let entry = RegistryEntry {
        name: name.clone(),
        description: found.get("description").and_then(Value::as_str).unwrap_or("").to_string(),
        version: found.get("version").and_then(Value::as_str).map(str::to_string),
        author: author_of(&found),
        source,
        enabled: true,
        hooks_allowed: false,
        installed_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    };
    let mut registry: Vec<RegistryEntry> = read_registry().into_iter().filter(|e| e.name != name).collect();
    registry.push(entry.clone());
    write_registry(&registry)?;
    Ok(entry)
}

/// Remove a staged source once installing is done or cancelled.
#[tauri::command(async)]
pub fn plugin_discard_staging(staging_dir: String) -> Result<(), String> {
    let staging = PathBuf::from(&staging_dir);
    if staging.starts_with(plugins_dir()?.join(".staging")) && staging.is_dir() {
        std::fs::remove_dir_all(staging).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Installed plugins
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginCommand {
    name: String,
    description: String,
    argument_hint: Option<String>,
    /// The prompt (frontmatter removed).
    body: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    #[serde(flatten)]
    entry: RegistryEntry,
    dir: String,
    commands: Vec<PluginCommand>,
    skills: Vec<String>,
    /// `mcpServers` object with ${CLAUDE_PLUGIN_ROOT} filled in.
    mcp_servers: Value,
    agents: Vec<PluginAgent>,
    /// hooks/hooks.json (or "hooks" in plugin.json), with ${CLAUDE_PLUGIN_ROOT} filled in.
    hooks: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginAgent {
    name: String,
    description: String,
    /// The agent's system prompt (frontmatter removed).
    prompt: String,
}

/// Split `---\nkey: value\n---\nbody` frontmatter.
fn frontmatter(text: &str) -> (Vec<(String, String)>, String) {
    let trimmed = text.trim_start_matches('\u{feff}');
    if let Some(rest) = trimmed.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            let head = &rest[..end];
            let body = rest[end + 4..].trim_start_matches(['\r', '\n']).to_string();
            let fields = head
                .lines()
                .filter_map(|line| {
                    let (key, value) = line.split_once(':')?;
                    Some((key.trim().to_string(), value.trim().trim_matches('"').to_string()))
                })
                .collect();
            return (fields, body);
        }
    }
    (Vec::new(), trimmed.to_string())
}

fn md_files(dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|ext| ext == "md"))
                .collect()
        })
        .unwrap_or_default();
    files.sort();
    files
}

fn fill_root(value: Value, root: &str) -> Value {
    match value {
        Value::String(s) => Value::String(s.replace("${CLAUDE_PLUGIN_ROOT}", root)),
        Value::Array(items) => Value::Array(items.into_iter().map(|v| fill_root(v, root)).collect()),
        Value::Object(map) => Value::Object(map.into_iter().map(|(k, v)| (k, fill_root(v, root))).collect()),
        other => other,
    }
}

fn describe(entry: RegistryEntry, dir: &Path) -> InstalledPlugin {
    // plugin.json can list its commands; otherwise every commands/*.md except
    // notes like _conventions.md.
    let listed: Option<Vec<PathBuf>> = manifest(dir)
        .and_then(|m| m.get("commands").and_then(Value::as_array).cloned())
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .filter(|p| !p.split('/').any(|part| part == ".."))
                .map(|p| dir.join(p.trim_start_matches("./")))
                .collect()
        });
    let command_files = listed.unwrap_or_else(|| {
        md_files(&dir.join("commands"))
            .into_iter()
            .filter(|p| !p.file_name().is_some_and(|n| n.to_string_lossy().starts_with('_')))
            .collect()
    });
    let commands = command_files
        .into_iter()
        .filter_map(|path| {
            let name = path.file_stem()?.to_string_lossy().to_string();
            let text = std::fs::read_to_string(&path).ok()?;
            let (fields, body) = frontmatter(&text);
            let get = |key: &str| fields.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone());
            Some(PluginCommand {
                description: get("description").unwrap_or_else(|| format!("From the {} plugin", entry.name)),
                argument_hint: get("argument-hint"),
                name,
                body,
            })
        })
        .collect();
    let skills = std::fs::read_dir(dir.join("skills"))
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.path().join("SKILL.md").is_file())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default();
    let root = dir.to_string_lossy().to_string();
    let mcp = read_json(&dir.join(".mcp.json"))
        .and_then(|v| v.get("mcpServers").cloned().or(Some(v)))
        .or_else(|| manifest(dir).and_then(|m| m.get("mcpServers").cloned()))
        .filter(Value::is_object)
        .map(|v| fill_root(v, &root))
        .unwrap_or_else(|| Value::Object(Default::default()));
    let agents = md_files(&dir.join("agents"))
        .into_iter()
        .filter_map(|path| {
            let text = std::fs::read_to_string(&path).ok()?;
            let (fields, prompt) = frontmatter(&text);
            let get = |key: &str| fields.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone());
            Some(PluginAgent {
                name: get("name").unwrap_or_else(|| path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()),
                description: get("description").unwrap_or_default(),
                prompt,
            })
        })
        .collect();
    let hooks = read_json(&dir.join("hooks").join("hooks.json"))
        .or_else(|| manifest(dir).and_then(|m| m.get("hooks").cloned()).filter(Value::is_object))
        .map(|v| v.get("hooks").cloned().unwrap_or(v))
        .map(|v| fill_root(v, &root))
        .unwrap_or(Value::Null);
    InstalledPlugin {
        dir: root,
        commands,
        skills,
        mcp_servers: mcp,
        agents,
        hooks,
        entry,
    }
}

fn read_commands(dir: &Path, fallback_description: &str) -> Vec<PluginCommand> {
    md_files(dir)
        .into_iter()
        .filter(|p| !p.file_name().is_some_and(|n| n.to_string_lossy().starts_with('_')))
        .filter_map(|path| {
            let name = path.file_stem()?.to_string_lossy().to_string();
            let text = std::fs::read_to_string(&path).ok()?;
            let (fields, body) = frontmatter(&text);
            let get = |key: &str| fields.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone());
            Some(PluginCommand {
                description: get("description").unwrap_or_else(|| fallback_description.to_string()),
                argument_hint: get("argument-hint"),
                name,
                body,
            })
        })
        .collect()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserCommands {
    /// ~/.claude/commands and ~/.kontinue/commands
    user: Vec<PluginCommand>,
    /// <project>/.claude/commands and <project>/.kontinue/commands
    project: Vec<PluginCommand>,
}

/// Your own Claude Code style commands, so `/name` works the same in Kode.
#[tauri::command(async)]
pub fn kode_list_user_commands(project_root: Option<String>) -> Result<UserCommands, String> {
    let home = home()?;
    let mut user = read_commands(&home.join(".claude").join("commands"), "Your command");
    user.extend(read_commands(&home.join(".kontinue").join("commands"), "Your command"));
    let mut project = Vec::new();
    if let Some(root) = project_root.filter(|r| !r.trim().is_empty()) {
        let root = PathBuf::from(root);
        project.extend(read_commands(&root.join(".claude").join("commands"), "Project command"));
        project.extend(read_commands(&root.join(".kontinue").join("commands"), "Project command"));
    }
    Ok(UserCommands { user, project })
}

#[tauri::command(async)]
pub fn plugin_list() -> Result<Vec<InstalledPlugin>, String> {
    let base = plugins_dir()?;
    Ok(read_registry()
        .into_iter()
        .filter_map(|entry| {
            let dir = base.join(&entry.name);
            dir.is_dir().then(|| describe(entry, &dir))
        })
        .collect())
}

#[tauri::command(async)]
pub fn plugin_set_enabled(name: String, enabled: bool) -> Result<(), String> {
    let mut registry = read_registry();
    let entry = registry
        .iter_mut()
        .find(|e| e.name == name)
        .ok_or_else(|| "That plugin isn't installed.".to_string())?;
    entry.enabled = enabled;
    write_registry(&registry)
}

#[tauri::command(async)]
pub fn plugin_set_hooks_allowed(name: String, allowed: bool) -> Result<(), String> {
    let mut registry = read_registry();
    let entry = registry
        .iter_mut()
        .find(|e| e.name == name)
        .ok_or_else(|| "That plugin isn't installed.".to_string())?;
    entry.hooks_allowed = allowed;
    write_registry(&registry)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookOutput {
    exit_code: i32,
    stdout: String,
    stderr: String,
}

fn hook_commands(hooks: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(events) = hooks.as_object() {
        for groups in events.values() {
            for group in groups.as_array().into_iter().flatten() {
                for hook in group.get("hooks").and_then(Value::as_array).into_iter().flatten() {
                    if let Some(command) = hook.get("command").and_then(Value::as_str) {
                        out.push(command.to_string());
                    }
                }
            }
        }
    }
    out
}

/// Run one hook command from an enabled plugin whose hooks are allowed.
/// `input` goes to stdin as JSON (the Claude Code hook input).
#[tauri::command]
pub async fn plugin_run_hook(
    plugin: String,
    command: String,
    cwd: String,
    input: Value,
    timeout_secs: Option<u64>,
) -> Result<HookOutput, String> {
    use tokio::io::AsyncWriteExt;

    let entry = read_registry()
        .into_iter()
        .find(|e| e.name == plugin && e.enabled && e.hooks_allowed)
        .ok_or("That plugin's hooks aren't allowed.")?;
    let dir = plugins_dir()?.join(&entry.name);
    let described = describe(entry, &dir);
    if !hook_commands(&described.hooks).iter().any(|c| c == &command) {
        return Err("That command isn't one of the plugin's hooks.".into());
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let mut child = tokio::process::Command::new(crate::cli_agents::program_path(&shell))
        .args(["-c", &command])
        .current_dir(if std::path::Path::new(&cwd).is_dir() { cwd.clone() } else { described.dir.clone() })
        .env("PATH", crate::cli_agents::login_path())
        .env("CLAUDE_PLUGIN_ROOT", &described.dir)
        .env("CLAUDE_PROJECT_DIR", &cwd)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Couldn't run the hook: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.to_string().as_bytes()).await;
    }
    let limit = std::time::Duration::from_secs(timeout_secs.unwrap_or(60).clamp(1, 600));
    let output = tokio::time::timeout(limit, child.wait_with_output())
        .await
        .map_err(|_| "The hook took too long.".to_string())?
        .map_err(|e| e.to_string())?;
    let clip = |bytes: &[u8]| String::from_utf8_lossy(bytes).chars().take(20_000).collect::<String>();
    Ok(HookOutput {
        exit_code: output.status.code().unwrap_or(-1),
        stdout: clip(&output.stdout),
        stderr: clip(&output.stderr),
    })
}

/// Install a plugin's npm dependencies so its hook scripts can run. Production
/// only and with --ignore-scripts, so no install-time scripts execute. Uses
/// the package manager its lockfile names. Returns a short status.
#[tauri::command]
pub async fn plugin_install_deps(name: String) -> Result<String, String> {
    let name = safe_name(&name)?;
    let dir = plugins_dir()?.join(&name);
    if !dir.join("package.json").is_file() {
        return Ok("No dependencies to install.".into());
    }
    let has = |file: &str| dir.join(file).is_file();
    let (program, args): (&str, Vec<&str>) = if has("bun.lock") || has("bun.lockb") {
        ("bun", vec!["install", "--production", "--ignore-scripts"])
    } else if has("pnpm-lock.yaml") {
        ("pnpm", vec!["install", "--prod", "--ignore-scripts"])
    } else if has("yarn.lock") {
        ("yarn", vec!["install", "--production", "--ignore-scripts"])
    } else {
        ("npm", vec!["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"])
    };
    let run = |program: &'static str, args: Vec<&'static str>| {
        let dir = dir.clone();
        async move {
            tokio::process::Command::new(crate::cli_agents::program_path(program))
                .args(&args)
                .current_dir(&dir)
                .env("PATH", crate::cli_agents::login_path())
                .env("CI", "1")
                .stdin(std::process::Stdio::null())
                .output()
                .await
        }
    };
    let limit = std::time::Duration::from_secs(300);
    let mut used = program;
    let mut output = tokio::time::timeout(limit, run(program, args)).await.map_err(|_| "Installing dependencies took too long.")?;
    // Fall back to npm when the preferred tool isn't installed.
    if output.as_ref().is_err_and(|e| e.kind() == std::io::ErrorKind::NotFound) && program != "npm" {
        used = "npm";
        output = tokio::time::timeout(
            limit,
            run("npm", vec!["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"]),
        )
        .await
        .map_err(|_| "Installing dependencies took too long.")?;
    }
    let output = output.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "Node.js isn't installed, so this plugin's hooks can't run. Install Node (or Bun) and try again.".to_string()
        } else {
            e.to_string()
        }
    })?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{used} install failed: {}", err.trim().chars().take(300).collect::<String>()));
    }
    Ok(format!("Dependencies installed with {used}."))
}

#[tauri::command(async)]
pub fn plugin_remove(name: String) -> Result<(), String> {
    let name = safe_name(&name)?;
    let dir = plugins_dir()?.join(&name);
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let registry: Vec<RegistryEntry> = read_registry().into_iter().filter(|e| e.name != name).collect();
    write_registry(&registry)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_frontmatter() {
        let (fields, body) = frontmatter("---\ndescription: Deploy it\nargument-hint: [env]\n---\nDeploy $ARGUMENTS now.\n");
        assert_eq!(fields[0], ("description".to_string(), "Deploy it".to_string()));
        assert_eq!(body, "Deploy $ARGUMENTS now.\n");
        let (none, plain) = frontmatter("Just a prompt");
        assert!(none.is_empty());
        assert_eq!(plain, "Just a prompt");
    }

    #[test]
    fn git_sources() {
        assert_eq!(git_url("vercel/vercel-plugin").as_deref(), Some("https://github.com/vercel/vercel-plugin.git"));
        assert_eq!(git_url("https://github.com/a/b").as_deref(), Some("https://github.com/a/b"));
        assert_eq!(git_url("./local/folder"), None);
        assert_eq!(git_url("~/plugins/x"), None);
    }

    #[test]
    fn fills_plugin_root() {
        let value = serde_json::json!({"s": {"command": "${CLAUDE_PLUGIN_ROOT}/bin/run", "args": ["${CLAUDE_PLUGIN_ROOT}/x"]}});
        let filled = fill_root(value, "/p");
        assert_eq!(filled["s"]["command"], "/p/bin/run");
        assert_eq!(filled["s"]["args"][0], "/p/x");
    }

    /// Reads a real plugin when one is on this machine (skipped otherwise).
    #[test]
    fn describes_installed_vercel_plugin_when_present() {
        let Ok(home) = std::env::var("HOME") else { return };
        let dir = PathBuf::from(home).join(".claude/plugins/cache/claude-plugins-official/vercel/0.50.0");
        if !dir.is_dir() {
            return;
        }
        let entry = RegistryEntry {
            name: "vercel".into(),
            description: String::new(),
            version: None,
            author: None,
            source: "test".into(),
            enabled: true,
            installed_at: 0,
            hooks_allowed: false,
        };
        let plugin = describe(entry, &dir);
        let names: Vec<&str> = plugin.commands.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, ["bootstrap", "deploy", "env", "status"]);
        assert!(plugin.skills.len() > 5);
        assert_eq!(plugin.mcp_servers["vercel"]["url"], "https://mcp.vercel.com");
        assert!(!plugin.agents.is_empty());
    }
}
