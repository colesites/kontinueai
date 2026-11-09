// Snapshots: a screenshot plus the frontmost app's accessibility tree, so an
// agent can start a new thread with "what's on screen" as text and image.
//
// macOS only for now (screencapture + System Events via JXA). macOS asks for
// Screen Recording and Accessibility access the first time; when either is
// missing the snapshot still returns what it could get, plus a note.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// PNG as base64 (no data: prefix), when screen capture worked.
    image: Option<String>,
    app: Option<String>,
    window: Option<String>,
    /// Indented outline of the accessibility tree.
    tree: String,
    notes: Vec<String>,
    taken_at: i64,
}

const AX_SCRIPT: &str = r#"
const se = Application('System Events');
const proc = se.processes.whose({ frontmost: true })[0];
let count = 0;
function walk(el, depth) {
  if (count > 400 || depth > 6) return null;
  count++;
  const node = {};
  try { node.role = el.role(); } catch (e) {}
  try { node.name = el.name(); } catch (e) {}
  try { const v = el.value(); if (v !== null && typeof v !== 'object') node.value = String(v).slice(0, 200); } catch (e) {}
  try { node.description = el.description(); } catch (e) {}
  const kids = [];
  try { for (const child of el.uiElements()) { const k = walk(child, depth + 1); if (k) kids.push(k); } } catch (e) {}
  if (kids.length) node.children = kids;
  return node;
}
const out = { app: proc.name(), windows: [] };
try { for (const w of proc.windows().slice(0, 2)) out.windows.push(walk(w, 0)); } catch (e) { out.error = String(e); }
JSON.stringify(out);
"#;

/// Accessibility JSON → indented text, skipping empty containers.
pub(crate) fn format_tree(node: &Value, depth: usize, out: &mut String) {
    let role = node.get("role").and_then(Value::as_str).unwrap_or("");
    let label: Vec<String> = ["name", "value", "description"]
        .iter()
        .filter_map(|key| node.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "missing value")
        .map(|s| format!("\"{}\"", s.replace('\n', " ")))
        .collect();
    let children = node.get("children").and_then(Value::as_array);
    let next_depth = if label.is_empty() && matches!(role, "AXGroup" | "AXUnknown" | "AXSplitGroup" | "AXScrollArea" | "") {
        depth // flatten anonymous containers
    } else {
        out.push_str(&"  ".repeat(depth));
        out.push_str(role.trim_start_matches("AX"));
        if !label.is_empty() {
            out.push(' ');
            out.push_str(&label.join(" "));
        }
        out.push('\n');
        depth + 1
    };
    for child in children.into_iter().flatten() {
        format_tree(child, next_depth, out);
    }
}

#[cfg(target_os = "macos")]
fn capture(delay_ms: u64) -> Snapshot {
    use base64::Engine;
    use std::process::Command;
    std::thread::sleep(std::time::Duration::from_millis(delay_ms.min(10_000)));
    let mut snapshot = Snapshot {
        taken_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0),
        ..Default::default()
    };

    let ax = Command::new("osascript").args(["-l", "JavaScript", "-e", AX_SCRIPT]).output();
    match ax {
        Ok(output) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Ok(value) = serde_json::from_str::<Value>(text.trim()) {
                snapshot.app = value.get("app").and_then(Value::as_str).map(str::to_string);
                let windows = value.get("windows").and_then(Value::as_array).cloned().unwrap_or_default();
                snapshot.window = windows.first().and_then(|w| w.get("name")).and_then(Value::as_str).map(str::to_string);
                for window in &windows {
                    format_tree(window, 0, &mut snapshot.tree);
                }
                if let Some(error) = value.get("error").and_then(Value::as_str) {
                    snapshot.notes.push(format!("Accessibility: {error}"));
                }
            }
        }
        _ => snapshot.notes.push(
            "Accessibility access is off. Allow Kontinue in System Settings → Privacy & Security → Accessibility.".into(),
        ),
    }

    let path = std::env::temp_dir().join(format!("kode-snapshot-{}.png", snapshot.taken_at));
    let shot = Command::new("screencapture").args(["-x", "-t", "png"]).arg(&path).status();
    match (shot, std::fs::read(&path)) {
        (Ok(status), Ok(bytes)) if status.success() && !bytes.is_empty() => {
            snapshot.image = Some(base64::engine::general_purpose::STANDARD.encode(bytes));
        }
        _ => snapshot.notes.push(
            "Screen capture failed. Allow Kontinue in System Settings → Privacy & Security → Screen Recording.".into(),
        ),
    }
    let _ = std::fs::remove_file(&path);
    if snapshot.tree.len() > 40_000 {
        snapshot.tree.truncate(40_000);
        snapshot.tree.push_str("\n…");
    }
    snapshot
}

#[cfg(not(target_os = "macos"))]
fn capture(_delay_ms: u64) -> Snapshot {
    Snapshot { notes: vec!["Snapshots are only available on macOS for now.".into()], ..Default::default() }
}

#[tauri::command]
pub async fn kode_capture_snapshot(delay_ms: Option<u64>) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || capture(delay_ms.unwrap_or(0)))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn formats_accessibility_tree() {
        let tree = json!({ "role": "AXWindow", "name": "Inbox", "children": [
            { "role": "AXGroup", "children": [
                { "role": "AXButton", "name": "Send" },
                { "role": "AXTextField", "value": "hello\nworld" }
            ]}
        ]});
        let mut out = String::new();
        format_tree(&tree, 0, &mut out);
        assert_eq!(out, "Window \"Inbox\"\n  Button \"Send\"\n  TextField \"hello world\"\n");
    }
}
