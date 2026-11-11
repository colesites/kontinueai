// ⌘K: one search box for every action, settings page, project and chat.
// Actions come from the shortcut registry (kode-keybindings), so anything
// with a shortcut also shows here, with its keys.

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Command,
  FolderOpen,
  Home,
  Laptop,
  ListTodo,
  MessageSquare,
  Moon,
  Palette,
  Search,
  Sparkles,
  Sun,
  TerminalSquare,
} from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { SETTINGS_PAGES } from "@/components/settings/SettingsView";
import { Keys } from "@/components/settings/settings-ui";
import { useAppSettings } from "@/lib/app-settings";
import {
  formatKeys,
  hasCommandHandler,
  KEYBINDING_COMMANDS,
  pauseKeybindings,
  runCommand,
  useBindings,
  useKeybinding,
} from "@/lib/kode-keybindings";
import { orderProjects } from "@/lib/kode-project-order";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  section: string;
  label: string;
  hint?: string;
  keywords?: string;
  keys?: string[];
  icon: ComponentType<{ size?: number; className?: string }>;
  run: () => void;
};

const SKIP_COMMANDS = new Set(["app.commandPalette"]);
const MAX_PER_SECTION = 8;

/** Every word of the query appears somewhere in the text. */
function matches(text: string, query: string): boolean {
  const hay = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  useKeybinding("app.commandPalette", () => setOpen((v) => !v));
  return open ? <Palette_ onClose={() => setOpen(false)} /> : null;
}

