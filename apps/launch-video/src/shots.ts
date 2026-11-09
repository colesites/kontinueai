// The single source of truth for the film. Order = edit order.
//
// "Keep going." An Apple keynote style product film: no people, devices in a
// clean bright studio, the real apps on their screens, big quiet type.
// The studio light tells the story: bright while you work, it dims when you
// hit the limit, and Kontinue brings it back.
//
// kind:
//   3d      → device shot built with @remotion/three (MacBook Pro, foldable iPhone)
//   screen  → full-frame app UI built in React (Claude desktop, Kontinue web/desktop)
//   motion  → typography / graphic shot built in React
//   card    → logo card built in React

export type ShotKind = "3d" | "screen" | "motion" | "card";

export type Shot = {
	id: string;
	scene: string;
	kind: ShotKind;
	seconds: number;
	description: string;
	/** On-screen type, if any. */
	text?: string;
	sound?: string;
};

export const shots: Shot[] = [
	// 1. IN THE ZONE
	{
		id: "1A",
		scene: "In the zone",
		kind: "motion",
		seconds: 3,
		description: "Bright warm-white studio. Type fades in, centered.",
		text: "You were in the zone.",
		sound: "Soft music starts. A single piano or synth note.",
	},
	{
		id: "1B",
		scene: "In the zone",
		kind: "3d",
		seconds: 5,
		description: "The space black MacBook Pro floats into frame and turns slowly to face us. On screen: the Claude desktop app, Claude Code mid-task, lines streaming in.",
		sound: "Music builds gently. Soft keyboard clicks.",
	},
	{
		id: "1C",
		scene: "In the zone",
		kind: "screen",
		seconds: 3.5,
		description: "Close on the Claude app. A message is sent, it starts working, then: 'Weekly limit reached'. The studio light around the laptop drops to dark.",
		sound: "Music cuts out on the limit message.",
	},
	{
		id: "1D",
		scene: "In the zone",
		kind: "motion",
		seconds: 3,
		description: "Dark studio. Type, quiet and slow.",
		text: "Then you hit the limit.",
		sound: "Silence. One low tone.",
	},

	// 2. THE WALL
	{
		id: "2A",
		scene: "The wall",
		kind: "motion",
		seconds: 3.5,
		description: "Limit messages drop in and stack up like bricks, faster and faster: 'Message limit reached', 'Try again in 4 hours', 'Upgrade to continue', 'Weekly limit reached'. Generic cards, no logos.",
		sound: "Each card lands with a soft thud, speeding up.",
	},
	{
		id: "2B",
		scene: "The wall",
		kind: "motion",
		seconds: 3.5,
		description: "The wall freezes. Type over it, then the wall dissolves.",
		text: "Starting over is the worst part.",
		sound: "Thuds stop. Breath of silence.",
	},
	{
		id: "2C",
		scene: "The wall",
		kind: "card",
		seconds: 3,
		description: "The studio light comes back up. The Kontinue mark fades in, violet, then the wordmark.",
		text: "Meet Kontinue.",
		sound: "Music returns, warmer, with a lift.",
	},

	// 3. ON YOUR PHONE
	{
		id: "3A",
		scene: "On your phone",
		kind: "3d",
		seconds: 4,
		description: "The foldable iPhone rises into the bright studio, closed, then unfolds open. On screen: a Claude chat.",
		sound: "Soft hinge sound on the unfold.",
	},
	{
		id: "3B",
		scene: "On your phone",
		kind: "screen",
		seconds: 6,
		description: "Phone screen, step by step: Share, Copy link, open Kontinue, Import shared link, paste, Import chat. The whole thread appears with 'Context kept'.",
		sound: "Taps on the beat, a soft success chime.",
	},
	{
		id: "3C",
		scene: "On your phone",
		kind: "motion",
		seconds: 3,
		description: "The phone slides aside. Type beside it.",
		text: "Bring the whole conversation. Every detail.",
	},

	// 4. ON YOUR MAC
	{
		id: "4A",
		scene: "On your Mac",
		kind: "3d",
		seconds: 4,
		description: "Back to the MacBook in the bright studio, slow push in. On screen: the Kontinue desktop app, Kode tab.",
		sound: "Music builds.",
	},
	{
		id: "4B",
		scene: "On your Mac",
		kind: "screen",
		seconds: 7,
		description: "Kontinue desktop: Import session, 'Continue work from Claude Code or Codex', pick the session, Continue in: current project, Import. The session rebuilds: files, plan, progress.",
		sound: "Clicks land on the beat.",
	},
	{
		id: "4C",
		scene: "On your Mac",
		kind: "screen",
		seconds: 5,
		description: "One message: 'pick up where we left off'. Kode carries on mid-task with the same context. Tasks tick off, '20 passed'.",
		sound: "Music at full energy.",
	},

	// 5. KEEP GOING
	{
		id: "5A",
		scene: "Keep going",
		kind: "3d",
		seconds: 4.5,
		description: "MacBook and foldable iPhone side by side in the studio, slow orbit, both showing Kontinue.",
		text: "Any chat. Any model. Keep going.",
	},
	{
		id: "5B",
		scene: "Keep going",
		kind: "motion",
		seconds: 3,
		description: "Clean type on the bright studio.",
		text: "Start free with K-AI 1.0.",
	},
	{
		id: "5C",
		scene: "Keep going",
		kind: "card",
		seconds: 4,
		description: "END CARD: Kontinue AI logo.",
		text: "Hit your limit? Keep going.",
		sound: "Last note rings out.",
	},
];

export const totalSeconds = shots.reduce((sum, s) => sum + s.seconds, 0);
