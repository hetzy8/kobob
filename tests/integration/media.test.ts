import { afterAll, beforeEach, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import { createDatabase } from "../../src/lib/database";
import type { ObjectStorage } from "../../src/lib/storage";
import { createMediaReader } from "../../src/services/media";

const db = createDatabase(requireTestDatabaseUrl(process.env));
beforeEach(async () => {
	await db.item.deleteMany();
});
afterAll(async () => {
	await db.item.deleteMany();
	await db.$disconnect();
});

const bytes = new TextEncoder().encode("0123456789");
const reads: Array<{ key: string; range?: { start: number; end: number } }> = [];
const storage: ObjectStorage = {
	read: async (key, range) => {
		reads.push({ key, range });
		const part = range ? bytes.slice(range.start, range.end + 1) : bytes;
		return new Blob([part]).stream();
	},
	write: async () => {},
};
const member = async () => ({ id: "m", role: "member" as const, accessVersion: 1 });
const reader = (auth: typeof member = member, store: () => ObjectStorage = () => storage) =>
	createMediaReader(db, auth, store);

async function file(extra: { mimeType?: string; status?: "pending" | "verified" | "failed"; originalFilename?: string } = {}) {
	const item = await db.item.create({ data: {} });
	return db.mediaFile.create({
		data: {
			itemId: item.id,
			role: "original",
			storageKey: `originals/${item.id}`,
			sizeBytes: 10n,
			mimeType: extra.mimeType ?? "image/jpeg",
			status: extra.status ?? "verified",
			originalFilename: extra.originalFilename ?? "synthetic.jpg",
		},
	});
}

it("serves a verified file privately with safe headers and no storage key", async () => {
	const { id } = await file();
	const response = await reader().read(id, null);
	expect(response.status).toBe(200);
	expect(response.headers.get("cache-control")).toBe("private, no-store");
	expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	expect(response.headers.get("content-type")).toBe("image/jpeg");
	expect(response.headers.get("content-disposition")).toMatch(/^inline/);
	expect(response.headers.get("content-length")).toBe("10");
	expect(response.headers.get("accept-ranges")).toBe("bytes");
	expect(response.headers.get("content-security-policy")).toContain("sandbox");
	expect(JSON.stringify([...response.headers])).not.toContain("originals/");
	expect(await response.text()).toBe("0123456789");
});

it.each(["UNAUTHORIZED", "FORBIDDEN"])("gives %s the same 404 as an unknown id, with or without a range", async (message) => {
	const { id } = await file();
	const denied = reader(async () => {
		throw new Error(message);
	});
	const before = reads.length;
	const responses = [await denied.read(id, null), await denied.read(id, "bytes=0-1"), await denied.read("missing", null)];
	expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
	expect(reads.length).toBe(before);
});

it("checks access again on every range request", async () => {
	const { id } = await file();
	let allowed = true;
	const reading = reader(async () => {
		if (!allowed) throw new Error("FORBIDDEN");
		return { id: "m", role: "member" as const, accessVersion: 1 };
	});
	expect((await reading.read(id, "bytes=0-1")).status).toBe(206);
	allowed = false;
	expect((await reading.read(id, "bytes=2-3")).status).toBe(404);
});

it.each(["pending", "failed"] as const)("does not serve a %s file", async (status) => {
	const { id } = await file({ status });
	expect((await reader().read(id, null)).status).toBe(404);
});

it("returns 206 with a content range", async () => {
	const { id } = await file();
	const response = await reader().read(id, "bytes=2-5");
	expect(response.status).toBe(206);
	expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
	expect(response.headers.get("content-length")).toBe("4");
	expect(await response.text()).toBe("2345");
});

it("returns 416 for an unsatisfiable range", async () => {
	const { id } = await file();
	const response = await reader().read(id, "bytes=50-");
	expect(response.status).toBe(416);
	expect(response.headers.get("content-range")).toBe("bytes */10");
});

it.each(["text/html", "image/svg+xml", "multipart/related", "application/msword", "image/tiff"])(
	"sends %s as an attachment with a neutral type",
	async (mimeType) => {
		const { id } = await file({ mimeType, originalFilename: "שם קובץ.bin" });
		const response = await reader().read(id, null);
		expect(response.headers.get("content-type")).toBe("application/octet-stream");
		expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename\*=UTF-8''/);
	},
);

it.each(["image/jpeg", "image/png", "image/gif", "application/pdf", "audio/mpeg"])("sends %s inline", async (mimeType) => {
	const { id } = await file({ mimeType });
	const response = await reader().read(id, null);
	expect(response.headers.get("content-type")).toBe(mimeType);
	expect(response.headers.get("content-disposition")).toMatch(/^inline/);
});

it("answers 503 without detail when storage is not configured", async () => {
	const { id } = await file();
	const response = await reader(member, () => {
		throw new Error("Missing or invalid R2_BUCKET");
	}).read(id, null);
	expect(response.status).toBe(503);
	expect(await response.text()).toBe("");
});

it("answers 503 when an access check fails for another reason", async () => {
	const { id } = await file();
	const response = await reader(async () => {
		throw new Error("database down");
	}).read(id, null);
	expect(response.status).toBe(503);
});
