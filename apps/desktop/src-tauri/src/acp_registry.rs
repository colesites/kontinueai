// ACP Registry (agentclientprotocol.com/registry): the public list of agents
// that speak the Agent Client Protocol, and managed installs of the ones that
// ship as downloads (Google Antigravity, for example). Downloads are checked
// against the registry's SHA-256 and unpacked to ~/.kontinue/acp-agents/<id>.

use super::{CliRunState, CliTaskResult};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::ipc::Channel;
use tokio::io::AsyncWriteExt;

const INDEX_URL: &str = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
/// Written next to an installed agent; holds the registry version.
const VERSION_FILE: &str = ".kontinue-version";

/// The registry's platform key for this computer.
pub(super) fn platform() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "darwin-aarch64",
        ("macos", "x86_64") => "darwin-x86_64",
        ("linux", "aarch64") => "linux-aarch64",
        ("linux", "x86_64") => "linux-x86_64",
        ("windows", "aarch64") => "windows-aarch64",
        ("windows", "x86_64") => "windows-x86_64",
        _ => "unknown",
    }
}

fn agents_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|home| PathBuf::from(home).join(".kontinue").join("acp-agents"))
}

/// Install folder when `binary` is one of our managed downloads.
pub(super) fn managed_dir(binary: &Path) -> Option<PathBuf> {
    let root = agents_dir()?;
    let id = binary.strip_prefix(&root).ok()?.components().next()?;
    Some(root.join(id))
}

/// Registry id of a managed download.
pub(super) fn managed_id(binary: &Path) -> Option<String> {
    managed_dir(binary)?.file_name().map(|n| n.to_string_lossy().to_string())
}

/// Version recorded when the managed download was installed.
pub(super) fn managed_version(binary: &Path) -> Option<String> {
    let text = std::fs::read_to_string(managed_dir(binary)?.join(VERSION_FILE)).ok()?;
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_string())
}

pub(super) async fn fetch_index() -> Result<Value, String> {
    let response = reqwest::Client::new()
        .get(INDEX_URL)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Could not reach the ACP Registry: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("The ACP Registry answered {}.", response.status()));
    }
    response
        .json::<Value>()
        .await
        .map_err(|e| format!("The ACP Registry sent an unexpected answer: {e}"))
}

fn was_stopped(state: &CliRunState, run_id: u32) -> bool {
    state.stopped.lock().map(|set| set.contains(&run_id)).unwrap_or(false)
}

/// Download (or update) a registry agent's binary for this computer.
pub(super) async fn install(
    state: &CliRunState,
    run_id: u32,
    agent_id: &str,
    on_line: Channel<String>,
) -> Result<CliTaskResult, String> {
    let result = install_inner(state, run_id, agent_id, &on_line).await;
    let stopped = state.stopped.lock().map(|mut set| set.remove(&run_id)).unwrap_or(false);
    let (success, output) = match result {
        Ok(message) => (true, message),
        Err(error) => (false, if stopped { "Stopped.".to_string() } else { error }),
    };
    let _ = on_line.send(output.clone());
    Ok(CliTaskResult { success: success && !stopped, stopped, output })
}

