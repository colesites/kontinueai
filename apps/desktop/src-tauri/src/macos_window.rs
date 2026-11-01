// macOS-only window chrome tuning.
//
// Tauri's `trafficLightPosition` only moves the whole traffic-light group. The
// system spacing between the close/minimize/zoom buttons is fixed, so we set
// the individual button origins here to match the sidebar icon spacing.

#[cfg(target_os = "macos")]
pub fn apply_traffic_light_spacing(
    window: &tauri::WebviewWindow,
    spacing: f64,
) -> Result<(), String> {
    use objc2_app_kit::{NSWindow, NSWindowButton};

    let ns_window = window
        .ns_window()
        .map_err(|error| format!("Could not access the native window: {error}"))?
        as *mut NSWindow;
    if ns_window.is_null() {
        return Err("The native window is not available yet.".to_string());
    }

    // SAFETY: `ns_window` comes from Tauri and points at the live NSWindow for
    // the lifetime of this call. The button frames are only adjusted after the
    // window has been created.
    unsafe {
        let ns_window = &*ns_window;
        let close = ns_window
            .standardWindowButton(NSWindowButton::CloseButton)
            .ok_or_else(|| "Close button unavailable.".to_string())?;
        let minimize = ns_window
            .standardWindowButton(NSWindowButton::MiniaturizeButton)
            .ok_or_else(|| "Minimize button unavailable.".to_string())?;
        let zoom = ns_window.standardWindowButton(NSWindowButton::ZoomButton);

        let base = close.frame().origin;
        close.setFrameOrigin(base);
        minimize.setFrameOrigin(objc2_foundation::NSPoint {
            x: base.x + spacing,
            y: base.y,
        });
        if let Some(zoom) = zoom {
            zoom.setFrameOrigin(objc2_foundation::NSPoint {
                x: base.x + spacing * 2.0,
                y: base.y,
            });
        }
    }

    Ok(())
}
