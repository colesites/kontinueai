// Lists the clips, stills and audio in public/ so the timeline knows which
// shots are ready and which still need a placeholder slate.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const list = (dir: string) => {
	const full = join(root, "public", dir);
	if (!existsSync(full)) return [];
	return readdirSync(full)
		.filter((f) => !f.startsWith("."))
		.map((f) => `${dir}/${f}`);
};

const assets = [...list("audio")];
mkdirSync(join(root, "src/generated"), { recursive: true });
writeFileSync(
	join(root, "src/generated/assets.json"),
	`${JSON.stringify(assets, null, "\t")}\n`,
);
console.log(`Found ${assets.length} asset(s) in public/`);
