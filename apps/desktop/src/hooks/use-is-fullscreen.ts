import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

/**
 * True only when the native window is in macOS fullscreen. The traffic lights
 * are hidden then; otherwise they overlay the top-left of the app and the
 * sidebar controls need to sit to their right.
 */
export function useIsFullscreen(): boolean {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const window = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    void window
      .isFullscreen()
      .then(setIsFullscreen)
      .catch(() => undefined);

    void window
      .onResized(async () => {
        try {
          setIsFullscreen(await window.isFullscreen());
        } catch {
          // Ignore window API failures (e.g. browser-only dev mode).
        }
      })
      .then((cleanup) => {
        unlisten = cleanup;
      })
      .catch(() => undefined);

    return () => unlisten?.();
  }, []);

  return isFullscreen;
}
