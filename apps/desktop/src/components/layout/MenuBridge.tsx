// Runs what's picked in the menu bar (src-tauri/src/menu.rs). Items with a
// keyboard shortcut run the same handler the shortcut does; the menu also
// shows the user's own shortcuts from Settings → Keyboard shortcuts.

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTheme } from "@/components/theme/theme-provider";
import {
  onKeybindingsPaused,
  ranFromKeyboard,
  resolveBindings,
  runCommand,
  subscribeBindings,
} from "@/lib/kode-keybindings";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { checkForUpdates } from "@/lib/updater";

const HELP_URL = "https://kontinueai.com";
const RELEASES_URL = "https://github.com/colesites/kontinueai/releases";
const SUPPORT_URL = "mailto:support@kontinueai.com?subject=Kontinue%20AI%20desktop";

/** Wait for React to render a tab switch before running something that depends on it. */
const afterRender = (run: () => void) => requestAnimationFrame(() => requestAnimationFrame(run));

function syncAccelerators(paused = false) {
  const bindings = resolveBindings();
  if (paused) for (const id of Object.keys(bindings)) bindings[id] = "";
  void invoke("menu_set_accelerators", { bindings }).catch(() => {});
}

export function MenuBridge() {
  const workspace = useKodeWorkspace();
  const { setTheme } = useTheme();
  // The listener is set up once; read the latest workspace through a ref.
  const latest = useRef({ workspace, setTheme });
  latest.current = { workspace, setTheme };

  useEffect(() => {
    syncAccelerators();
    const offBindings = subscribeBindings(() => syncAccelerators());
    const offPaused = onKeybindingsPaused((paused) => syncAccelerators(paused));
    return () => {
      offBindings();
      offPaused();
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("menu-action", ({ payload: id }) => {
      const { workspace: ws, setTheme: applyTheme } = latest.current;

      if (id.startsWith("cmd:")) {
        const command = id.slice(4);
        // Some systems deliver a shortcut to both the page and the menu.
        if (ranFromKeyboard(command)) return;
        if (command === "kode.newChat" || command === "kode.importSession" || command === "kode.reopenTab") {
          if (ws.activeTab !== "kode") {
            ws.setActiveTab("kode");
            afterRender(() => runCommand(command));
            return;
          }
        }
        // The shortcut toggles settings; the menu item only opens them.
        if (command === "app.settings" && ws.isSettingsOpen) return;
        runCommand(command);
        return;
      }

      switch (id) {
        case "app:new-chat":
          if (ws.activeTab === "home") ws.newChat();
          else {
            ws.setActiveTab("home");
            afterRender(() => latest.current.workspace.newChat());
          }
          break;
        case "app:open-project":
          ws.setActiveTab("kode");
          void ws.importFolder();
          break;
        case "app:theme-system":
          applyTheme("system");
          break;
        case "app:theme-light":
          applyTheme("light");
          break;
        case "app:theme-dark":
          applyTheme("dark");
          break;
        case "app:check-updates":
          void checkForUpdates({ interactive: true });
          break;
        case "app:shortcuts":
          ws.openSettings("shortcuts");
          break;
        case "app:help":
          void openUrl(HELP_URL);
          break;
        case "app:whats-new":
          void openUrl(RELEASES_URL);
          break;
        case "app:report":
          void openUrl(SUPPORT_URL);
          break;
      }
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  return null;
}
