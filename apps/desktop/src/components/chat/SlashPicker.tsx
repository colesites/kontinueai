import { cn } from "@/lib/utils";
import { HoverInfo, HoverInfoProvider } from "@/components/ui/hover-info";
import type { SlashEntry } from "@/lib/kode-commands";

function Row({
  entry,
  index,
  active,
  onHover,
  onSelect,
}: {
  entry: SlashEntry;
  index: number;
  active: boolean;
  onHover: (index: number) => void;
  onSelect: (entry: SlashEntry) => void;
}) {
  return (
    <HoverInfo title={`/${entry.name}`} description={entry.description}>
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect(entry);
      }}
      onMouseEnter={() => onHover(index)}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer",
        active ? "kontinue-menu-active font-medium" : "text-foreground hover:bg-purple-500/10",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          <span className="text-muted-foreground/70">/</span>
          {entry.name}
        </span>
        <span className={cn("block truncate text-caption", active ? "text-foreground/60" : "text-muted-foreground")}>
          {entry.description}
        </span>
      </span>
      {entry.kind === "command" && entry.plugin ? (
        <span className="shrink-0 rounded-full border border-black/10 px-1.5 text-micro text-muted-foreground dark:border-white/10">
          {entry.plugin}
        </span>
      ) : null}
      {entry.kind === "connector" && !entry.connected ? (
        <span className="shrink-0 rounded-full border border-purple-500/30 px-1.5 text-micro text-purple-400">
          Connect
        </span>
      ) : null}
      {entry.kind === "skill" && entry.scope ? (
        <span className="shrink-0 rounded-full border border-black/10 px-1.5 text-micro text-muted-foreground dark:border-white/10">
          {entry.scope}
        </span>
      ) : null}
    </button>
    </HoverInfo>
  );
}

export function SlashPicker({
  entries,
  activeIndex,
  onHoverIndex,
  onSelect,
}: {
  entries: SlashEntry[];
  activeIndex: number;
  onHoverIndex: (index: number) => void;
  onSelect: (entry: SlashEntry) => void;
}) {
  const commands = entries.filter((e) => e.kind === "command");
  const skills = entries.filter((e) => e.kind === "skill");
  const connectors = entries.filter((e) => e.kind === "connector");
  const indexOf = (entry: SlashEntry) => entries.findIndex((e) => e.id === entry.id);

  return (
    <HoverInfoProvider>
    <div className="absolute bottom-full left-4 z-50 mb-2 max-h-80 w-80 overflow-y-auto rounded-2xl liquid-glass-dropdown p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.6),0_0_20px_rgba(168,85,247,0.2)] border border-purple-500/30">
      {commands.length > 0 ? (
        <>
          <div className="px-2.5 pt-1 pb-1 text-micro font-semibold uppercase tracking-wider text-purple-300/80">
            Commands
          </div>
          {commands.map((entry) => (
            <Row key={entry.id} entry={entry} index={indexOf(entry)} active={indexOf(entry) === activeIndex} onHover={onHoverIndex} onSelect={onSelect} />
          ))}
        </>
      ) : null}

      {skills.length > 0 ? (
        <>
          <div className={cn("px-2.5 pb-1 text-micro font-semibold uppercase tracking-wider text-purple-300/80", commands.length > 0 && "pt-2.5")}>
            Skills
          </div>
          {skills.map((entry) => (
            <Row key={entry.id} entry={entry} index={indexOf(entry)} active={indexOf(entry) === activeIndex} onHover={onHoverIndex} onSelect={onSelect} />
          ))}
        </>
      ) : null}

      {connectors.length > 0 ? (
        <>
          <div className={cn("px-2.5 pb-1 text-micro font-semibold uppercase tracking-wider text-purple-300/80", (commands.length > 0 || skills.length > 0) && "pt-2.5")}>
            Connectors
          </div>
          {connectors.map((entry) => (
            <Row key={entry.id} entry={entry} index={indexOf(entry)} active={indexOf(entry) === activeIndex} onHover={onHoverIndex} onSelect={onSelect} />
          ))}
        </>
      ) : null}

      {entries.length === 0 ? <p className="px-3 py-2 text-label text-muted-foreground">No matches.</p> : null}
    </div>
    </HoverInfoProvider>
  );
}
