// A real browser surface for the in-app browser tab.
//
// An iframe cannot show google.com: Google refuses to be framed, and the only
// page that allows it (`igu=1`) is a light, reduced results page. A child
// webview is a real WKWebView, so it loads the normal results page and follows
// the window appearance for dark mode.

use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewUrl,
};
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder};

const CHROME_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

#[derive(Clone, serde::Serialize)]
struct BrowserNavigated {
    label: String,
    url: String,
}

fn valid_label(label: &str) -> Result<(), String> {
    if label.starts_with("browser-")
        && label.len() <= 80
        && label
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        Ok(())
    } else {
        Err("Invalid browser view.".into())
    }
}

fn http_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|error| error.to_string())?;
    if matches!(url.scheme(), "http" | "https") {
        Ok(url)
    } else {
        Err("Only web pages can be opened here.".into())
    }
}

fn allow_http(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
}

// ---------------------------------------------------------------------------
// Annotating an element in the preview
// ---------------------------------------------------------------------------
//
// The page has no access to the app, so the injected picker reports the click
// by navigating to `kontinue-annotate://pick?d=<json>`. on_navigation catches
// that URL, blocks it, and emits `browser-annotation` to the app.

const ANNOTATE_SCHEME: &str = "kontinue-annotate";

#[derive(Clone, serde::Serialize)]
struct BrowserAnnotation {
    label: String,
    /// JSON from the picker, or None when the user cancelled (Esc).
    data: Option<String>,
}

/// Handle a picker URL. Returns true when `url` was one (and must be blocked).
fn handle_annotate_url(app: &AppHandle, label: &str, url: &Url) -> bool {
    if url.scheme() != ANNOTATE_SCHEME {
        return false;
    }
    let data = url
        .query_pairs()
        .find(|(key, _)| key == "d")
        .map(|(_, value)| value.into_owned())
        .filter(|value| value.len() <= 16_000);
    let _ = app.emit(
        "browser-annotation",
        BrowserAnnotation { label: label.to_string(), data },
    );
    true
}

const PICKER_ON: &str = r#"(() => {
  if (window.__kontinuePicker) return;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #a855f7;background:rgba(168,85,247,.12);border-radius:4px;transition:all .05s;display:none';
  document.documentElement.appendChild(box);
  const cssPath = (el) => {
    const parts = [];
    while (el && el.nodeType === 1 && parts.length < 6) {
      let part = el.tagName.toLowerCase();
      if (el.id) { parts.unshift(part + '#' + CSS.escape(el.id)); break; }
      const cls = [...el.classList].filter(c => !/[:\[\]]/.test(c)).slice(0, 2);
      if (cls.length) part += '.' + cls.map(c => CSS.escape(c)).join('.');
      const parent = el.parentElement;
      if (parent) {
        const same = [...parent.children].filter(c => c.tagName === el.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
      }
      parts.unshift(part);
      el = parent;
    }
    return parts.join(' > ');
  };
  const send = (data) => {
    stop();
    location.href = 'kontinue-annotate://pick?d=' + encodeURIComponent(data ? JSON.stringify(data) : '');
  };
  const over = (e) => {
    const r = e.target.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  };
  const click = (e) => {
    e.preventDefault(); e.stopPropagation();
    const el = e.target;
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const tag = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ([...el.classList].slice(0, 2).map(c => '.' + c).join(''));
    send({ url: location.href, selector: cssPath(el), label: text ? tag + ' "' + text + '"' : tag, html: el.outerHTML.slice(0, 1200) });
  };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); send(null); } };
  const stop = () => {
    document.removeEventListener('mouseover', over, true);
    document.removeEventListener('click', click, true);
    document.removeEventListener('keydown', key, true);
    box.remove();
    document.documentElement.style.cursor = '';
    window.__kontinuePicker = null;
  };
  document.addEventListener('mouseover', over, true);
  document.addEventListener('click', click, true);
  document.addEventListener('keydown', key, true);
  document.documentElement.style.cursor = 'crosshair';
  window.__kontinuePicker = { stop };
})();"#;

const PICKER_OFF: &str = "window.__kontinuePicker && window.__kontinuePicker.stop();";

