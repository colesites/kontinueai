import {
  Frame,
  Type,
  Square,
  Image as ImageIcon,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const layers: { name: string; icon: LucideIcon; depth: number }[] = [
  { name: "Frame", icon: Frame, depth: 0 },
  { name: "Header", icon: Square, depth: 1 },
  { name: "Logo", icon: ImageIcon, depth: 2 },
  { name: "Title", icon: Type, depth: 2 },
  { name: "Body", icon: Square, depth: 1 },
];

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="border-b border-white/[0.06] px-3 py-3">
    <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/40">
      <ChevronDown size={12} />
      {title}
    </div>
    {children}
  </div>
);

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="surface-inset flex items-center gap-1.5 rounded-md px-2 py-1.5">
    <span className="text-[11px] text-foreground/40">{label}</span>
    <span className="ml-auto font-mono text-[12px] text-foreground/80">
      {value}
    </span>
  </div>
);

const DesignSidebar = () => {
  return (
    <div className="flex h-full flex-col pt-2">
      <div className="px-3 pb-2 pt-1 text-[13px] font-semibold text-foreground/90">
        Design
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Layers">
          <div className="flex flex-col gap-0.5">
            {layers.map((l) => {
              const Icon = l.icon;
              return (
                <button
                  key={l.name}
                  type="button"
                  style={{ paddingLeft: 8 + l.depth * 14 }}
                  className="group flex items-center gap-2 rounded-md py-1.5 pr-2 text-[12.5px] text-foreground/70 transition-colors hover:bg-white/[0.04] hover:text-foreground"
                >
                  <Icon size={13} className="shrink-0 text-foreground/40" />
                  <span className="truncate">{l.name}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Properties">
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="X" value="120" />
            <Field label="Y" value="64" />
            <Field label="W" value="1440" />
            <Field label="H" value="1024" />
          </div>
        </Section>

        <Section title="Fill">
          <div className="flex items-center gap-2">
            <span className="size-5 rounded-md bg-brand ring-1 ring-white/10" />
            <span className="font-mono text-[12px] text-foreground/70">
              #D633A0
            </span>
            <span className="ml-auto text-[12px] text-foreground/40">100%</span>
          </div>
        </Section>
      </div>
    </div>
  );
};

export default DesignSidebar;
