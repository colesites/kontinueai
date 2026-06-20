import type { Doc } from "@repo/convex/convex/_generated/dataModel";
import { cn } from "@repo/ui/lib/utils";
import { ArrowUpRight, Code2, LoaderCircle, Star } from "lucide-react";
import Link from "next/link";

type KodeProjectCardProps = {
	project: Doc<"kodeWebProjects">;
};

export function KodeProjectCard({ project }: KodeProjectCardProps) {
	return (
		<Link
			href={`/kode/${project._id}`}
			className="group overflow-hidden rounded-[1.4rem] border border-foreground/8 bg-card/55 shadow-[0_18px_50px_-38px_color-mix(in_oklch,black_75%,transparent)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_25px_60px_-35px_color-mix(in_oklch,var(--primary)_45%,transparent)]"
		>
			<div className="relative aspect-[16/9] overflow-hidden border-b border-foreground/8 bg-[oklch(0.16_0.01_345)]">
				<div className="absolute inset-x-[9%] top-[13%] h-[74%] overflow-hidden rounded-lg border border-white/10 bg-[oklch(0.2_0.015_345)] shadow-2xl transition-transform duration-500 group-hover:scale-[1.025]">
					<div className="flex h-5 items-center gap-1 border-b border-white/8 px-2">
						<span className="size-1.5 rounded-full bg-primary/75" />
						<span className="size-1.5 rounded-full bg-white/20" />
						<span className="size-1.5 rounded-full bg-white/20" />
					</div>
					<div className="grid h-[calc(100%-1.25rem)] grid-cols-[28%_1fr] gap-2 p-2">
						<div className="rounded bg-white/[0.035]" />
						<div className="space-y-2 pt-1">
							<div className="h-2 w-3/5 rounded-full bg-primary/55" />
							<div className="h-1.5 w-4/5 rounded-full bg-white/10" />
							<div className="grid grid-cols-2 gap-1.5 pt-1">
								<div className="h-8 rounded bg-white/[0.05]" />
								<div className="h-8 rounded bg-white/[0.05]" />
							</div>
						</div>
					</div>
				</div>
				<div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[10px] font-medium text-white/70 backdrop-blur-xl">
					{project.status === "building" ? (
						<LoaderCircle className="size-3 animate-spin" />
					) : (
						<Code2 className="size-3" />
					)}
					{project.status === "building"
						? "Building"
						: `v${project.activeVersion}`}
				</div>
			</div>
			<div className="flex items-start gap-3 p-4">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						<h3 className="truncate text-sm font-semibold tracking-tight">
							{project.title}
						</h3>
						<Star
							className={cn(
								"size-3.5 shrink-0",
								project.starred
									? "fill-primary text-primary"
									: "hidden text-muted-foreground group-hover:block",
							)}
						/>
					</div>
					<p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
						{project.description ??
							"Open this project and continue building with Kode."}
					</p>
				</div>
				<ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
			</div>
		</Link>
	);
}