/// Turn the element picker on or off in a browser view.
#[tauri::command]
pub fn browser_annotate(app: AppHandle, label: String, active: bool) -> Result<(), String> {
    valid_label(&label)?;
    let view = app
        .get_webview(&label)
        .ok_or_else(|| "Open a page first.".to_string())?;
    if active {
        let _ = view.set_focus();
    }
    view.eval(if active { PICKER_ON } else { PICKER_OFF })
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn apply_appearance(view: &Webview, dark: bool) {
    use objc2_app_kit::{
        NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua, NSAppearanceNameDarkAqua,
        NSView,
    };

    let _ = view.with_webview(move |platform| unsafe {
        let ptr = platform.inner() as *mut NSView;
        if ptr.is_null() {
            return;
        }
        let native = &*ptr;
        let name = if dark {
            NSAppearanceNameDarkAqua
        } else {
            NSAppearanceNameAqua
        };
        if let Some(appearance) = NSAppearance::appearanceNamed(name) {
            native.setAppearance(Some(&appearance));
        }
    });
}

#[cfg(not(target_os = "macos"))]
fn apply_appearance(_view: &Webview, _dark: bool) {}

fn place_existing(view: &Webview, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    view.set_position(LogicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    view.set_size(LogicalSize::new(width, height))
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn browser_place(
    app: AppHandle,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    navigate: bool,
    dark: bool,
) -> Result<(), String> {
    valid_label(&label)?;
    if width < 2.0 || height < 2.0 {
        if let Some(view) = app.get_webview(&label) {
            let _ = view.hide();
        }
        return Ok(());
    }
    let target = http_url(&url)?;

    if let Some(view) = app.get_webview(&label) {
        place_existing(&view, x, y, width, height)?;
        apply_appearance(&view, dark);
        if navigate {
            view.navigate(target).map_err(|error| error.to_string())?;
        }
        view.show().map_err(|error| error.to_string())?;
        return Ok(());
    }

    // Once any child webview exists, Tauri no longer reports this window from
    // get_webview_window. The window itself is still registered as "main".
    let window = app
        .get_window("main")
        .ok_or_else(|| "The main window is not open.".to_string())?;
    let app_for_load = app.clone();
    let label_for_load = label.clone();
    let app_for_window = app.clone();
    let label_for_window = label.clone();
    let app_for_nav = app.clone();
    let label_for_nav = label.clone();

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(target))
        .user_agent(CHROME_UA)
        .accept_first_mouse(true)
        .focused(false)
        .on_navigation(move |url| {
            if handle_annotate_url(&app_for_nav, &label_for_nav, url) {
                return false;
            }
            allow_http(url)
        })
        .on_new_window(move |url, _features| {
            if allow_http(&url) {
                if let Some(view) = app_for_window.get_webview(&label_for_window) {
                    let _ = view.navigate(url);
                }
            }
            NewWindowResponse::Deny
        })
        .on_page_load(move |_view, payload| {
            if payload.event() != PageLoadEvent::Finished || !allow_http(payload.url()) {
                return;
            }
            let _ = app_for_load.emit(
                "browser-navigated",
                BrowserNavigated {
                    label: label_for_load.clone(),
                    url: payload.url().to_string(),
                },
            );
        });

    let view = window
        .add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width, height),
        )
        .map_err(|error| error.to_string())?;
    // The first load can start before the view appearance is set, so reload
    // once the dark or light appearance is in place.
    apply_appearance(&view, dark);
    view.reload().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn browser_hide(app: AppHandle, label: String) -> Result<(), String> {
    valid_label(&label)?;
    if let Some(view) = app.get_webview(&label) {
        view.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_close(app: AppHandle, label: String) -> Result<(), String> {
    valid_label(&label)?;
    if let Some(view) = app.get_webview(&label) {
        view.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_reload(app: AppHandle, label: String, dark: bool) -> Result<(), String> {
    valid_label(&label)?;
    if let Some(view) = app.get_webview(&label) {
        apply_appearance(&view, dark);
        view.reload().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_go(app: AppHandle, label: String, back: bool) -> Result<(), String> {
    valid_label(&label)?;
    if let Some(view) = app.get_webview(&label) {
        let script = if back { "history.back()" } else { "history.forward()" };
        view.eval(script).map_err(|error| error.to_string())?;
    }
    Ok(())
}