function Palette_({ onClose }: { onClose: () => void }) {
  const { setTheme } = useTheme();
  const { projectOrder } = useAppSettings();
  const bindings = useBindings();
  const { activeTab, setActiveTab, chats, kodeChats, projects, folders, selectChat, newChat, openSettings } =
    useKodeWorkspace();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Don't let app shortcuts fire while typing here.
  useEffect(() => {
    pauseKeybindings(true);
    return () => pauseKeybindings(false);
  }, []);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];

    for (const command of KEYBINDING_COMMANDS) {
      if (SKIP_COMMANDS.has(command.id) || command.id.startsWith("thread.jump")) continue;
      if (!hasCommandHandler(command.id)) continue;
      out.push({
        id: `cmd:${command.id}`,
        section: "Actions",
        label: command.label,
        hint: command.group,
        keys: bindings[command.id] ? formatKeys(bindings[command.id]) : undefined,
        icon: Command,
        run: () => runCommand(command.id),
      });
    }

    const tabs = [
      { tab: "home" as const, label: "Go to Chat", icon: Home },
      { tab: "kode" as const, label: "Go to Kode", icon: TerminalSquare },
      { tab: "canvas" as const, label: "Go to Canvas", icon: Sparkles },
      { tab: "tasks" as const, label: "Go to Tasks", icon: ListTodo },
    ];
    for (const t of tabs) {
      if (t.tab === activeTab) continue;
      out.push({ id: `tab:${t.tab}`, section: "Actions", label: t.label, icon: t.icon, run: () => setActiveTab(t.tab) });
    }

    for (const theme of [
      { value: "system" as const, label: "Use system theme", icon: Laptop },
      { value: "light" as const, label: "Use light theme", icon: Sun },
      { value: "dark" as const, label: "Use dark theme", icon: Moon },
    ]) {
      out.push({ id: `theme:${theme.value}`, section: "Theme", label: theme.label, keywords: "appearance", icon: theme.icon, run: () => setTheme(theme.value) });
    }

    for (const page of SETTINGS_PAGES) {
      out.push({
        id: `settings:${page.id}`,
        section: "Settings",
        label: `Settings: ${page.label}`,
        keywords: page.keywords,
        icon: page.icon,
        run: () => openSettings(page.id),
      });
    }

    const kodeProjects =
      activeTab === "kode"
        ? orderProjects(projects, kodeChats, projectOrder)
        : folders.map((f) => ({ id: f.id, name: f.name, path: f.path, hue: "" }));
    for (const project of kodeProjects) {
      out.push({
        id: `project:${project.id}`,
        section: "Projects",
        label: `New thread in ${project.name}`,
        hint: project.path.replace(/^\/Users\/[^/]+/, "~"),
        icon: FolderOpen,
        run: () => {
          setActiveTab("kode");
          newChat(project.id);
        },
      });
    }

    const recent = (list: typeof kodeChats) => [...list].filter((c) => !c.archived).sort((a, b) => b.updatedAt - a.updatedAt);
    const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name;
    for (const chat of recent(kodeChats)) {
      out.push({
        id: `kode:${chat.id}`,
        section: "Kode threads",
        label: chat.title || "Untitled",
        hint: folderName(chat.projectId),
        icon: TerminalSquare,
        run: () => {
          setActiveTab("kode");
          selectChat(chat.id);
        },
      });
    }
    if (activeTab !== "kode") {
      for (const chat of recent(chats)) {
        out.push({
          id: `chat:${chat.id}`,
          section: "Chats",
          label: chat.title || "Untitled",
          icon: MessageSquare,
          run: () => selectChat(chat.id),
        });
      }
    }
    return out;
  }, [activeTab, bindings, chats, folders, kodeChats, newChat, openSettings, projectOrder, projects, selectChat, setActiveTab, setTheme]);

  const visible = useMemo(() => {
    const q = query.trim();
    const counts = new Map<string, number>();
    return items.filter((item) => {
      if (q ? !matches(`${item.section} ${item.label} ${item.hint ?? ""} ${item.keywords ?? ""}`, q) : item.section === "Settings" || item.section === "Theme") {
        return false;
      }
      const n = counts.get(item.section) ?? 0;
      if (n >= MAX_PER_SECTION) return false;
      counts.set(item.section, n + 1);
      return true;
    });
  }, [items, query]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    // After the palette unmounts, so shortcuts are live again.
    window.setTimeout(item.run, 0);
  };

  let lastSection = "";
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center kontinue-scrim px-4 pt-[14vh]">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Command palette"
        className="liquid-glass-dropdown relative z-10 flex max-h-[60vh] w-full max-w-[620px] flex-col overflow-hidden !rounded-[22px] text-foreground"
      >
        <div className="flex items-center gap-2.5 border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.06]">
          <Search size={15} className="shrink-0 text-muted-foreground" />
          <input
            // biome-ignore lint/a11y/noAutofocus: the palette exists to be typed into
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, visible.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(visible[index]);
              }
            }}
            placeholder="Search actions, settings, projects and threads"
            className="w-full bg-transparent text-lead outline-none placeholder:text-muted-foreground/60"
          />
          <kbd className="kontinue-3d rounded-md px-1.5 text-caption text-muted-foreground">esc</kbd>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-body text-muted-foreground">Nothing matches "{query}".</p>
          ) : (
            visible.map((item, i) => {
              const Icon = item.icon;
              const header = item.section !== lastSection ? item.section : null;
              lastSection = item.section;
              return (
                <div key={item.id}>
                  {header ? <p className="px-3 pt-2 pb-1 text-caption font-medium text-muted-foreground/70">{header}</p> : null}
                  <button
                    type="button"
                    data-index={i}
                    onMouseMove={() => setIndex(i)}
                    onClick={() => choose(item)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left",
                      i === index && "bg-black/[0.05] dark:bg-white/[0.07]",
                    )}
                  >
                    <Icon size={14} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-body">{item.label}</span>
                    {item.hint ? <span className="max-w-[40%] truncate text-caption text-muted-foreground">{item.hint}</span> : null}
                    {item.keys ? <Keys keys={item.keys} size="sm" /> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-black/[0.06] px-4 py-2 text-caption text-muted-foreground dark:border-white/[0.06]">
          <Palette size={11} />
          <span>↑↓ to move · Enter to run · ⌘K to close</span>
        </div>
      </div>
    </div>
  );
}
