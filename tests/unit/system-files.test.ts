import { expect, it } from "vitest";
import { confirmSystemFile, isSystemFileName } from "../../src/import/system-files";

const appleDouble = Uint8Array.from([0x00, 0x05, 0x16, 0x07, 0, 2, 0, 0]);
const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

it("recognizes candidate names", () => {
	expect(isSystemFileName("._photo.jpg")).toBe(true);
	expect(isSystemFileName("Thumbs.db")).toBe(true);
	expect(isSystemFileName("thumbs.DB")).toBe(true);
	expect(isSystemFileName("~$letter.doc")).toBe(true);
	expect(isSystemFileName("photo.jpg")).toBe(false);
	expect(isSystemFileName("._")).toBe(false);
});
it("confirms only by content", () => {
	expect(confirmSystemFile("._photo.jpg", 4096n, appleDouble)).toBe(true);
	expect(confirmSystemFile("Thumbs.db", 20000n, ole)).toBe(true);
	expect(confirmSystemFile("~$letter.doc", 162n, jpeg)).toBe(true);
});
it("keeps a real file with a system-like name", () => {
	expect(confirmSystemFile("._photo.jpg", 500000n, jpeg)).toBe(false);
	expect(confirmSystemFile("Thumbs.db", 20000n, jpeg)).toBe(false);
	expect(confirmSystemFile("~$letter.doc", 900000n, jpeg)).toBe(false);
	expect(confirmSystemFile("photo.jpg", 4096n, appleDouble)).toBe(false);
});
