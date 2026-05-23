"use node";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOAD_URL_TTL_SECONDS = 15 * 60; // 15 minutes
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

let cachedClient: S3Client | null = null;
let cachedBucket: string | null = null;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it via 'bunx convex env set ${name} <value>'.`,
    );
  }
  return value;
}

function client(): { s3: S3Client; bucket: string } {
  if (cachedClient && cachedBucket) {
    return { s3: cachedClient, bucket: cachedBucket };
  }
  const accountId = getEnv("R2_ACCOUNT_ID");
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");
  const bucket = getEnv("R2_BUCKET");

  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // R2 supports virtual-host style but path-style is more predictable for presigning.
    forcePathStyle: true,
  });
  cachedBucket = bucket;
  return { s3: cachedClient, bucket };
}

export function importKey(userId: string, jobId: string, extension: string): string {
  // Sanitize the extension to avoid `..`/`/` injection in case it ever comes from user input.
  const safeExt = extension.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8) || "json";
  return `imports/${userId}/${jobId}.${safeExt}`;
}

export function parsedKey(userId: string, jobId: string): string {
  return `imports/${userId}/${jobId}.parsed.json`;
}

export function exportKey(userId: string, exportId: string, format: string): string {
  const ext =
    format === "json" ? "json" : format === "markdown" ? "md" : "zip";
  return `exports/${userId}/${exportId}.${ext}`;
}

// Signed PUT for the browser to upload directly to R2.
// `contentType` and `contentLength` are signed in — the upload is rejected if
// the actual request differs, so the client can't sneak a larger file past
// the plan-tier limit we enforced when issuing the URL.
export async function createPresignedUploadUrl(args: {
  key: string;
  contentType: string;
  contentLength: number;
}): Promise<string> {
  const { s3, bucket } = client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: args.key,
    ContentType: args.contentType,
    ContentLength: args.contentLength,
  });
  return await getSignedUrl(s3, command, {
    expiresIn: UPLOAD_URL_TTL_SECONDS,
    unhoistableHeaders: new Set(["content-length"]),
  });
}

export async function createPresignedDownloadUrl(args: {
  key: string;
  filename?: string;
}): Promise<string> {
  const { s3, bucket } = client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: args.key,
    ResponseContentDisposition: args.filename
      ? `attachment; filename="${args.filename.replace(/"/g, "")}"`
      : undefined,
  });
  return await getSignedUrl(s3, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const { s3, bucket } = client();
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const body = response.Body;
  if (!body) throw new Error(`Object ${key} not found.`);
  // Body is a Web ReadableStream in Node 18+.
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function putObjectBytes(args: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<void> {
  const { s3, bucket } = client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
      ContentLength: args.body.byteLength,
    }),
  );
}

export async function headObject(key: string): Promise<{ size: number } | null> {
  const { s3, bucket } = client();
  try {
    const response = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return { size: response.ContentLength ?? 0 };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  const { s3, bucket } = client();
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // best-effort
  }
}
