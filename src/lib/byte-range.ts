// Chunks stay short enough for one function invocation; players ask for the next.
export const MAX_RANGE_BYTES = 8 * 1024 * 1024;

export type ParsedRange =
	| { kind: "full" }
	| { kind: "partial"; start: number; end: number }
	| { kind: "invalid" };

export function parseRange(header: string | null, size: number): ParsedRange {
	if (header === null) return { kind: "full" };
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match || (match[1] === "" && match[2] === "")) return { kind: "invalid" };
	let start: number;
	let end: number;
	if (match[1] === "") {
		const suffix = Number(match[2]);
		if (suffix === 0) return { kind: "invalid" };
		start = Math.max(size - suffix, 0);
		end = size - 1;
	} else {
		start = Number(match[1]);
		end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
	}
	if (start >= size || end < start) return { kind: "invalid" };
	return { kind: "partial", start, end: Math.min(end, start + MAX_RANGE_BYTES - 1) };
}
