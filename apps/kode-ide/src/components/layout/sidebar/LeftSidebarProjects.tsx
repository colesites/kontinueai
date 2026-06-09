import { Button } from "@/components/ui/button";
import { FolderPlus, ListFilter, Folder } from "lucide-react";

const projects: { name: string; hue: string }[] = [
  { name: "kontinueai", hue: "var(--brand)" },
  { name: "kode-ide", hue: "oklch(0.7 0.13 200)" },
];

const LeftSidebarProjects = () => {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/40">
          Projects
        </p>
        <div className="flex gap-x-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-foreground/40 hover:text-foreground"
          >
            <ListFilter size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-foreground/40 hover:text-foreground"
          >
            <FolderPlus size={13} />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {projects.map((p) => (
          <button
            key={p.name}
            type="button"
            className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-foreground/70 transition-colors hover:bg-white/[0.055] hover:text-foreground"
          >
            <span
              className="flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-white/[0.08]"
              style={{ background: `color-mix(in oklch, ${p.hue} 22%, transparent)` }}
            >
              <Folder size={11} style={{ color: p.hue }} />
            </span>
            <span className="truncate">{p.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default LeftSidebarProjects;
