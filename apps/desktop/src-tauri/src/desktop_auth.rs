use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::thread;
use std::time::Duration;

use tauri::{Emitter, Manager};

const MAX_REQUEST_BYTES: usize = 64 * 1024;

/// Listens on 127.0.0.1 for the browser handoff and brings the desktop window forward.
pub fn start(app: tauri::AppHandle) -> Result<u16, String> {
    let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
        .map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();

    thread::spawn(move || {
        for connection in listener.incoming() {
            let Ok(mut stream) = connection else { continue };
            let Some(target) = read_request_target(&mut stream) else {
                let _ = write_html(&mut stream, "400 Bad Request", "<p>Invalid request.</p>");
                continue;
            };
            if !is_callback_target(&target) {
                let _ = write_html(&mut stream, "404 Not Found", "");
                continue;
            }

            let callback = format!("http://127.0.0.1:{port}{target}");
            let _ = app.emit("oauth://callback", &callback);
            let _ = write_html(&mut stream, "200 OK", &success_page(&target));
            // The browser paints this page after the response, so focus again
            // once that navigation has had a chance to start.
            bring_to_front(&app);
            let later = app.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(600));
                bring_to_front(&later);
            });
            break;
        }
    });

    Ok(port)
}

fn bring_to_front(app: &tauri::AppHandle) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
        #[cfg(target_os = "macos")]
        focus_macos_app();
    });
}

#[cfg(target_os = "macos")]
fn focus_macos_app() {
    use objc2_app_kit::NSApplication;
    use objc2_foundation::MainThreadMarker;

    if let Some(marker) = MainThreadMarker::new() {
        // The browser is the active app. Ask macOS to activate this process anyway.
        #[allow(deprecated)]
        NSApplication::sharedApplication(marker).activateIgnoringOtherApps(true);
    }
}

fn read_request_target(stream: &mut TcpStream) -> Option<String> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 4096];
    while buffer.len() < MAX_REQUEST_BYTES {
        let read = stream.read(&mut chunk).ok()?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
    }
    request_target(&buffer)
}

pub(crate) fn request_target(buffer: &[u8]) -> Option<String> {
    let header_end = buffer.windows(4).position(|window| window == b"\r\n\r\n")?;
    let headers = std::str::from_utf8(&buffer[..header_end]).ok()?;
    let request_line = headers.lines().next()?.trim();
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?;
    let target = parts.next()?;
    if method != "GET" || !target.starts_with('/') {
        return None;
    }
    Some(target.to_string())
}

pub(crate) fn is_callback_target(target: &str) -> bool {
    let Some((_, query_and_hash)) = target.split_once('?') else {
        return false;
    };
    let query = query_and_hash.split('#').next().unwrap_or("");
    let mut ticket = false;
    let mut state = false;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if value.is_empty() {
            continue;
        }
        match key {
            "ticket" => ticket = true,
            "state" => {
                state = value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
            }
            _ => {}
        }
    }
    ticket && state
}

fn success_page(target: &str) -> String {
    let query = target.split_once('?').map(|(_, query)| query).unwrap_or("");
    let deep_link = format!("kontinueai://auth/callback?{query}");
    let href = html_escape(&deep_link);
    // Script text does not decode HTML entities, so `&amp;` would break the query.
    let script_url = javascript_string(&deep_link);
    format!(
        r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Returning to Kontinue AI</title>
  <meta http-equiv="refresh" content="0;url={href}">
  <style>
    body {{
      background: #0d0d0e;
      color: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }}
    .card {{
      text-align: center;
      padding: 32px 40px;
      border-radius: 16px;
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      max-width: 380px;
    }}
    h1 {{ font-size: 20px; margin: 0 0 8px; }}
    p {{ font-size: 13px; color: rgba(255, 255, 255, 0.65); line-height: 1.5; }}
    a {{ color: #fff; }}
  </style>
</head>
<body>
  <div class="card">
    <h1>Returning to Kontinue AI</h1>
    <p>If the app did not come forward, <a href="{href}">open Kontinue AI</a>.</p>
  </div>
  <script>location.replace("{script_url}");</script>
</body>
</html>"#
    )
}

fn javascript_string(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '<' => escaped.push_str("\\u003c"),
            '&' => escaped.push_str("\\u0026"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn write_html(stream: &mut TcpStream, status: &str, body: &str) -> std::io::Result<()> {
    let payload = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(payload.as_bytes())?;
    stream.flush()
}

#[cfg(test)]
mod tests {
    use super::{is_callback_target, request_target};

    #[test]
    fn reads_the_callback_from_the_first_request() {
        let state = "ab".repeat(32);
        let raw = format!("GET /?ticket=abc.def&state={state} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
        let target = request_target(raw.as_bytes()).unwrap();
        assert!(is_callback_target(&target));
        assert!(!is_callback_target("/favicon.ico"));
        assert!(!is_callback_target("/?ticket=abc.def&state=short"));
    }

    #[test]
    fn success_page_keeps_the_query_separator_in_javascript() {
        let page = super::success_page("/?ticket=abc.def&state=abcd");
        assert!(page.contains(
            r#"location.replace("kontinueai://auth/callback?ticket=abc.def\u0026state=abcd")"#
        ));
        assert!(page.contains("href=\"kontinueai://auth/callback?ticket=abc.def&amp;state=abcd\""));
    }
}
