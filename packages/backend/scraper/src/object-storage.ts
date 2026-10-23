import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type ObjectStorageConfig = {
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	publicBaseUrl: string;
};

function publicUrl(publicBaseUrl: string, key: string): string {
	const base = publicBaseUrl.replace(/\/$/, "");
	const path = key.split("/").map(encodeURIComponent).join("/");
	return `${base}/${path}`;
}

export async function putPublicObject(
	config: ObjectStorageConfig,
	key: string,
	body: Uint8Array,
	contentType: string,
): Promise<{ url: string; pathname: string }> {
	const s3 = new S3Client({
		region: config.region,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
	});
	await s3.send(
		new PutObjectCommand({
			Bucket: config.bucket,
			Key: key,
			Body: body,
			ContentType: contentType,
			CacheControl: "public, max-age=31536000, immutable",
		}),
	);
	return { url: publicUrl(config.publicBaseUrl, key), pathname: key };
}
