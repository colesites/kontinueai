import { readFileSync } from "node:fs";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function loadEnv(path: string) {
	const text = readFileSync(path, "utf8");
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const separator = trimmed.indexOf("=");
		if (separator < 0) continue;
		const key = trimmed.slice(0, separator);
		let value = trimmed.slice(separator + 1);
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (!process.env[key]) process.env[key] = value;
	}
}

loadEnv(new URL("../.env", import.meta.url));
loadEnv(new URL("../.env.local", import.meta.url));

const token = process.env.BLOB_READ_WRITE_TOKEN;
const bucket = process.env.AWS_S3_BUCKET;
const region = process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
if (!token || !bucket || !region || !accessKeyId || !secretAccessKey) {
	throw new Error("Missing Blob token or AWS settings.");
}

const s3 = new S3Client({
	region,
	credentials: { accessKeyId, secretAccessKey },
});

type BlobItem = { url: string; pathname: string };

async function listAll(): Promise<BlobItem[]> {
	const items: BlobItem[] = [];
	let cursor: string | undefined;
	do {
		const url = new URL("https://vercel.com/api/v2/blob");
		url.searchParams.set("limit", "1000");
		if (cursor) url.searchParams.set("cursor", cursor);
		const response = await fetch(url, {
			headers: { authorization: `Bearer ${token}` },
		});
		if (!response.ok) {
			throw new Error(`Blob list failed (${response.status}).`);
		}
		const page = (await response.json()) as {
			blobs: BlobItem[];
			cursor?: string;
			hasMore: boolean;
		};
		items.push(...page.blobs);
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor);
	return items;
}

async function alreadyStored(key: string): Promise<boolean> {
	try {
		await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
		return true;
	} catch {
		return false;
	}
}

const blobs = await listAll();
let copied = 0;
let skipped = 0;
for (const blob of blobs) {
	if (await alreadyStored(blob.pathname)) {
		skipped += 1;
		continue;
	}
	const file = await fetch(blob.url);
	if (!file.ok) {
		throw new Error(`Download failed for ${blob.pathname} (${file.status}).`);
	}
	const body = new Uint8Array(await file.arrayBuffer());
	await s3.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: blob.pathname,
			Body: body,
			ContentType: file.headers.get("content-type") ?? "application/octet-stream",
			CacheControl: "public, max-age=31536000, immutable",
		}),
	);
	copied += 1;
	console.log(`copied ${blob.pathname}`);
}

console.log(`done copied=${copied} skipped=${skipped} total=${blobs.length}`);
