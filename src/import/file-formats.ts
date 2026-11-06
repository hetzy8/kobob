type Check = (head: Uint8Array) => boolean;
const opens =
	(...bytes: number[]): Check =>
	(head) =>
		bytes.every((byte, index) => head[index] === byte);
const verifiers: Record<string, Check[]> = {
	"image/jpeg": [opens(0xff, 0xd8, 0xff)],
	"image/png": [opens(0x89, 0x50, 0x4e, 0x47)],
	"image/gif": [opens(0x47, 0x49, 0x46, 0x38)],
	"application/pdf": [opens(0x25, 0x50, 0x44, 0x46)],
	"image/tiff": [opens(0x49, 0x49, 0x2a, 0x00), opens(0x4d, 0x4d, 0x00, 0x2a)],
	"audio/mpeg": [
		opens(0x49, 0x44, 0x33),
		(head) => head[0] === 0xff && (head[1] & 0xe0) === 0xe0,
	],
};

// A claimed type that could display inline must match its bytes; otherwise the
// file is stored as neutral and only ever downloads.
export function verifiedMimeType(claimed: string, head: Uint8Array): string {
	const checks = verifiers[claimed];
	if (!checks) return claimed;
	return checks.some((check) => check(head))
		? claimed
		: "application/octet-stream";
}

const RASTER = new Set(["image/jpeg", "image/png", "image/gif", "image/tiff"]);
export const needsThumbnail = (mime: string) => RASTER.has(mime);
export const needsDisplayCopy = (mime: string) => mime === "image/tiff";
