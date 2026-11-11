// The app's menu bar, on macOS, Windows and Linux.
//
// Items that have a keyboard shortcut in Settings → Keyboard shortcuts use the
// command id ("cmd:app.sidebar"); the web side runs the same handler the
// shortcut does, and keeps the menu's shortcuts in step with the user's own
// (`menu_set_accelerators`). Menu-only actions use "app:…". Zoom and full
// screen are handled here; everything else is sent to the web side as a
// `menu-action` event.

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::menu::{AboutMetadata, Menu, MenuItem, MenuItemBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime, Wry};

const ZOOM_STEPS: [f64; 9] = [0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75];

#[derive(Default)]
pub struct MenuState {
    /// Items that mirror a rebindable shortcut, by command id.
    shortcuts: Mutex<HashMap<String, MenuItem<Wry>>>,
    zoom: Mutex<f64>,
}

/// Command id → default keys, as in kode-keybindings.ts. Items whose shortcut
/// must keep working inside the code editor (Back/Forward: ⌘[ and ⌘] indent
/// there) show no shortcut in the menu, since a menu shortcut would take the
/// key away from the editor.
struct Command {
    id: &'static str,
    label: &'static str,
    keys: Option<&'static str>,
}

const fn cmd(id: &'static str, label: &'static str, keys: Option<&'static str>) -> Command {
    Command { id, label, keys }
}

/// "mod+shift+k" → "CmdOrCtrl+Shift+K" (None when unbound or not parseable).
fn to_accelerator(keys: &str) -> Option<String> {
    let keys = keys.trim();
    if keys.is_empty() {
        return None;
    }
    let parts: Vec<String> = keys
        .split('+')
        .map(|part| match part {
            "mod" => "CmdOrCtrl".to_string(),
            "ctrl" => "Control".to_string(),
            "alt" => "Alt".to_string(),
            "shift" => "Shift".to_string(),
            "space" => "Space".to_string(),
            other => other.to_uppercase(),
        })
        .collect();
    // A trailing "+" key ("mod++") can't be written in this format; skip it.
    if parts.iter().any(|p| p.is_empty()) {
        return None;
    }
    Some(parts.join("+"))
}

fn shortcut_item(app: &AppHandle<Wry>, state: &MenuState, command: &Command) -> tauri::Result<MenuItem<Wry>> {
    let mut builder = MenuItemBuilder::with_id(format!("cmd:{}", command.id), command.label);
    if let Some(accelerator) = command.keys.and_then(to_accelerator) {
        builder = builder.accelerator(accelerator);
    }
    let item = builder.build(app)?;
    if command.keys.is_some() {
        state.shortcuts.lock().unwrap().insert(command.id.to_string(), item.clone());
    }
    Ok(item)
}

fn action<R: Runtime>(app: &AppHandle<R>, id: &str, label: &str, accelerator: Option<&str>) -> tauri::Result<MenuItem<R>> {
    let mut builder = MenuItemBuilder::with_id(format!("app:{id}"), label);
    if let Some(accelerator) = accelerator {
        builder = builder.accelerator(accelerator);
    }
    builder.build(app)
}

