import Image from "next/image";

export function AuthRouteFallback() {
	return (
		<div
			className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4"
			role="status"
			aria-label="Loading account"
		>
			<div className="pointer-events-none absolute left-1/2 top-[38%] h-[360px] w-[640px] max-w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-primary/10 blur-[100px]" />
			<div className="relative w-full max-w-md">
				<div className="mb-8 flex flex-col items-center">
					<Image
						src="/kontinueai.svg"
						alt="Kontinue AI"
						width={150}
						height={30}
						priority
						className="h-7 w-auto invert dark:invert-0"
					/>
					<div className="mt-4 h-4 w-52 animate-pulse rounded-full bg-foreground/8" />
				</div>
				<div className="rounded-2xl border border-border bg-card/80 p-6">
					<div className="h-4 w-24 animate-pulse rounded-full bg-foreground/10" />
					<div className="mt-3 h-11 animate-pulse rounded-xl bg-foreground/7" />
					<div className="mt-5 h-4 w-20 animate-pulse rounded-full bg-foreground/10" />
					<div className="mt-3 h-11 animate-pulse rounded-xl bg-foreground/7" />
					<div className="mt-6 h-11 animate-pulse rounded-xl bg-primary/18" />
				</div>
			</div>
		</div>
	);
}

export function AppRouteFallback() {
	return (
		<div
			className="flex h-dvh overflow-hidden bg-background text-foreground"
			role="status"
			aria-label="Loading Kontinue AI"
		>
			<aside className="hidden w-64 shrink-0 border-r border-border bg-card/60 p-4 md:block">
				<Image
					src="/kontinueai.svg"
					alt="Kontinue AI"
					width={128}
					height={26}
					priority
					className="h-6 w-auto invert dark:invert-0"
				/>
				<div className="mt-8 h-10 animate-pulse rounded-xl bg-foreground/7" />
				<div className="mt-3 h-10 animate-pulse rounded-xl bg-primary/12" />
				<div className="mt-8 space-y-3">
					<div className="h-4 w-28 animate-pulse rounded-full bg-foreground/8" />
					<div className="h-9 animate-pulse rounded-lg bg-foreground/5" />
					<div className="h-9 animate-pulse rounded-lg bg-foreground/5" />
					<div className="h-9 animate-pulse rounded-lg bg-foreground/5" />
				</div>
			</aside>
			<main className="flex min-w-0 flex-1 flex-col items-center justify-center px-4">
				<div className="h-8 w-64 max-w-[70vw] animate-pulse rounded-full bg-foreground/9" />
				<div className="mt-4 h-4 w-80 max-w-[80vw] animate-pulse rounded-full bg-foreground/6" />
				<div className="mt-10 h-32 w-full max-w-3xl animate-pulse rounded-3xl border border-border bg-card/70" />
			</main>
		</div>
	);
}

export function PageRouteFallback({ label }: { label: string }) {
	return (
		<div
			className="flex min-h-screen items-center justify-center bg-background p-6"
			role="status"
			aria-label={label}
		>
			<div className="w-full max-w-4xl">
				<div className="mx-auto h-8 w-56 animate-pulse rounded-full bg-foreground/9" />
				<div className="mx-auto mt-4 h-4 w-80 max-w-full animate-pulse rounded-full bg-foreground/6" />
				<div className="mt-10 grid gap-5 md:grid-cols-3">
					{["first", "second", "third"].map((item) => (
						<div
							key={item}
							className="h-64 animate-pulse rounded-2xl border border-border bg-card/70"
						/>
					))}
				</div>
			</div>
		</div>
	);
}
