//! Web permission requests (microphone, camera, location, notifications).
//!
//! Without this, the web view asks again every time the page asks (dictation
//! prompted on each use). The operating system still asks once for the app
//! itself (macOS privacy prompts), so the person stays in control there.
//!
//! - The app's own pages: allowed.
//! - The built-in browser on a local dev site (localhost, 127.0.0.1, *.localhost,
//!   *.test, files): allowed, so apps people build that need the microphone or
//!   location just work.
//! - Any other website in the built-in browser: the web view's normal prompt.

use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::{Runtime, Webview};

fn is_local_dev(url: &tauri::Url) -> bool {
    match url.scheme() {
        "file" | "tauri" | "asset" => return true,
        "http" | "https" => {}
        _ => return false,
    }
    match url.host_str() {
        Some(host) => {
            let host = host.trim_start_matches('[').trim_end_matches(']');
            host == "localhost"
                || host == "127.0.0.1"
                || host == "::1"
                || host == "0.0.0.0"
                || host.ends_with(".localhost")
                || host.ends_with(".test")
        }
        None => false,
    }
}

fn wanted(kind: PermissionKind) -> bool {
    matches!(
        kind,
        PermissionKind::Microphone
            | PermissionKind::Camera
            | PermissionKind::Geolocation
            | PermissionKind::Notifications
            | PermissionKind::ClipboardRead
    )
}

pub fn decide<R: Runtime>(webview: Webview<R>, kind: PermissionKind) -> PermissionResponse {
    if !wanted(kind) {
        return PermissionResponse::Default;
    }
    let browser = webview.label().starts_with("browser-");
    if !browser {
        return PermissionResponse::Allow;
    }
    match webview.url() {
        Ok(url) if is_local_dev(&url) => PermissionResponse::Allow,
        _ => PermissionResponse::Default,
    }
}

#[cfg(test)]
mod tests {
    use super::is_local_dev;

    fn local(raw: &str) -> bool {
        is_local_dev(&tauri::Url::parse(raw).unwrap())
    }

    #[test]
    fn local_dev_sites() {
        assert!(local("http://localhost:3000/map"));
        assert!(local("http://127.0.0.1:5173"));
        assert!(local("http://[::1]:8080"));
        assert!(local("https://myapp.localhost"));
        assert!(local("http://shop.test"));
        assert!(local("file:///Users/me/site/index.html"));
    }

    #[test]
    fn other_sites_are_not_local() {
        assert!(!local("https://example.com"));
        assert!(!local("https://localhost.evil.com"));
        assert!(!local("https://test.example.com"));
        assert!(!local("data:text/html,hi"));
    }
}
