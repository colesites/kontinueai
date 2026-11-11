// Settings → Keyboard shortcuts: every shortcut in one searchable list.
// Rebindable ones (kode-keybindings.ts) record a new combo on click; the rest
// are handled inside inputs and are listed for reference.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, Search } from "lucide-react";
import {
  eventToKeys,
  findConflicts,
  formatKeys,
  KEYBINDING_COMMANDS,
  KEYBINDING_GROUPS,
  pauseKeybindings,
  resetBindings,
  setBinding,
  useBindings,
} from "@/lib/kode-keybindings";
import { cn } from "@/lib/utils";
import { Card, Empty, Keys, PillButton, Tag } from "./settings-ui";

type Fixed = { keys: string[]; label: string; when: string };

// Keys handled inside inputs and components; not rebindable.
const FIXED: { group: string; items: Fixed[] }[] = [
  {
    group: "Composer",
    items: [
      { keys: ["Enter"], label: "Send (or new line, if ⌘ Enter sends)", when: "Composer focused" },
      { keys: ["⌘", "Enter"], label: "Send, or save an edited message", when: "Composer focused" },
      { keys: ["⇧", "Enter"], label: "New line", when: "Composer focused" },
      { keys: ["⇧", "Tab"], label: "Cycle permission mode", when: "Kode composer focused" },
      { keys: ["@"], label: "Tag a file or folder", when: "Composer focused" },
      { keys: ["/"], label: "Commands, skills and connectors", when: "Composer focused" },
      { keys: ["⌘", "S"], label: "Stash the draft", when: "Composer focused" },
    ],
  },
  {
    group: "Settings",
    items: [
      { keys: ["/"], label: "Search settings", when: "In settings" },
      { keys: ["Esc"], label: "Close settings, menus and dialogs", when: "Always" },
    ],
  },
];

export function ShortcutsSection() {
  const bindings = useBindings();
  const [recording, setRecording] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!recording) return;
    pauseKeybindings(true);
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(null);
        return;
      }
      const keys = eventToKeys(event);
      if (!keys) return;
      if (!keys.includes("+")) {
        setWarning("Use at least one modifier (⌘, Ctrl, ⌥ or ⇧) so typing isn't affected.");
        return;
      }
      const conflicts = findConflicts(recording, keys, bindings);
      for (const id of conflicts) setBinding(id, "");
      setWarning(
        conflicts.length
          ? `Moved from "${KEYBINDING_COMMANDS.find((c) => c.id === conflicts[0])?.label}", which is now unbound.`
          : null,
      );
      setBinding(recording, keys);
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      pauseKeybindings(false);
    };
  }, [recording, bindings]);

  const needle = query.trim().toLowerCase();
  const matches = (text: string) => !needle || text.toLowerCase().includes(needle);

  // Rebindable shortcuts that collide with a fixed one.
  const fixedCombos = useMemo(() => new Set(FIXED.flatMap((g) => g.items.map((i) => i.keys.join("+")))), []);

  const groups = KEYBINDING_GROUPS
    .map((group) => ({
      group,
      items: KEYBINDING_COMMANDS.filter(
        (c) => c.group === group && matches(`${group} ${c.label} ${c.when} ${formatKeys(bindings[c.id] || "").join(" ")}`),
      ),
    }))
    .filter((g) => g.items.length);
  const fixedGroups = FIXED.map((g) => ({
    ...g,
    items: g.items.filter((i) => matches(`${g.group} ${i.label} ${i.when} ${i.keys.join(" ")}`)),
  })).filter((g) => g.items.length);
  const customCount = KEYBINDING_COMMANDS.filter((c) => bindings[c.id] !== c.defaultKeys).length;

  return (
    <>
      <Card>
        <div className="flex items-center gap-2 px-3 py-3">
          <div className="kontinue-3d flex h-8 flex-1 items-center gap-2 rounded-full px-3">
            <Search size={12} className="shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shortcuts"
              className="w-full bg-transparent text-label outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <PillButton onClick={() => resetBindings()} disabled={!customCount} title="Reset every shortcut to its default">
            <RotateCcw size={12} />
            Reset all
          </PillButton>
        </div>
      </Card>

      {warning ? <p className="-mt-5 mb-6 px-1 text-label text-amber-600 dark:text-amber-400">{warning}</p> : null}

      {groups.map(({ group, items }) => (
        <Card key={group} title={group}>
          {items.map((command) => {
            const keys = bindings[command.id];
            const custom = keys !== command.defaultKeys;
            const isRecording = recording === command.id;
            const clash = keys && fixedCombos.has(formatKeys(keys).join("+"));
            return (
              <div key={command.id} className="flex items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-body font-medium text-foreground/90">
                    {group}: {command.label}
                    {custom ? <Tag>Custom</Tag> : null}
                  </p>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    When <span className="ml-1 font-mono text-foreground/70">{command.when}</span>
                  </p>
                </div>
                {clash ? (
                  <span title="Also used by a built-in shortcut">
                    <AlertTriangle size={13} className="text-amber-500" />
                  </span>
                ) : null}
                {custom ? (
                  <button
                    type="button"
                    title="Reset to default"
                    aria-label={`Reset ${command.label}`}
                    onClick={() => setBinding(command.id, null)}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <RotateCcw size={12} />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setRecording(isRecording ? null : command.id)}
                  title={isRecording ? "Press keys, Esc to cancel" : "Click to change"}
                  className={cn(
                    "flex h-8 min-w-[92px] cursor-pointer items-center justify-end rounded-full px-1.5 transition-colors kontinue-hover",
                    isRecording && "ring-1 ring-purple-500/60",
                  )}
                >
                  {isRecording ? (
                    <span className="px-2 text-label text-purple-600 dark:text-purple-300">Press keys…</span>
                  ) : keys ? (
                    <Keys keys={formatKeys(keys)} size="sm" />
                  ) : (
                    <span className="px-2 text-label text-muted-foreground">Unbound</span>
                  )}
                </button>
              </div>
            );
          })}
        </Card>
      ))}

      {fixedGroups.map((group) => (
        <Card key={group.group} title={`${group.group} (built in)`}>
          {group.items.map((item) => (
            <div key={`${item.label}-${item.keys.join("")}`} className="flex items-center gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-foreground/90">{item.label}</p>
                <p className="mt-0.5 text-caption text-muted-foreground">
                  When <span className="ml-1 font-mono text-foreground/70">{item.when}</span>
                </p>
              </div>
              <span className="px-1.5">
                <Keys keys={item.keys} size="sm" />
              </span>
            </div>
          ))}
        </Card>
      ))}

      {!groups.length && !fixedGroups.length ? (
        <Card>
          <Empty title="No matching shortcuts" />
        </Card>
      ) : null}
    </>
  );
}
