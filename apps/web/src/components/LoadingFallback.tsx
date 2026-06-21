import { Loader2 } from "lucide-react";

const LoadingFallback = () => {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="relative flex flex-col items-center gap-4">
				<div className="animate-pulse-soft pointer-events-none absolute -inset-8 -z-10 rounded-full bg-primary/15 blur-3xl" />
				<Loader2 className="size-8 animate-spin text-primary" />
				<p className="text-sm text-muted-foreground">Loading…</p>
			</div>
		</div>
	);
};

export default LoadingFallback;
