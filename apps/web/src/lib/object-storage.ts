import {
	DeleteObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";

export type ObjectStorageConfig = {
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	publicBaseUrl: string;
};

let cachedClient: S3Client | null = null;

export function objectStorageConfigFromEnv(): ObjectStorageConfig | null {
	const region = process.env.AWS_REGION;
	const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
	const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
	const bucket = process.env.AWS_S3_BUCKET;
	const publicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL;
	if (
		!region ||
		!accessKeyId ||
		!secretAccessKey ||
		!bucket ||
		!publicBaseUrl
	) {
		return null;
	}
	return { region, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

function client(): { s3: S3Client; config: ObjectStorageConfig } {
	const config = objectStorageConfigFromEnv();
	if (!config) {
		throw new Error("Object storage is not configured.");
	}
	if (!cachedClient) {
		cachedClient = new S3Client({
			region: config.region,
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey,
			},
		});
	}
	return { s3: cachedClient, config };
}

function publicUrl(publicBaseUrl: string, key: string): string {
	const base = publicBaseUrl.replace(/\/$/, "");
	const path = key.split("/").map(encodeURIComponent).join("/");
	return `${base}/${path}`;
}

async function bodyBytes(
	body: Blob | Buffer | Uint8Array,
): Promise<Uint8Array> {
	if (body instanceof Uint8Array) return body;
	return new Uint8Array(await body.arrayBuffer());
}

export async function putPublicObject(
	key: string,
	body: Blob | Buffer | Uint8Array,
	contentType: string,
): Promise<{ url: string; pathname: string }> {
	const { s3, config } = client();
	const bytes = await bodyBytes(body);
	await s3.send(
		new PutObjectCommand({
			Bucket: config.bucket,
			Key: key,
			Body: bytes,
			ContentType: contentType,
			CacheControl: "public, max-age=31536000, immutable",
		}),
	);
	return { url: publicUrl(config.publicBaseUrl, key), pathname: key };
}

export async function deletePublicObject(key: string): Promise<void> {
	const { s3, config } = client();
	await s3.send(
		new DeleteObjectCommand({
			Bucket: config.bucket,
			Key: key,
		}),
	);
}
