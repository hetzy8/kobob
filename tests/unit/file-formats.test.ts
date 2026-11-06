import { expect, it } from "vitest";
import {
	needsDisplayCopy,
	needsThumbnail,
	verifiedMimeType,
} from "../../src/import/file-formats";

const magic: Record<string, number[]> = {
	"image/jpeg": [0xff, 0xd8, 0xff, 0xe0],
	"image/png": [0x89, 0x50, 0x4e, 0x47],
	"image/gif": [0x47, 0x49, 0x46, 0x38],
	"application/pdf": [0x25, 0x50, 0x44, 0x46],
	"image/tiff": [0x49, 0x49, 0x2a, 0x00],
};
it.each(Object.entries(magic))(
	"keeps %s when the bytes agree",
	(mime, bytes) => {
		expect(verifiedMimeType(mime, Uint8Array.from(bytes))).toBe(mime);
	},
);
it("accepts both MP3 openings", () => {
	expect(
		verifiedMimeType("audio/mpeg", Uint8Array.from([0x49, 0x44, 0x33, 0x04])),
	).toBe("audio/mpeg");
	expect(
		verifiedMimeType("audio/mpeg", Uint8Array.from([0xff, 0xfb, 0x90, 0x00])),
	).toBe("audio/mpeg");
});
it("accepts big-endian TIFF", () => {
	expect(
		verifiedMimeType("image/tiff", Uint8Array.from([0x4d, 0x4d, 0x00, 0x2a])),
	).toBe("image/tiff");
});
it.each(Object.keys(magic))("downgrades a spoofed %s", (mime) => {
	expect(
		verifiedMimeType(mime, Uint8Array.from([0x3c, 0x68, 0x74, 0x6d])),
	).toBe("application/octet-stream");
});
it("leaves formats it cannot verify unchanged, since they download anyway", () => {
	expect(
		verifiedMimeType("application/msword", Uint8Array.from([0, 0, 0, 0])),
	).toBe("application/msword");
});
it("derives from raster images except BMP", () => {
	for (const mime of ["image/jpeg", "image/png", "image/gif", "image/tiff"])
		expect(needsThumbnail(mime)).toBe(true);
	expect(needsThumbnail("image/bmp")).toBe(false);
	expect(needsThumbnail("application/pdf")).toBe(false);
	expect(needsDisplayCopy("image/tiff")).toBe(true);
	expect(needsDisplayCopy("image/jpeg")).toBe(false);
});
