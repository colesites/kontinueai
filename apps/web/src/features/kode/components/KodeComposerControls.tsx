"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";
import { Check, ChevronDown, Hammer, ListChecks, Zap } from "lucide-react";

export type KodeComposerMode = "build" | "plan";

type KodeComposerControlsProps = {
	mode: KodeComposerMode;
	onModeChange: (mode: KodeComposerMode) => void;
	remainingCredits?: number;
	disabled?: boolean;
};

const BUILD_MODE = {
	value: "build" as const,
	label: "Build",
	description: "Make changes directly",
	icon: Hammer,
};
const PLAN_MODE = {
	value: "plan" as const,
	label: "Plan",
	description: "Discuss before building",
	icon: ListChecks,
};
const MODES = [BUILD_MODE, PLAN_MODE];

export function KodeComposerControls({
	mode,
	onModeChange,
	remainingCredits,
	disabled,
}: KodeComposerControlsProps) {
	const active = mode === "plan" ? PLAN_MODE : BUILD_MODE;
	const ActiveIcon = active.icon;
	return (
		<>
			<span
				className="inline-flex h-8 items-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.04] px-2.5 text-[11px] font-medium text-muted-foreground"
				title="Kode credits remaining"
			>
				<Zap className="size-3.5" />
				{remainingCredits ?? "—"} credits
			</span>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={disabled}
						className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.06] disabled:opacity-45"
					>
						<ActiveIcon className="size-3.5" />
						{active.label}
						<ChevronDown className="size-3" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" sideOffset={8} className="w-64">
					{MODES.map((item) => (
						<DropdownMenuItem
							key={item.value}
							onClick={() => onModeChange(item.value)}
							className="items-start gap-3 py-2.5"
						>
							<Check
								className={cn(
									"mt-0.5 size-4 shrink-0",
									mode === item.value ? "opacity-100" : "opacity-0",
								)}
							/>
							<div>
								<div className="font-medium">{item.label}</div>
								<div className="text-xs text-muted-foreground">
									{item.description}
								</div>
							</div>
						</DropdownMenuItem>
					))}
					<DropdownMenuSeparator />
					<div className="px-2 py-1.5 text-[10px] text-muted-foreground">
						1 credit = 25,000 model tokens
					</div>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
}
