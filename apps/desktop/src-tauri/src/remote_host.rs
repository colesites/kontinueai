// Native helpers for Kode remote control (src/lib/kode-remote-host.tsx).
//
// kode_computer_name: the name your other devices show for this computer.
//
// kode_keep_awake: keep the computer from sleeping while remote control has a
// run going. A sleeping computer drops its connection, so a run you started
// from your phone would stall until you got back.
//
// macOS: `caffeinate -i -w <our pid>`, by absolute path (no PATH lookup, see
// cli_agents::program_path) and tied to our pid so it ends if we crash.
// Linux: `systemd-inhibit` around `tail --pid`, same idea.
// Windows: SetThreadExecutionState on a thread parked until released.

use std::sync::Mutex;

#[cfg(not(windows))]
type Hold = std::process::Child;
#[cfg(windows)]
type Hold = std::sync::mpsc::Sender<()>;

static HOLD: Mutex<Option<Hold>> = Mutex::new(None);

#[cfg(target_os = "macos")]
fn acquire() -> Option<Hold> {
    std::process::Command::new("/usr/bin/caffeinate")
        .args(["-i", "-w", &std::process::id().to_string()])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()
}

#[cfg(all(unix, not(target_os = "macos")))]
fn acquire() -> Option<Hold> {
    let pid = std::process::id().to_string();
    std::process::Command::new("/usr/bin/systemd-inhibit")
        .args([
            "--what=idle:sleep",
            "--who=Kode",
            "--why=Remote control run in progress",
            "/usr/bin/tail",
            "--pid",
            &pid,
            "-f",
            "/dev/null",
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn SetThreadExecutionState(flags: u32) -> u32;
}

#[cfg(windows)]
fn acquire() -> Option<Hold> {
    const ES_CONTINUOUS: u32 = 0x8000_0000;
    const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    std::thread::spawn(move || {
        // The state belongs to this thread, so it waits here until released.
        unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) };
        let _ = rx.recv();
        unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
    });
    Some(tx)
}

#[cfg(not(windows))]
fn alive(hold: &mut Hold) -> bool {
    matches!(hold.try_wait(), Ok(None))
}

#[cfg(windows)]
fn alive(_hold: &mut Hold) -> bool {
    true
}

#[cfg(not(windows))]
fn release(mut hold: Hold) {
    let _ = hold.kill();
    let _ = hold.wait();
}

#[cfg(windows)]
fn release(hold: Hold) {
    let _ = hold.send(());
}

#[tauri::command]
pub fn kode_keep_awake(on: bool) -> Result<(), String> {
    let mut slot = HOLD.lock().map_err(|e| e.to_string())?;
    if on {
        if let Some(hold) = slot.as_mut() {
            if alive(hold) {
                return Ok(());
            }
        }
        *slot = acquire();
    } else if let Some(hold) = slot.take() {
        release(hold);
    }
    Ok(())
}

#[tauri::command]
pub fn kode_computer_name() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let out = std::process::Command::new("/usr/sbin/scutil")
            .args(["--get", "ComputerName"])
            .stdin(std::process::Stdio::null())
            .output()
            .ok()?;
        let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !name.is_empty() {
            return Some(name);
        }
    }
    #[cfg(windows)]
    {
        if let Ok(name) = std::env::var("COMPUTERNAME") {
            if !name.trim().is_empty() {
                return Some(name.trim().to_string());
            }
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Ok(name) = std::fs::read_to_string("/etc/hostname") {
            if !name.trim().is_empty() {
                return Some(name.trim().to_string());
            }
        }
    }
    None
}