async fn install_inner(
    state: &CliRunState,
    run_id: u32,
    agent_id: &str,
    on_line: &Channel<String>,
) -> Result<String, String> {
    if agent_id.is_empty() || agent_id.contains(['/', '\\', '.']) {
        return Err(format!("`{agent_id}` is not a registry agent id."));
    }
    let say = |line: String| {
        let _ = on_line.send(line);
    };
    say("Looking it up in the ACP Registry…".to_string());
    let index = fetch_index().await?;
    let agent = index
        .get("agents")
        .and_then(Value::as_array)
        .and_then(|agents| agents.iter().find(|a| a.get("id").and_then(Value::as_str) == Some(agent_id)))
        .ok_or_else(|| format!("`{agent_id}` is not in the ACP Registry."))?;
    let name = agent.get("name").and_then(Value::as_str).unwrap_or(agent_id).to_string();
    let version = agent.get("version").and_then(Value::as_str).unwrap_or("").to_string();
    let target = agent
        .pointer(&format!("/distribution/binary/{}", platform()))
        .ok_or_else(|| format!("{name} has no download for this computer ({}).", platform()))?;
    let url = target.get("archive").and_then(Value::as_str).ok_or("The registry entry has no download link.")?;
    let cmd = target.get("cmd").and_then(Value::as_str).ok_or("The registry entry has no command.")?;
    let expected = target.get("sha256").and_then(Value::as_str).map(str::to_ascii_lowercase);

    let root = agents_dir().ok_or("Could not find your home folder.")?;
    let dest = root.join(agent_id);
    let work = root.join(format!(".{agent_id}-download"));
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|e| format!("Could not create {}: {e}", work.display()))?;

    // Download, hashing as it arrives.
    say(format!("Downloading {name} {version}…"));
    let mut response = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Download failed: the server answered {}.", response.status()));
    }
    let total = response.content_length();
    let file_name = url.split(['?', '#']).next().unwrap_or(url).rsplit('/').next().unwrap_or("download").to_string();
    let archive = work.join(&file_name);
    let mut file = tokio::fs::File::create(&archive).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut reported: u64 = 0;
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("Download failed: {e}"))? {
        if was_stopped(state, run_id) {
            let _ = std::fs::remove_dir_all(&work);
            return Err("Stopped.".to_string());
        }
        hasher.update(&chunk);
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        // A line every 10% (or every 20 MB when the size is unknown).
        let step = total.map(|t| (t / 10).max(1)).unwrap_or(20 << 20);
        if received - reported >= step {
            reported = received;
            let mb = received as f64 / 1_048_576.0;
            say(match total {
                Some(t) => format!("{mb:.0} MB of {:.0} MB", t as f64 / 1_048_576.0),
                None => format!("{mb:.0} MB"),
            });
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    let digest = format!("{:x}", hasher.finalize());
    match expected {
        Some(expected) if expected != digest => {
            let _ = std::fs::remove_dir_all(&work);
            return Err("The download does not match the registry's checksum, so it was not installed.".to_string());
        }
        Some(_) => say("Checksum verified.".to_string()),
        None => {}
    }

    say("Unpacking…".to_string());
    let unpacked = work.join("unpacked");
    std::fs::create_dir_all(&unpacked).map_err(|e| e.to_string())?;
    let (archive_path, out_dir, cmd_name) = (archive.clone(), unpacked.clone(), cmd.to_string());
    tokio::task::spawn_blocking(move || unpack(&archive_path, &out_dir, &cmd_name))
        .await
        .map_err(|e| e.to_string())??;

    if !unpacked.join(cmd.trim_start_matches("./")).is_file() {
        let _ = std::fs::remove_dir_all(&work);
        return Err(format!("The download did not contain `{cmd}`."));
    }
    // Swap the new install in place of the old one.
    let _ = std::fs::remove_dir_all(&dest);
    std::fs::rename(&unpacked, &dest).map_err(|e| format!("Could not move the agent into place: {e}"))?;
    let _ = std::fs::write(dest.join(VERSION_FILE), &version);
    let _ = std::fs::remove_dir_all(&work);

    let program = dest.join(cmd.trim_start_matches("./"));
    make_executable(&program);
    // Helpers that ship beside the command (Antigravity's localharness_external).
    if let Some(dir) = program.parent() {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let plain = path.extension().is_none() || path.extension().is_some_and(|e| e == "par");
                if path.is_file() && plain && !path.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.')) {
                    make_executable(&path);
                }
            }
        }
    }
    Ok(format!("Installed {name} {version}."))
}

fn unpack(archive: &Path, out: &Path, cmd: &str) -> Result<(), String> {
    let name = archive.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    if name.ends_with(".zip") {
        let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("Could not open the archive: {e}"))?;
        zip.extract(out).map_err(|e| format!("Could not unpack the archive: {e}"))
    } else if [".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".tar"].iter().any(|ext| name.ends_with(ext)) {
        let status = std::process::Command::new("tar")
            .arg("-xf")
            .arg(archive)
            .arg("-C")
            .arg(out)
            .status()
            .map_err(|e| format!("Could not run tar: {e}"))?;
        status.success().then_some(()).ok_or_else(|| "Could not unpack the archive.".to_string())
    } else {
        // A bare executable.
        let target = out.join(cmd.trim_start_matches("./"));
        std::fs::copy(archive, &target).map(|_| ()).map_err(|e| e.to_string())
    }
}

fn make_executable(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(path) {
            let mut perms = meta.permissions();
            perms.set_mode(perms.mode() | 0o755);
            let _ = std::fs::set_permissions(path, perms);
        }
    }
    #[cfg(not(unix))]
    let _ = path;
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Downloads Google Antigravity for real: `cargo test acp_registry -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore]
    async fn installs_antigravity() {
        let state = CliRunState::default();
        let channel = Channel::new(|body| {
            if let tauri::ipc::InvokeResponseBody::Json(text) = body {
                println!("{text}");
            }
            Ok(())
        });
        let result = install(&state, 1, "antigravity-acp", channel).await.unwrap();
        assert!(result.success, "{}", result.output);
        let program = agents_dir().unwrap().join("antigravity-acp/agy_acp_server.par");
        assert!(program.is_file());
        assert_eq!(managed_id(&program).as_deref(), Some("antigravity-acp"));
        assert!(managed_version(&program).is_some());
    }
}
