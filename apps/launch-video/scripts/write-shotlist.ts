// Builds SHOTLIST.md (the storyboard) from src/shots.ts so the doc and the
// edit can never drift apart.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { shots, totalSeconds } from "../src/shots";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const how = { "3d": "3D (Remotion)", screen: "UI screen (React)", motion: "Motion graphics (React)", card: "End card (React)" };

const lines = [
	"# Keep going: storyboard",
	"",
	"Generated from `src/shots.ts` by `bun run storyboard`. Edit that file, not this one.",
	"",
	`An Apple keynote style product film: no people, devices in a bright studio, real apps on screen. Runtime about ${Math.round(totalSeconds)}s. ${shots.filter((s) => s.kind === "3d").length} 3D shots, everything built in Remotion.`,
	"",
];

let t = 0;
let scene = "";
for (const s of shots) {
	if (s.scene !== scene) {
		scene = s.scene;
		lines.push(`## ${scene}`, "");
	}
	lines.push(`**${s.id}** · ${fmt(t)} to ${fmt(t + s.seconds)} · ${how[s.kind]}`, "", s.description, "");
	if (s.text) lines.push(`> **On screen:** ${s.text}`, "");
	if (s.sound) lines.push(`*Sound:* ${s.sound}`, "");
	t += s.seconds;
}

writeFileSync(join(import.meta.dir, "..", "SHOTLIST.md"), `${lines.join("\n")}\n`);
console.log(`Wrote SHOTLIST.md (${shots.length} shots, ${Math.round(totalSeconds)}s)`);
