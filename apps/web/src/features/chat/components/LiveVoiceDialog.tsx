"use client";

import { useUser } from "@clerk/nextjs";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import {
	getRealtimeVoiceModel,
	REALTIME_VOICE_LIMITS,
	type RealtimeVoiceModelId,
} from "@repo/core/realtime-voice";
import { Button } from "@repo/ui/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
	SheetTrigger,
} from "@repo/ui/components/ui/sheet";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
	AudioLines,
	Loader2,
	Mic,
	MicOff,
	PhoneOff,
	Volume2,
	X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PromptInputButton } from "../../../components/ai-elements/prompt-input";
import { usePlanTier } from "../../../lib/use-plan-tier";
import { createRealtimeModel, useRealtime } from "./realtime-client";

type VoiceSessionId = Id<"realtimeVoiceSessions">;

function messageText(message: {
	parts: Array<{ type: string; text?: string }>;
}): string {
	return message.parts
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text ?? "")
		.join("")
		.trim();
}

function formatTime(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatAllowance(seconds: number): string {
	if (seconds >= 3600) {
		const hours = seconds / 3600;
		return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
	}
	return `${Math.ceil(seconds / 60)}m`;
}

function VoiceAperture({
	state,
	orbRef,
}: {
	state: "idle" | "connecting" | "listening" | "speaking" | "error";
	orbRef: React.RefObject<HTMLDivElement | null>;
}) {
	return (
		<div
			ref={orbRef}
			data-state={state}
			className="voice-aperture relative isolate flex h-[112px] w-[224px] items-center justify-center sm:h-[126px] sm:w-[252px]"
			style={{ "--voice-level": "0" } as React.CSSProperties}
			aria-hidden="true"
		>
			<div className="voice-aperture-bloom absolute inset-[6%] rounded-[999px]" />
			<svg
				viewBox="0 0 360 180"
				className="relative size-full overflow-visible"
				aria-hidden="true"
			>
				<defs>
					<clipPath id="voice-aperture-clip">
						<rect x="25" y="25" width="310" height="130" rx="65" />
					</clipPath>
					<linearGradient id="voice-aperture-base" x1="0" y1="0" x2="1" y2="1">
						<stop offset="0" stopColor="var(--background)" />
						<stop offset=".46" stopColor="var(--primary)" stopOpacity=".3" />
						<stop offset="1" stopColor="var(--primary)" stopOpacity=".88" />
					</linearGradient>
					<radialGradient id="voice-aperture-light" cx="32%" cy="16%" r="90%">
						<stop offset="0" stopColor="white" stopOpacity=".72" />
						<stop offset=".38" stopColor="var(--primary)" stopOpacity=".28" />
						<stop offset="1" stopColor="var(--foreground)" stopOpacity=".1" />
					</radialGradient>
					<filter
						id="voice-aperture-warp"
						x="-30%"
						y="-70%"
						width="160%"
						height="240%"
					>
						<feTurbulence
							type="fractalNoise"
							baseFrequency=".008 .018"
							numOctaves="2"
							seed="12"
						>
							<animate
								attributeName="baseFrequency"
								dur="9s"
								values=".008 .018;.015 .01;.008 .018"
								repeatCount="indefinite"
							/>
						</feTurbulence>
						<feDisplacementMap in="SourceGraphic" scale="20" />
						<feGaussianBlur stdDeviation=".7" />
					</filter>
				</defs>
				<g clipPath="url(#voice-aperture-clip)">
					<rect
						x="25"
						y="25"
						width="310"
						height="130"
						rx="65"
						fill="url(#voice-aperture-base)"
					/>
					<path
						className="voice-aperture-flow voice-aperture-flow-a"
						d="M-8 138C61 49 127 54 188 110c55 51 117 30 184-54v142H-8Z"
						fill="url(#voice-aperture-light)"
						filter="url(#voice-aperture-warp)"
					/>
					<path
						className="voice-aperture-flow voice-aperture-flow-b"
						d="M-14 38c77 71 145 74 205 10 53-57 111-46 184 28v-96H-14Z"
						fill="var(--primary)"
						opacity=".38"
						filter="url(#voice-aperture-warp)"
					/>
					<ellipse
						cx="132"
						cy="56"
						rx="84"
						ry="30"
						fill="white"
						opacity=".12"
						transform="rotate(-8 132 56)"
					/>
				</g>
				<rect
					x="25.5"
					y="25.5"
					width="309"
					height="129"
					rx="64.5"
					fill="none"
					stroke="var(--foreground)"
					strokeOpacity=".1"
				/>
			</svg>
			<div className="voice-aperture-grain pointer-events-none absolute inset-[14%_10%] rounded-[999px] opacity-20" />
		</div>
	);
}

export function LiveVoiceDialog() {
	const { user } = useUser();
	const planTier = usePlanTier();
	const canUseLive = planTier === "pro" || planTier === "max";
	const allowance = useQuery(api.realtimeVoice.getAllowance, {});
	const startSession = useMutation(api.realtimeVoice.startSession);
	const meterSession = useMutation(api.realtimeVoice.meterSession);
	const finishSession = useMutation(api.realtimeVoice.endSession);
	const [open, setOpen] = useState(false);
	const [sessionId, setSessionId] = useState<VoiceSessionId | null>(null);
	const [modelId, setModelId] = useState<RealtimeVoiceModelId | null>(() =>
		getRealtimeVoiceModel(planTier),
	);
	const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
	const [isMuted, setIsMuted] = useState(false);
	const [elapsed, setElapsed] = useState(0);
	const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
	const [sessionCap, setSessionCap] = useState(
		REALTIME_VOICE_LIMITS[planTier].maxSessionSeconds,
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [starting, setStarting] = useState(false);
	const streamRef = useRef<MediaStream | null>(null);
	const orbRef = useRef<HTMLDivElement | null>(null);
	const startedAtRef = useRef<number | null>(null);
	const connectPendingRef = useRef(false);

	const resolvedModelId =
		modelId ?? getRealtimeVoiceModel(planTier) ?? "openai/gpt-realtime-1.5";
	const realtimeModel = useMemo(
		() => createRealtimeModel(resolvedModelId),
		[resolvedModelId],
	);
	const tokenPath = sessionId
		? `/api/realtime/token?sessionId=${encodeURIComponent(sessionId)}`
		: "/api/realtime/token";
	const sessionConfig = useMemo(
		() => ({
			voice: planTier === "max" ? "marin" : "alloy",
			turnDetection: { type: "server-vad" as const },
			instructions:
				"You are Kontinue Live, a warm, capable voice assistant. Speak naturally and concisely. Let the user interrupt. Never mention internal model or provider details.",
		}),
		[planTier],
	);

	const {
		status,
		messages,
		isCapturing,
		isPlaying,
		connect,
		disconnect,
		startAudioCapture,
		stopAudioCapture,
		stopPlayback,
		cancelResponse,
	} = useRealtime({
		model: realtimeModel,
		api: { token: tokenPath },
		sessionConfig,
		onError: (error) => setErrorMessage(error.message),
	});

	const endLiveSession = useCallback(async () => {
		connectPendingRef.current = false;
		startedAtRef.current = null;
		if (isCapturing) stopAudioCapture();
		streamRef.current?.getTracks().forEach((track) => {
			track.stop();
		});
		streamRef.current = null;
		setMediaStream(null);
		disconnect();
		if (sessionId) {
			try {
				await finishSession({ sessionId });
			} catch (error) {
				console.warn("[realtime] could not close usage session", error);
			}
		}
		setSessionId(null);
		setElapsed(0);
		setIsMuted(false);
	}, [disconnect, finishSession, isCapturing, sessionId, stopAudioCapture]);

	useEffect(() => {
		if (!sessionId || !connectPendingRef.current) return;
		connectPendingRef.current = false;
		void connect()
			.then(() => {
				if (!streamRef.current) return;
				startAudioCapture(streamRef.current);
				startedAtRef.current = Date.now();
			})
			.catch((error: unknown) => {
				setErrorMessage(
					error instanceof Error
						? error.message
						: "Live voice could not connect.",
				);
				void endLiveSession();
			});
	}, [connect, endLiveSession, sessionId, startAudioCapture]);

	useEffect(() => {
		if (status !== "connected" || !sessionId) return;
		const tick = window.setInterval(() => {
			if (startedAtRef.current) {
				setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
			}
		}, 1000);
		const heartbeat = window.setInterval(() => {
			void meterSession({ sessionId })
				.then((result) => {
					setRemainingSeconds(result.remainingSeconds);
					if (!result.allowed) {
						setErrorMessage(
							result.remainingSeconds === 0
								? "Your monthly live voice allowance is used up."
								: "This live session reached its time limit.",
						);
						void endLiveSession();
					}
				})
				.catch((error: unknown) => {
					setErrorMessage(
						error instanceof Error ? error.message : "Voice metering failed.",
					);
					void endLiveSession();
				});
		}, 15_000);
		return () => {
			window.clearInterval(tick);
			window.clearInterval(heartbeat);
		};
	}, [endLiveSession, meterSession, sessionId, status]);

	useEffect(() => {
		if (elapsed < sessionCap || !sessionId) return;
		setErrorMessage("This live session reached its time limit.");
		void endLiveSession();
	}, [elapsed, endLiveSession, sessionCap, sessionId]);

	useEffect(() => {
		if (!mediaStream || !orbRef.current) return;
		const context = new AudioContext();
		const analyser = context.createAnalyser();
		analyser.fftSize = 256;
		analyser.smoothingTimeConstant = 0.78;
		const source = context.createMediaStreamSource(mediaStream);
		source.connect(analyser);
		const data = new Uint8Array(analyser.frequencyBinCount);
		let frame = 0;
		const draw = () => {
			analyser.getByteFrequencyData(data);
			let sum = 0;
			for (const value of data) sum += value;
			const level = Math.min(1, sum / data.length / 78);
			orbRef.current?.style.setProperty("--voice-level", level.toFixed(3));
			frame = requestAnimationFrame(draw);
		};
		draw();
		return () => {
			cancelAnimationFrame(frame);
			source.disconnect();
			void context.close();
		};
	}, [mediaStream]);

	useEffect(() => {
		return () => {
			streamRef.current?.getTracks().forEach((track) => {
				track.stop();
			});
		};
	}, []);

	const begin = async () => {
		if (!canUseLive) return;
		setStarting(true);
		setErrorMessage(null);
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			});
			const session = await startSession({});
			streamRef.current = stream;
			setMediaStream(stream);
			setModelId(session.model as RealtimeVoiceModelId);
			setRemainingSeconds(session.remainingSeconds);
			setSessionCap(session.maxSessionSeconds);
			connectPendingRef.current = true;
			setSessionId(session.sessionId);
		} catch (error) {
			streamRef.current?.getTracks().forEach((track) => {
				track.stop();
			});
			streamRef.current = null;
			setErrorMessage(
				error instanceof Error
					? error.message
					: "Microphone access or live voice setup failed.",
			);
		} finally {
			setStarting(false);
		}
	};

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen && sessionId) void endLiveSession();
		if (!nextOpen) setErrorMessage(null);
	};

	const toggleMute = () => {
		const next = !isMuted;
		streamRef.current?.getAudioTracks().forEach((track) => {
			track.enabled = !next;
		});
		setIsMuted(next);
	};

	const orbState = errorMessage
		? "error"
		: status === "connecting" || starting
			? "connecting"
			: isPlaying
				? "speaking"
				: status === "connected"
					? "listening"
					: "idle";
	const statusLabel = errorMessage
		? "Connection paused"
		: status === "connecting" || starting
			? "Opening a quiet channel…"
			: isPlaying
				? "Kontinue is speaking"
				: status === "connected"
					? isMuted
						? "Microphone muted"
						: "Listening"
					: "Ready when you are";
	const visibleMessages = messages
		.map((message) => ({ ...message, text: messageText(message) }))
		.filter((message) => message.text)
		.slice(-3);
	const fallbackAllowance = REALTIME_VOICE_LIMITS[planTier];
	const firstName = user?.firstName?.trim() || "there";
	const shownRemaining =
		remainingSeconds ??
		allowance?.remainingSeconds ??
		fallbackAllowance.monthlySeconds;

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetTrigger asChild>
				<PromptInputButton
					type="button"
					className="glow-button group relative size-9 overflow-hidden rounded-full text-primary-foreground transition-transform hover:scale-105 active:scale-95"
					aria-label="Start live voice conversation"
				>
					<span className="absolute inset-0 bg-[radial-gradient(circle_at_35%_20%,color-mix(in_oklch,white_55%,transparent),transparent_36%)]" />
					<AudioLines className="relative size-[17px] transition-transform group-hover:scale-110" />
				</PromptInputButton>
			</SheetTrigger>
			<SheetContent
				side="bottom"
				showCloseButton={false}
				className="glass-strong gap-0 overflow-hidden p-0 text-foreground data-[side=bottom]:inset-x-auto data-[side=bottom]:right-auto data-[side=bottom]:bottom-2 data-[side=bottom]:left-1/2 data-[side=bottom]:h-[min(86dvh,760px)] data-[side=bottom]:w-[calc(100%-1rem)] data-[side=bottom]:max-w-[920px] data-[side=bottom]:-translate-x-1/2 data-[side=bottom]:rounded-[28px] data-[side=bottom]:border sm:data-[side=bottom]:bottom-4 sm:data-[side=bottom]:h-[min(76dvh,720px)] sm:data-[side=bottom]:w-[calc(100%-2rem)] sm:data-[side=bottom]:rounded-[32px]"
			>
				<SheetTitle className="sr-only">
					Kontinue Live voice conversation
				</SheetTitle>
				<SheetDescription className="sr-only">
					Have a realtime spoken conversation with Kontinue AI.
				</SheetDescription>
				<div className="pointer-events-none absolute inset-0 bg-background/90" />
				<div className="voice-sheet-ambient pointer-events-none absolute inset-0" />
				<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/55 to-transparent" />
				<div className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-foreground/12 sm:hidden" />

				<header className="relative z-10 flex items-center justify-between px-5 pt-6 pb-3 sm:px-7 sm:pt-5">
					<div className="flex items-center gap-3">
						<div className="grid size-10 place-items-center rounded-xl bg-foreground/[.045] ring-1 ring-foreground/8 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_8%,transparent)]">
							<AudioLines className="size-[18px] text-primary" />
						</div>
						<div>
							<p className="text-sm font-semibold tracking-tight">
								Kontinue Live
							</p>
							<p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
								<span
									className={cn(
										"size-1.5 rounded-full",
										status === "connected"
											? "bg-primary shadow-[0_0_10px_color-mix(in_oklch,var(--primary)_65%,transparent)]"
											: "bg-foreground/20",
									)}
								/>
								{planTier === "max"
									? "Max voice"
									: planTier === "pro"
										? "Pro voice"
										: "Voice preview"}
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={() => handleOpenChange(false)}
						className="grid size-10 place-items-center rounded-full bg-foreground/[.045] text-muted-foreground ring-1 ring-foreground/8 transition hover:scale-105 hover:bg-foreground/10 hover:text-foreground active:scale-95"
						aria-label="Close live voice"
					>
						<X className="size-4" />
					</button>
				</header>

				<main className="relative z-10 mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col items-center px-5 pb-5 sm:px-8 sm:pb-7">
					<div className="flex min-h-0 flex-1 flex-col items-center justify-center pb-2 text-center sm:pb-4">
						<VoiceAperture state={orbState} orbRef={orbRef} />
						<div className="mt-2 min-h-[92px] max-w-xl">
							<h2 className="text-balance text-[1.75rem] leading-[1.08] font-medium tracking-[-.035em] text-foreground sm:text-[2.2rem]">
								{status === "disconnected" && !starting && !errorMessage ? (
									<>Hi {firstName}, what&apos;s on your mind?</>
								) : (
									statusLabel
								)}
							</h2>
							{errorMessage ? (
								<p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-destructive">
									{errorMessage}
								</p>
							) : visibleMessages.length > 0 ? (
								<p className="mx-auto mt-2 line-clamp-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
									{visibleMessages.at(-1)?.text}
								</p>
							) : (
								<p className="mt-2 text-sm text-muted-foreground/80">
									A natural conversation. Interrupt whenever you like.
								</p>
							)}
						</div>
					</div>

					<div className="w-full max-w-xl">
						{status === "connected" && visibleMessages.length > 0 ? (
							<div className="surface-inset mb-3 hidden max-h-20 space-y-1 overflow-hidden rounded-2xl px-4 py-3 text-xs text-muted-foreground sm:block">
								{visibleMessages.map((message) => (
									<p key={message.id} className="truncate">
										<span className="mr-2 font-medium text-foreground/80">
											{message.role === "assistant" ? "Kontinue" : "You"}
										</span>
										{message.text}
									</p>
								))}
							</div>
						) : null}

						{!canUseLive ? (
							<div className="surface-card rounded-[22px] p-5 text-center">
								<p className="text-base font-medium">
									Kontinue Live starts on Pro
								</p>
								<p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
									Upgrade to unlock natural, interruptible speech-to-speech
									conversations.
								</p>
								<Button asChild className="glow-button mt-4 rounded-full px-6">
									<Link href="/pricing">See plans</Link>
								</Button>
							</div>
						) : status === "disconnected" ? (
							<div className="flex flex-col items-center">
								<div className="glass flex w-full items-center gap-2 rounded-full p-2">
									<button
										type="button"
										onClick={begin}
										disabled={starting || shownRemaining <= 0}
										className="glow-button group flex min-h-12 flex-1 items-center justify-center gap-2.5 rounded-full px-6 text-sm font-semibold text-primary-foreground transition hover:brightness-105 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50"
									>
										{starting ? (
											<Loader2 className="size-5 animate-spin" />
										) : (
											<Mic className="size-5" />
										)}
										{shownRemaining <= 0
											? "Monthly limit reached"
											: "Start talking"}
									</button>
									<button
										type="button"
										onClick={() => handleOpenChange(false)}
										className="grid size-12 shrink-0 place-items-center rounded-full bg-foreground/[.06] text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground active:scale-95"
										aria-label="Close live voice"
									>
										<X className="size-5" />
									</button>
								</div>
								<p className="mt-2.5 text-[11px] text-muted-foreground/75">
									{formatAllowance(shownRemaining)} remaining this month
								</p>
							</div>
						) : (
							<div className="glass mx-auto flex w-fit items-center justify-center gap-2 rounded-full p-2">
								<button
									type="button"
									onClick={toggleMute}
									className={cn(
										"grid size-12 place-items-center rounded-full transition",
										isMuted
											? "bg-destructive/12 text-destructive ring-1 ring-destructive/20"
											: "bg-foreground/[.06] text-foreground/75 hover:bg-foreground/10",
									)}
									aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
								>
									{isMuted ? (
										<MicOff className="size-5" />
									) : (
										<Mic className="size-5" />
									)}
								</button>
								<button
									type="button"
									onClick={() => {
										stopPlayback();
										cancelResponse();
									}}
									className="grid size-12 place-items-center rounded-full bg-foreground/[.06] text-foreground/75 transition hover:bg-foreground/10"
									aria-label="Stop AI speaking"
								>
									<Volume2 className="size-5" />
								</button>
								<button
									type="button"
									onClick={() => void endLiveSession()}
									className="grid size-13 place-items-center rounded-full bg-destructive text-white shadow-[0_8px_22px_-8px_color-mix(in_oklch,var(--destructive)_65%,transparent)] transition hover:scale-105 hover:brightness-110 active:scale-95"
									aria-label="End live conversation"
								>
									<PhoneOff className="size-5" />
								</button>
							</div>
						)}

						<div className="mt-2.5 flex items-center justify-center gap-2.5 text-[10.5px] text-muted-foreground/65">
							<span>
								{status === "connected"
									? formatTime(elapsed)
									: `Up to ${formatAllowance(sessionCap)} per session`}
							</span>
							<span className="size-1 rounded-full bg-foreground/15" />
							<span>Audio is processed live</span>
						</div>
					</div>
				</main>

				<style jsx>{`
					.voice-sheet-ambient { background: radial-gradient(circle at 50% 38%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 34%), linear-gradient(180deg, color-mix(in oklch, var(--foreground) 1.5%, transparent), transparent 34%); }
					.voice-aperture { transform: scale(calc(1 + var(--voice-level) * .035)); transition: transform 80ms linear, filter 250ms ease; animation: aperture-float 6s ease-in-out infinite; }
					.voice-aperture-bloom { background: radial-gradient(ellipse, color-mix(in oklch, var(--primary) 26%, transparent), transparent 68%); filter: blur(18px); opacity: calc(.55 + var(--voice-level) * .35); transform: scale(calc(1 + var(--voice-level) * .15)); transition: transform 80ms linear, opacity 80ms linear; }
					.voice-aperture-flow { transform-origin: center; mix-blend-mode: soft-light; }
					.voice-aperture-flow-a { animation: aperture-flow-a 7s ease-in-out infinite; }
					.voice-aperture-flow-b { animation: aperture-flow-b 9s ease-in-out infinite reverse; }
					.voice-aperture-grain { background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 90' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.22'/%3E%3C/svg%3E"); mix-blend-mode: soft-light; }
					.voice-aperture[data-state='speaking'] { animation-duration: 2.4s; filter: saturate(1.15); }
					.voice-aperture[data-state='connecting'] { animation: aperture-pulse 1.5s ease-in-out infinite; }
					.voice-aperture[data-state='error'] { filter: grayscale(.45); opacity: .62; }
					@keyframes aperture-float { 0%,100% { translate: 0 2px; } 50% { translate: 0 -5px; } }
					@keyframes aperture-pulse { 0%,100% { transform: scale(.96); opacity: .7; } 50% { transform: scale(1.02); opacity: 1; } }
					@keyframes aperture-flow-a { 0%,100% { transform: translateX(-5px) scale(1.02); } 50% { transform: translateX(8px) scale(1.08); } }
					@keyframes aperture-flow-b { 0%,100% { transform: translateX(6px); } 50% { transform: translateX(-8px) scale(1.05); } }
					@media (prefers-reduced-motion: reduce) { .voice-aperture, .voice-aperture-flow { animation: none !important; } }
				`}</style>
			</SheetContent>
		</Sheet>
	);
}
