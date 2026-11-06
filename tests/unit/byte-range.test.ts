import { expect, it } from "vitest";
import { MAX_RANGE_BYTES, parseRange } from "../../src/lib/byte-range";

const size = 100 * 1024 * 1024;
it("treats a missing header as the full file", () => {
	expect(parseRange(null, size)).toEqual({ kind: "full" });
});
it("caps an open-ended range", () => {
	expect(parseRange("bytes=0-", size)).toEqual({
		kind: "partial",
		start: 0,
		end: MAX_RANGE_BYTES - 1,
	});
});
it("keeps a small explicit range", () => {
	expect(parseRange("bytes=10-19", size)).toEqual({
		kind: "partial",
		start: 10,
		end: 19,
	});
});
it("clamps to the end of the file", () => {
	expect(parseRange("bytes=5-999", 10)).toEqual({
		kind: "partial",
		start: 5,
		end: 9,
	});
});
it("supports a suffix range", () => {
	expect(parseRange("bytes=-4", 10)).toEqual({
		kind: "partial",
		start: 6,
		end: 9,
	});
});
it.each([
	"bytes=20-",
	"bytes=9-3",
	"bytes=abc",
	"items=0-1",
	"bytes=0-1,3-4",
	"bytes=-0",
	"bytes=-",
])("rejects %s", (header) => {
	expect(parseRange(header, 10)).toEqual({ kind: "invalid" });
});
