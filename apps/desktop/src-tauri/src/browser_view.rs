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

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(target))
        .user_agent(CHROME_UA)
        .accept_first_mouse(true)
        .focused(false)
        .on_navigation(|url| allow_http(url))
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