pub fn build(app: &AppHandle<Wry>) -> tauri::Result<Menu<Wry>> {
    let state = app.state::<MenuState>();
    *state.zoom.lock().unwrap() = 1.0;
    let mac = cfg!(target_os = "macos");

    let about = PredefinedMenuItem::about(
        app,
        Some("About Kontinue AI"),
        Some(AboutMetadata {
            name: Some("Kontinue AI".into()),
            version: Some(app.package_info().version.to_string()),
            copyright: Some("© Kontinue AI".into()),
            website: Some("https://kontinueai.com".into()),
            website_label: Some("kontinueai.com".into()),
            ..Default::default()
        }),
    )?;
    let check_updates = action(app, "check-updates", "Check for Updates…", None)?;
    let settings = shortcut_item(app, &state, &cmd("app.settings", "Settings…", Some("mod+,")))?;
    let separator = || PredefinedMenuItem::separator(app);

    // macOS: the app menu. Elsewhere these live in File and Help.
    let app_menu: Option<Submenu<Wry>> = if mac {
        Some(
            SubmenuBuilder::new(app, "Kontinue AI")
                .item(&about)
                .item(&check_updates)
                .item(&separator()?)
                .item(&settings)
                .item(&separator()?)
                .item(&PredefinedMenuItem::services(app, None)?)
                .item(&separator()?)
                .item(&PredefinedMenuItem::hide(app, None)?)
                .item(&PredefinedMenuItem::hide_others(app, None)?)
                .item(&PredefinedMenuItem::show_all(app, None)?)
                .item(&separator()?)
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?,
        )
    } else {
        None
    };

    let mut file = SubmenuBuilder::new(app, "File")
        .item(&action(app, "new-chat", "New Chat", Some("CmdOrCtrl+N"))?)
        .item(&shortcut_item(app, &state, &cmd("kode.newChat", "New Kode Chat", Some("mod+shift+o")))?)
        .item(&separator()?)
        .item(&action(app, "open-project", "Open Project…", Some("CmdOrCtrl+O"))?)
        .item(&shortcut_item(app, &state, &cmd("kode.importSession", "Import Coding Session…", Some("mod+shift+i")))?)
        .item(&separator()?)
        .item(&shortcut_item(app, &state, &cmd("kode.reopenTab", "Reopen Closed Tab", Some("mod+shift+t")))?)
        .item(&PredefinedMenuItem::close_window(app, Some("Close Window"))?);
    if !mac {
        file = file
            .item(&separator()?)
            .item(&settings)
            .item(&separator()?)
            .item(&PredefinedMenuItem::quit(app, Some(if cfg!(windows) { "Exit" } else { "Quit" }))?);
    }
    let file = file.build()?;

    // The web view handles copy and paste itself on Windows and Linux; native
    // Edit items there would take Ctrl+C/V away from it. macOS needs them.
    let edit = if mac {
        Some(
            SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .item(&separator()?)
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?,
        )
    } else {
        None
    };

    let theme = SubmenuBuilder::new(app, "Theme")
        .item(&action(app, "theme-system", "System", None)?)
        .item(&action(app, "theme-light", "Light", None)?)
        .item(&action(app, "theme-dark", "Dark", None)?)
        .item(&separator()?)
        .item(&shortcut_item(app, &state, &cmd("appearance.cycle", "Cycle Theme", Some("mod+alt+shift+a")))?)
        .build()?;
    let mut view = SubmenuBuilder::new(app, "View")
        .item(&shortcut_item(app, &state, &cmd("app.commandPalette", "Command Palette…", Some("mod+k")))?)
        .item(&separator()?)
        .item(&shortcut_item(app, &state, &cmd("app.sidebar", "Toggle Sidebar", Some("mod+b")))?)
        .item(&shortcut_item(app, &state, &cmd("app.panel", "Toggle Workspace Panel", Some("mod+j")))?)
        .item(&separator()?)
        .item(&shortcut_item(app, &state, &cmd("nav.back", "Back", None))?)
        .item(&shortcut_item(app, &state, &cmd("nav.forward", "Forward", None))?)
        .item(&separator()?)
        .item(&theme)
        .item(&separator()?)
        .item(&action(app, "zoom-in", "Zoom In", Some("CmdOrCtrl+="))?)
        .item(&action(app, "zoom-out", "Zoom Out", Some("CmdOrCtrl+-"))?)
        .item(&action(app, "zoom-reset", "Actual Size", Some("CmdOrCtrl+0"))?)
        .item(&separator()?);
    view = if mac {
        view.item(&PredefinedMenuItem::fullscreen(app, None)?)
    } else {
        view.item(&action(app, "fullscreen", "Toggle Full Screen", Some("F11"))?)
    };
    let view = view.build()?;

    let threads = SubmenuBuilder::new(app, "Threads")
        .item(&shortcut_item(app, &state, &cmd("thread.next", "Next Thread", Some("mod+shift+]")))?)
        .item(&shortcut_item(app, &state, &cmd("thread.previous", "Previous Thread", Some("mod+shift+[")))?)
        .item(&separator()?)
        .item(&shortcut_item(app, &state, &cmd("thread.pin", "Pin or Unpin Thread", Some("mod+shift+p")))?)
        .item(&separator()?)
        .item(&shortcut_item(app, &state, &cmd("composer.modelPicker", "Choose Model…", Some("mod+shift+m")))?)
        .item(&shortcut_item(app, &state, &cmd("usage.open", "Usage", Some("mod+u")))?)
        .build()?;

    let mut window = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, Some(if mac { "Zoom" } else { "Maximize" }))?);
    if mac {
        window = window.item(&separator()?).item(&PredefinedMenuItem::bring_all_to_front(app, None)?);
    }
    let window = window.build()?;

    let mut help = SubmenuBuilder::new(app, "Help")
        .item(&action(app, "help", "Kontinue Help", None)?)
        .item(&action(app, "shortcuts", "Keyboard Shortcuts", None)?)
        .item(&action(app, "whats-new", "What's New", None)?)
        .item(&separator()?)
        .item(&action(app, "report", "Report a Problem…", None)?);
    if !mac {
        help = help.item(&separator()?).item(&check_updates).item(&about);
    }
    let help = help.build()?;

    let mut menu = tauri::menu::MenuBuilder::new(app);
    if let Some(app_menu) = &app_menu {
        menu = menu.item(app_menu);
    }
    menu = menu.item(&file);
    if let Some(edit) = &edit {
        menu = menu.item(edit);
    }
    menu.item(&view).item(&threads).item(&window).item(&help).build()
}

