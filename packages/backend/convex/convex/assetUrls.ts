import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const BLOB_HOST = ".blob.vercel-storage.com";

function assetUrl(toBase: string, key: string): string {
	const base = toBase.replace(/\/$/, "");
	const path = key.split("/").map(encodeURIComponent).join("/");
	return `${base}/${path}`;
}

function keyFromBlobUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (!parsed.hostname.endsWith(BLOB_HOST)) return null;
		return parsed.pathname
			.replace(/^\//, "")
			.split("/")
			.map((part) => decodeURIComponent(part))
			.join("/");
	} catch {
		return null;
	}
}

function rewriteBlobText(value: string, toBase: string): string {
	return value.replace(
		/https:\/\/[^\s"'<>]+?\.blob\.vercel-storage\.com\/[^\s"'<>]+/g,
		(url) => {
			const key = keyFromBlobUrl(url);
			return key ? assetUrl(toBase, key) : url;
		},
	);
}

export const rewriteBlobHosts = internalMutation({
	args: {
		toBase: v.string(),
		table: v.union(
			v.literal("files"),
			v.literal("canvasCreations"),
			v.literal("videoJobs"),
			v.literal("messages"),
		),
		cursor: v.union(v.string(), v.null()),
	},
	handler: async (ctx, args) => {
		const pageSize = 100;
		let cursor = args.cursor;
		let updated = 0;
		let isDone = false;
		let continueCursor = args.cursor ?? "";

		for (let batch = 0; batch < 20; batch += 1) {
			const page = await ctx.db.query(args.table).paginate({
				numItems: pageSize,
				cursor,
			});
			isDone = page.isDone;
			continueCursor = page.continueCursor;

			for (const row of page.page) {
			if (args.table === "files" && "blobUrl" in row) {
				if (!row.blobUrl.includes(BLOB_HOST)) continue;
				const nextUrl = assetUrl(args.toBase, row.pathname);
				if (nextUrl === row.blobUrl) continue;
				await ctx.db.patch(row._id, { blobUrl: nextUrl });
				updated += 1;
			}

			if (args.table === "canvasCreations" && "mediaUrl" in row) {
				const patch: { mediaUrl?: string; referenceImageUrl?: string } = {};
				if (row.mediaUrl.includes(BLOB_HOST)) {
					patch.mediaUrl = assetUrl(args.toBase, row.pathname);
				}
				if (row.referenceImageUrl?.includes(BLOB_HOST)) {
					const key = keyFromBlobUrl(row.referenceImageUrl);
					if (key) patch.referenceImageUrl = assetUrl(args.toBase, key);
				}
				if (patch.mediaUrl || patch.referenceImageUrl) {
					await ctx.db.patch(row._id, patch);
					updated += 1;
				}
			}

			if (
				args.table === "videoJobs" &&
				"finalUrl" in row &&
				row.finalUrl?.includes(BLOB_HOST)
			) {
				const key = keyFromBlobUrl(row.finalUrl);
				if (!key) continue;
				await ctx.db.patch(row._id, { finalUrl: assetUrl(args.toBase, key) });
				updated += 1;
			}

			if (args.table === "messages" && "content" in row) {
				if (!row.content.includes(BLOB_HOST)) continue;
				const content = rewriteBlobText(row.content, args.toBase);
				if (content === row.content) continue;
				await ctx.db.patch(row._id, { content });
				updated += 1;
			}
			}

			if (isDone) break;
			cursor = continueCursor;
		}

		return { updated, isDone, continueCursor };
	},
});

export const sampleAssetHosts = internalQuery({
	args: {},
	handler: async (ctx) => {
		const files = await ctx.db.query("files").take(8);
		const creations = await ctx.db.query("canvasCreations").take(8);
		const hostOf = (url: string) => {
			try {
				return new URL(url).hostname;
			} catch {
				return "unparsed";
			}
		};
		return {
			fileHosts: files.map((row) => hostOf(row.blobUrl)),
			creationHosts: creations.map((row) => hostOf(row.mediaUrl)),
		};
	},
});
