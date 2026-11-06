import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

export type ObjectStorage = {
	read(key: string, range?: { start: number; end: number }): Promise<ReadableStream<Uint8Array>>;
	write(key: string, body: ReadableStream<Uint8Array> | Uint8Array, contentType: string): Promise<void>;
};

// No signed-link method on purpose: every read goes through the media service
// so access is checked on every request (spec 2026-11-05).
export function createR2Storage(config: {
	endpoint: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
}): ObjectStorage {
	const client = new S3Client({
		region: "auto",
		endpoint: config.endpoint,
		credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
		requestChecksumCalculation: "WHEN_REQUIRED",
		responseChecksumValidation: "WHEN_REQUIRED",
	});
	return {
		async read(key, range) {
			const { Body } = await client.send(
				new GetObjectCommand({
					Bucket: config.bucket,
					Key: key,
					...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
				}),
			);
			if (!Body) throw new Error("STORAGE_EMPTY");
			return Body.transformToWebStream() as ReadableStream<Uint8Array>;
		},
		async write(key, body, contentType) {
			await new Upload({
				client,
				params: { Bucket: config.bucket, Key: key, Body: body, ContentType: contentType },
			}).done();
		},
	};
}