fn set_zoom(app: &AppHandle, next: impl FnOnce(f64) -> f64) {
    let state = app.state::<MenuState>();
    let mut zoom = state.zoom.lock().unwrap();
    *zoom = next(*zoom);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_zoom(*zoom);
    }
}

pub fn handle_event(app: &AppHandle, id: &str) {
    match id {
        "app:zoom-in" => set_zoom(app, |z| ZOOM_STEPS.iter().copied().find(|s| *s > z + 0.001).unwrap_or(z)),
        "app:zoom-out" => set_zoom(app, |z| ZOOM_STEPS.iter().rev().copied().find(|s| *s < z - 0.001).unwrap_or(z)),
        "app:zoom-reset" => set_zoom(app, |_| 1.0),
        "app:fullscreen" => {
            if let Some(window) = app.get_webview_window("main") {
                let full = window.is_fullscreen().unwrap_or(false);
                let _ = window.set_fullscreen(!full);
            }
        }
        _ if id.starts_with("cmd:") || id.starts_with("app:") => {
            let _ = app.emit("menu-action", id.to_string());
        }
        _ => {}
    }
}

/// Keeps menu shortcuts matching Settings → Keyboard shortcuts.
/// `bindings`: command id → keys ("" when unbound).
#[tauri::command]
pub fn menu_set_accelerators(app: AppHandle, bindings: HashMap<String, String>) -> Result<(), String> {
    let state = app.state::<MenuState>();
    let items = state.shortcuts.lock().unwrap();
    for (id, item) in items.iter() {
        if let Some(keys) = bindings.get(id) {
            let _ = item.set_accelerator(to_accelerator(keys));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::to_accelerator;

    #[test]
    fn converts_bindings() {
        assert_eq!(to_accelerator("mod+shift+k").as_deref(), Some("CmdOrCtrl+Shift+K"));
        assert_eq!(to_accelerator("mod+,").as_deref(), Some("CmdOrCtrl+,"));
        assert_eq!(to_accelerator("mod+shift+]").as_deref(), Some("CmdOrCtrl+Shift+]"));
        assert_eq!(to_accelerator("ctrl+alt+space").as_deref(), Some("Control+Alt+Space"));
        assert_eq!(to_accelerator(""), None);
    }
}
