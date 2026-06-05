import { TabsList, TabsTrigger } from "@/components/ui/tabs";

const modeTabs = [
  { value: "plan", label: "Plan" },
  { value: "design", label: "Design" },
  { value: "code", label: "Code" },
  { value: "review", label: "Review" },
];

export function Topbar() {
  return (
    <TabsList className="mx-auto h-10 gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] p-1 backdrop-blur-xl shadow-[inset_0_1px_0_oklch(1_0_0/0.06),0_8px_24px_-12px_oklch(0_0_0/0.6)]">
      {modeTabs.map((tab) => (
        <TabsTrigger
          key={tab.value}
          value={tab.value}
          className="rounded-full px-4 text-[13px] text-foreground/55 transition-colors duration-150 hover:text-foreground/80
            data-active:bg-white/[0.08] data-active:text-foreground
            data-active:shadow-[inset_0_1px_0_oklch(1_0_0/0.10)]
            data-active:ring-1 data-active:ring-[color-mix(in_oklch,var(--brand)_28%,oklch(1_0_0/0.06))]"
        >
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
