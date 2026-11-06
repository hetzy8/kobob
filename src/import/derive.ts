import sharp from "sharp";

export type Derived = {
	bytes: Uint8Array;
	width: number;
	height: number;
	mimeType: "image/jpeg";
};

// sharp drops embedded metadata such as GPS unless asked to keep it.
async function toJpeg(
	input: Uint8Array,
	maxWidth: number,
	quality: number,
): Promise<Derived> {
	const { data, info } = await sharp(input, { failOn: "error" })
		.rotate()
		.resize({
			width: maxWidth,
			height: maxWidth,
			fit: "inside",
			withoutEnlargement: true,
		})
		.flatten({ background: "#ffffff" })
		.jpeg({ quality })
		.toBuffer({ resolveWithObject: true });
	return {
		bytes: data,
		width: info.width,
		height: info.height,
		mimeType: "image/jpeg",
	};
}
export const makeThumbnail = (input: Uint8Array) => toJpeg(input, 400, 75);
export const makeDisplayCopy = (input: Uint8Array) => toJpeg(input, 2400, 85);
