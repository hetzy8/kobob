import sharp from "sharp";
import { expect, it } from "vitest";
import { makeDisplayCopy, makeThumbnail } from "../../src/import/derive";

const source = (format: "jpeg" | "tiff") =>
	sharp({
		create: { width: 3000, height: 1000, channels: 3, background: "#336699" },
	})
		.withExif({ IFD3: { GPSLatitude: "32/1 0/1 0/1" } })
		[format]()
		.toBuffer();

it("makes a small JPEG thumbnail without metadata", async () => {
	const input = await source("jpeg");
	expect((await sharp(input).metadata()).exif).toBeDefined();
	const result = await makeThumbnail(input);
	expect(result).toMatchObject({
		width: 400,
		height: 133,
		mimeType: "image/jpeg",
	});
	const meta = await sharp(result.bytes).metadata();
	expect(meta.format).toBe("jpeg");
	expect(meta.exif).toBeUndefined();
});

it("makes a display JPEG from a TIFF without enlarging or metadata", async () => {
	const result = await makeDisplayCopy(await source("tiff"));
	expect(result).toMatchObject({
		width: 2400,
		height: 800,
		mimeType: "image/jpeg",
	});
	expect((await sharp(result.bytes).metadata()).exif).toBeUndefined();
	const small = await sharp({
		create: { width: 100, height: 50, channels: 3, background: "#000" },
	})
		.tiff()
		.toBuffer();
	expect(await makeDisplayCopy(small)).toMatchObject({
		width: 100,
		height: 50,
	});
});

it("rejects corrupt input", async () => {
	await expect(makeThumbnail(Uint8Array.from([1, 2, 3]))).rejects.toThrow();
});
