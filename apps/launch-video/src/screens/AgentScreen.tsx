import { range } from "../three/geometry";
import { fonts } from "../theme";
import { MacDesktop } from "./MacDesktop";

// A generic terminal coding agent (deliberately not any real product's UI).
// `t` is story time in seconds, shared by shots 2A → 2C → 2D so the screen
// carries on seamlessly across cuts.

export const AGENT = {
	prompt: "fix the 2 failing tests and ship the update",
	typeStart: 2.4,
	cps: 17,
	enterAt: 5.7,
	limitAt: 6.9,
};

const LOG: { at: number; icon?: string; text: string; tone?: "dim" | "ok" | "warn" | "add" }[] = [
	{ at: -1, text: "> add Stripe webhooks for subscription changes", tone: "dim" },
	{ at: -1, icon: "◆", text: "Read src/billing/webhook.ts" },
	{ at: 0.4, icon: "◆", text: "Edit src/billing/webhook.ts", tone: "add" },
	{ at: 1.0, icon: "◆", text: "Edit src/billing/plans.ts", tone: "add" },
	{ at: 1.5, icon: "◆", text: "Run bun test" },
	{ at: 1.9, text: "    18 passed · 2 failed", tone: "warn" },
];

const toneColor = { dim: "rgba(255,255,255,0.42)", ok: "#7ee2a8", warn: "#f5b453", add: "rgba(255,255,255,0.92)" };

export const AgentScreen: React.FC<{ t: number }> = ({ t }) => {
	const typed = AGENT.prompt.slice(0, Math.max(0, Math.floor((t - AGENT.typeStart) * AGENT.cps)));
	const sent = t >= AGENT.enterAt;
	const thinking = sent && t < AGENT.limitAt;
	const limitIn = range(t, AGENT.limitAt, AGENT.limitAt + 0.35);
	const caretOn = Math.floor(t * 2) % 2 === 0 || (t > AGENT.typeStart && t < AGENT.enterAt);
	const dots = ".".repeat(1 + (Math.floor(t * 4) % 3));

	return (
		<MacDesktop>
			<div
				style={{
					position: "absolute",
					left: 70,
					right: 70,
					top: 64,
					bottom: 44,
					borderRadius: 16,
					background: "#0c0c0f",
					border: "1px solid rgba(255,255,255,0.09)",
					boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
					overflow: "hidden",
					fontFamily: fonts.mono,
				}}
			>
				{/* Title bar */}
				<div style={{ height: 44, display: "flex", alignItems: "center", padding: "0 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
					{["#ff5f57", "#febc2e", "#28c840"].map((c) => (
						<div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, marginRight: 9 }} />
					))}
					<div style={{ flex: 1, textAlign: "center", fontSize: 15, color: "rgba(255,255,255,0.5)", marginRight: 66 }}>agent · ~/acme/api</div>
				</div>

				<div style={{ padding: "26px 34px", fontSize: 21, lineHeight: 1.75 }}>
					{LOG.filter((l) => t >= l.at).map((l, i) => (
						<div key={i} style={{ color: toneColor[l.tone ?? "add"], opacity: l.at < 0 ? 1 : range(t, l.at, l.at + 0.15) }}>
							{l.icon ? <span style={{ color: "#9a8cff", marginRight: 14 }}>{l.icon}</span> : null}
							{l.text}
						</div>
					))}

					{sent ? (
						<div style={{ marginTop: 18, color: "rgba(255,255,255,0.95)" }}>{`> ${AGENT.prompt}`}</div>
					) : null}

					{thinking ? (
						<div style={{ color: "#9a8cff", marginTop: 8 }}>
							◆ <span style={{ color: "rgba(255,255,255,0.55)" }}>Thinking{dots}</span>
						</div>
					) : null}

					{limitIn > 0 ? (
						<div
							style={{
								marginTop: 18,
								padding: "18px 22px",
								borderLeft: "3px solid #f5b453",
								background: "rgba(245,180,83,0.07)",
								borderRadius: 6,
								opacity: limitIn,
								transform: `translateY(${(1 - limitIn) * 10}px)`,
							}}
						>
							<div style={{ color: "#f5b453", fontWeight: 500 }}>You've reached your usage limit.</div>
							<div style={{ color: "rgba(255,255,255,0.55)" }}>Weekly limit reached · resets in 4 days</div>
						</div>
					) : null}
				</div>

				{/* Input */}
				<div
					style={{
						position: "absolute",
						left: 26,
						right: 26,
						bottom: 24,
						height: 62,
						borderRadius: 12,
						border: "1px solid rgba(255,255,255,0.14)",
						display: "flex",
						alignItems: "center",
						padding: "0 20px",
						fontSize: 21,
						color: "rgba(255,255,255,0.95)",
						opacity: limitIn > 0 ? 0.35 : 1,
					}}
				>
					<span style={{ color: "#9a8cff", marginRight: 12 }}>›</span>
					<span>{sent ? "" : typed}</span>
					<span style={{ width: 11, height: 26, background: caretOn ? "rgba(255,255,255,0.85)" : "transparent", marginLeft: 2 }} />
				</div>
			</div>
		</MacDesktop>
	);
};
