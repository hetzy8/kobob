import "server-only";
import type { MemberContext } from "../lib/auth-system";
import { parseRange } from "../lib/byte-range";
import type { Database } from "../lib/database";
import type { ObjectStorage } from "../lib/storage";

// Anything else downloads with a neutral type, including active formats.
const INLINE_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/gif",
	"application/pdf",
	"audio/mpeg",
]);
const SANDBOX = "default-src 'none'; sandbox";
// Chrome's PDF viewer does not load under a sandbox policy.
const PDF_POLICY =
	"default-src 'none'; style-src 'unsafe-inline'; object-src 'self'";

const isAccessError = (error: unknown) =>
	error instanceof Error &&
	["UNAUTHORIZED", "FORBIDDEN"].includes(error.message);
const empty = (status: number, headers: Record<string, string> = {}) =>
	new Response(null, {
		status,
		headers: { "Cache-Control": "private, no-store", ...headers },
	});

function disposition(inline: boolean, filename: string) {
	return `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function createMediaReader(
	db: Database,
	requireMember: () => Promise<MemberContext>,
	storage: () => ObjectStorage,
) {
	return {
		async read(id: string, rangeHeader: string | null): Promise<Response> {
			try {
				await requireMember();
			} catch (error) {
				return empty(isAccessError(error) ? 404 : 503);
			}
			try {
				const file = await db.mediaFile.findUnique({ where: { id } });
				if (file?.status !== "verified") return empty(404);
				const size = Number(file.sizeBytes);
				const range = parseRange(rangeHeader, size);
				if (range.kind === "invalid")
					return empty(416, { "Content-Range": `bytes */${size}` });
				const inline = INLINE_TYPES.has(file.mimeType);
				const headers: Record<string, string> = {
					"Cache-Control": "private, no-store",
					"X-Content-Type-Options": "nosniff",
					"Accept-Ranges": "bytes",
					"Content-Type": inline ? file.mimeType : "application/octet-stream",
					"Content-Disposition": disposition(inline, file.originalFilename),
					"Content-Security-Policy":
						file.mimeType === "application/pdf" ? PDF_POLICY : SANDBOX,
				};
				const objects = storage();
				if (range.kind === "partial") {
					const body = await objects.read(file.storageKey, {
						start: range.start,
						end: range.end,
					});
					return new Response(body, {
						status: 206,
						headers: {
							...headers,
							"Content-Length": String(range.end - range.start + 1),
							"Content-Range": `bytes ${range.start}-${range.end}/${size}`,
						},
					});
				}
				const body = await objects.read(file.storageKey);
				return new Response(body, {
					status: 200,
					headers: { ...headers, "Content-Length": String(size) },
				});
			} catch {
				return empty(503);
			}
		},
	};
}
