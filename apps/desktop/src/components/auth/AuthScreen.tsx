import { useSignIn } from "@clerk/clerk-react";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import {
	ArrowLeft,
	ExternalLink,
	KeyRound,
	LoaderCircle,
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import {
	clearPendingBrowserSignIn,
	hasPendingBrowserSignIn,
	parseAuthCallback,
	startBrowserSignIn,
} from "@/lib/desktop-auth";

type AuthMode = "sign-in" | "sign-up";
type AuthStep = "welcome" | "browser";
type BusyAction = "browser" | "ticket" | null;

function clerkError(error: unknown) {
	if (typeof error === "object" && error && "errors" in error) {
		const errors = (
			error as { errors?: Array<{ longMessage?: string; message?: string }> }
		).errors;
		return (
			errors?.[0]?.longMessage ??
			errors?.[0]?.message ??
			"Something went wrong. Please try again."
		);
	}
	return "Something went wrong. Please try again.";
}

function errorMessage(caught: unknown) {
	return caught instanceof Error ? caught.message : clerkError(caught);
}

export function AuthScreen() {
	const { isLoaded: signInLoaded, setActive, signIn } = useSignIn();
	const [step, setStep] = useState<AuthStep>(() =>
		hasPendingBrowserSignIn() ? "browser" : "welcome",
	);
	const [lastMode, setLastMode] = useState<AuthMode>("sign-in");
	const [pastedTicket, setPastedTicket] = useState("");
	const [showPaste, setShowPaste] = useState(false);
	const [busy, setBusy] = useState<BusyAction>(null);
	const [error, setError] = useState<string | null>(null);

	/** Exchanges a one-time sign-in token minted by the web app for a session. */
	const signInWithTicket = useCallback(
		async (ticket: string) => {
			if (!signInLoaded) return;
			setBusy("ticket");
			setError(null);
			try {
				const attempt = await signIn.create({ strategy: "ticket", ticket });
				if (attempt.status !== "complete" || !attempt.createdSessionId) {
					throw new Error("We couldn't finish signing you in. Please try again.");
				}
				clearPendingBrowserSignIn();
				await setActive({ session: attempt.createdSessionId });
			} catch (caught) {
				setError(errorMessage(caught));
				setBusy(null);
			}
		},
		[signIn, signInLoaded, setActive],
	);

	// Deep-link callbacks (`kontinueai://auth/callback?...`) can arrive before
	// Clerk finishes loading, so always call the latest handler via a ref.
	const handleUrlsRef = useRef<(urls: string[]) => void>(() => {});
	handleUrlsRef.current = (urls: string[]) => {
		for (const url of urls) {
			const result = parseAuthCallback(url);
			if (!result) continue;
			setStep("browser");
			if (result.ok) {
				void signInWithTicket(result.ticket);
			} else {
				setError(result.reason);
			}
			return;
		}
	};

	useEffect(() => {
		if (!signInLoaded) return;
		let disposed = false;
		let unlisten: (() => void) | undefined;

		getCurrent()
			.then((urls) => {
				if (!disposed && urls?.length) handleUrlsRef.current(urls);
			})
			.catch(() => {});

		onOpenUrl((urls) => handleUrlsRef.current(urls))
			.then((fn) => {
				if (disposed) fn();
				else unlisten = fn;
			})
			.catch(() => {});

		// Also listen to localhost loopback callbacks emitted by start_desktop_auth_server
		let unlistenOauth: (() => void) | undefined;
		import("@tauri-apps/api/event")
			.then(({ listen }) =>
				listen<string>("oauth://callback", (event) => {
					if (!disposed && event.payload) {
						handleUrlsRef.current([event.payload]);
					}
				}),
			)
			.then((fn) => {
				if (disposed) fn();
				else unlistenOauth = fn;
			})
			.catch(() => {});

		return () => {
			disposed = true;
			unlisten?.();
			unlistenOauth?.();
		};
	}, [signInLoaded]);

	const handleOpenBrowser = async (mode: AuthMode) => {
		if (busy === "ticket") return;
		setError(null);
		setBusy("browser");
		setLastMode(mode);
		try {
			await startBrowserSignIn(mode);
			setStep("browser");
		} catch (caught) {
			setError(errorMessage(caught));
		} finally {
			setBusy(null);
		}
	};

	const cancelBrowser = () => {
		clearPendingBrowserSignIn();
		setStep("welcome");
		setShowPaste(false);
		setPastedTicket("");
		setError(null);
		setBusy(null);
	};

	const submitPastedTicket = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const ticket = pastedTicket.trim();
		if (!ticket || busy) return;
		void signInWithTicket(ticket);
	};

	if (step === "browser") {
		const finishing = busy === "ticket";
		return (
			<AuthShell>
				<button
					type="button"
					className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-white/50 transition hover:text-white"
					onClick={cancelBrowser}
				>
					<ArrowLeft size={14} /> Back
				</button>
				<h1 className="text-xl font-semibold tracking-tight text-white">
					{finishing ? "Signing you in…" : "Continue in your browser"}
				</h1>
				<p className="mt-1.5 text-xs leading-relaxed text-white/55">
					{finishing
						? "Almost there. Completing your session…"
						: "We opened Kontinue AI in your default browser. Complete sign-in there and you'll return here automatically."}
				</p>

				<div className="mt-6 flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/75">
					<LoaderCircle className="animate-spin text-purple-400 shrink-0" size={15} />
					{finishing ? "Finishing sign-in…" : "Waiting for browser authorization…"}
				</div>

				{error && (
					<div className="mt-4">
						<ErrorBanner message={error} />
					</div>
				)}

				{!finishing && (
					<div className="mt-5 space-y-3">
						<button
							type="button"
							disabled={busy === "browser"}
							onClick={() => void handleOpenBrowser(lastMode)}
							className="relative flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#7c3aed] to-[#6d28d9] px-5 text-sm font-semibold text-white shadow-[0_10px_25px_-5px_rgba(109,40,217,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
						>
							<ExternalLink size={15} /> Reopen browser
						</button>

						{showPaste ? (
							<form className="mt-4 space-y-2.5 text-left" onSubmit={submitPastedTicket}>
								<label className="block">
									<span className="mb-1.5 block text-xs font-medium text-white/70">
										Sign-in code from browser
									</span>
									<input
										value={pastedTicket}
										onChange={(event) => setPastedTicket(event.target.value)}
										placeholder="Paste code from browser here"
										className="h-10 w-full rounded-xl border border-white/10 bg-[#141416] px-3.5 font-mono text-xs text-white outline-none transition placeholder:font-sans placeholder:text-white/30 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
										autoFocus
										required
									/>
								</label>
								<button
									type="submit"
									disabled={busy !== null}
									className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#7c3aed] to-[#6d28d9] text-xs font-semibold text-white shadow-[0_6px_20px_-4px_rgba(109,40,217,0.4),inset_0_1px_1px_rgba(255,255,255,0.35)] transition hover:brightness-110 active:scale-[0.98]"
								>
									Sign in with code
								</button>
							</form>
						) : (
							<button
								type="button"
								className="w-full text-center text-xs text-white/40 underline-offset-4 transition hover:text-white/80 hover:underline"
								onClick={() => setShowPaste(true)}
							>
								Browser didn't open the app? Paste a code instead
							</button>
						)}
					</div>
				)}
			</AuthShell>
		);
	}

	return (
		<AuthShell>
			<h1 className="text-xl font-semibold tracking-tight text-white">
				Welcome to Kontinue AI
			</h1>
			<p className="mt-1.5 text-xs leading-relaxed text-white/55">
				Sign in to access your projects, context, and multi-model workspaces.
			</p>

			{error && (
				<div className="mt-4">
					<ErrorBanner message={error} />
				</div>
			)}

			<div className="mt-7 space-y-3">
				{/* Primary Glow Button (matching 2nd reference image) */}
				<button
					type="button"
					disabled={busy !== null}
					className="group relative flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#7c3aed] to-[#6d28d9] text-sm font-semibold text-white shadow-[0_10px_25px_-5px_rgba(109,40,217,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
					onClick={() => void handleOpenBrowser("sign-in")}
				>
					{busy === "browser" && lastMode === "sign-in" ? (
						<LoaderCircle className="animate-spin text-white" size={16} />
					) : (
						<ExternalLink size={15} className="text-white/80 transition group-hover:text-white" />
					)}
					Log in
				</button>

				{/* Secondary Pill Button */}
				<button
					type="button"
					disabled={busy !== null}
					className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm font-medium text-white/90 shadow-sm transition hover:bg-white/[0.08] hover:text-white active:scale-[0.98] disabled:opacity-60"
					onClick={() => void handleOpenBrowser("sign-up")}
				>
					{busy === "browser" && lastMode === "sign-up" ? (
						<LoaderCircle className="animate-spin" size={16} />
					) : null}
					Sign up
				</button>
			</div>

			<div className="mt-6 border-t border-white/5 pt-4 text-center">
				{showPaste ? (
					<form className="space-y-2.5 text-left" onSubmit={submitPastedTicket}>
						<label className="block">
							<span className="mb-1.5 block text-xs font-medium text-white/70">
								Have a sign-in code from your browser?
							</span>
							<input
								value={pastedTicket}
								onChange={(event) => setPastedTicket(event.target.value)}
								placeholder="Paste code from browser here"
								className="h-10 w-full rounded-xl border border-white/10 bg-[#141416] px-3.5 font-mono text-xs text-white outline-none transition placeholder:font-sans placeholder:text-white/30 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
								required
							/>
						</label>
						<button
							type="submit"
							disabled={busy === "ticket"}
							className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#7c3aed] to-[#6d28d9] text-xs font-semibold text-white shadow-[0_6px_20px_-4px_rgba(109,40,217,0.4),inset_0_1px_1px_rgba(255,255,255,0.35)] transition hover:brightness-110 active:scale-[0.98]"
						>
							{busy === "ticket" && <LoaderCircle className="animate-spin" size={14} />}
							Sign in with code
						</button>
					</form>
				) : (
					<button
						type="button"
						className="inline-flex items-center gap-1.5 text-xs text-white/40 underline-offset-4 transition hover:text-white/80 hover:underline"
						onClick={() => setShowPaste(true)}
					>
						<KeyRound size={12} />
						Have a sign-in code?
					</button>
				)}
			</div>
		</AuthShell>
	);
}

function AuthShell({ children }: { children: ReactNode }) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0d0e]/85 backdrop-blur-md p-6 text-[#f5f5f5]">
			{/* Ambient background glow */}
			<div className="pointer-events-none absolute h-[320px] w-[320px] rounded-full bg-purple-600/15 blur-[100px]" />

			<section className="relative w-full max-w-[370px] rounded-2xl border border-white/10 bg-[#18181b]/95 p-7 shadow-2xl backdrop-blur-xl">
				{/* Squircle App Icon matching exact macOS rounded container design */}
				<div className="flex flex-col items-center text-center">
					<img
						src="/kontinueai-app-icon.png"
						alt="Kontinue AI"
						className="size-16 object-contain rounded-2xl shadow-lg drop-shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
					/>
				</div>

				{/* Content */}
				<div className="mt-6 text-center">{children}</div>
			</section>
		</div>
	);
}

function ErrorBanner({ message }: { message: string }) {
	return (
		<p
			role="alert"
			className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300"
		>
			{message}
		</p>
	);
}
