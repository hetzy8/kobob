import { createHash } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeEach, expect, it } from "vitest";
import { catalog as c } from "../../src/import/catalog-columns";
import { copyMedia } from "../../src/import/copy-media";
import type { DriveClient } from "../../src/import/drive";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import { createDatabase } from "../../src/lib/database";
import type { ObjectStorage } from "../../src/lib/storage";

const db = createDatabase(requireTestDatabaseUrl(process.env));
const clean = async () => {
	await db.importRun.deleteMany();
	await db.item.deleteMany();
};
beforeEach(clean);
afterAll(async () => {
	await clean();
	await db.$disconnect();
});

const toStream = (bytes: Uint8Array) => new Blob([bytes as BlobPart]).stream();
const collect = async (body: ReadableStream<Uint8Array> | Uint8Array) =>
	body instanceof Uint8Array
		? body
		: new Uint8Array(await new Response(body).arrayBuffer());
function fakeStorage(tamper?: (key: string, bytes: Uint8Array) => Uint8Array) {
	const objects = new Map<string, Uint8Array>();
	const storage: ObjectStorage = {
		read: async (key) => toStream(objects.get(key) as Uint8Array),
		write: async (key, body) => {
			const bytes = await collect(body);
			objects.set(key, tamper ? tamper(key, bytes) : bytes);
		},
	};
	return { objects, storage };
}
const fakeDrive = (files: Record<string, Uint8Array>): DriveClient => ({
	readHead: async (id) => files[id].slice(0, 16),
	readStream: async (id) => {
		if (!files[id]) throw new Error("DRIVE_READ_FAILED_404");
		return toStream(files[id]);
	},
});
async function pending(
	kobId: string,
	bytes: Uint8Array,
	mimeType: string,
	extra: { sha256?: string; size?: bigint } = {},
) {
	const item = await db.item.create({ data: { kobId } });
	await db.itemCatalogRecord.create({
		data: {
			itemId: item.id,
			tab: "catalog",
			snapshotHash: "h",
			row: { catalog: { [c.driveId]: kobId }, web: null },
		},
	});
	return db.mediaFile.create({
		data: {
			itemId: item.id,
			role: "original",
			storageKey: `originals/${item.id}`,
			mimeType,
			sizeBytes: extra.size ?? BigInt(bytes.length),
			sha256: extra.sha256,
			originalFilename: "synthetic",
		},
	});
}
const jpeg = () =>
	sharp({
		create: { width: 800, height: 400, channels: 3, background: "#123" },
	})
		.jpeg()
		.toBuffer();
const tiff = () =>
	sharp({
		create: { width: 800, height: 400, channels: 3, background: "#123" },
	})
		.tiff()
		.toBuffer();

it("does nothing on a dry run", async () => {
	const bytes = await jpeg();
	await pending("KOB-000001", bytes, "image/jpeg");
	const { objects, storage } = fakeStorage();
	const report = await copyMedia(
		db,
		fakeDrive({ "KOB-000001": bytes }),
		storage,
		{ apply: false },
	);
	expect(report.considered).toBe(1);
	expect(objects.size).toBe(0);
	expect((await db.mediaFile.findFirstOrThrow()).status).toBe("pending");
});

it("copies, hashes and verifies an original and creates a thumbnail", async () => {
	const bytes = await jpeg();
	const original = await pending("KOB-000001", bytes, "image/jpeg");
	const { objects, storage } = fakeStorage();
	const report = await copyMedia(
		db,
		fakeDrive({ "KOB-000001": bytes }),
		storage,
		{ apply: true },
	);
	expect(report.verified).toBe(1);
	const stored = await db.mediaFile.findUniqueOrThrow({
		where: { id: original.id },
	});
	expect(stored.status).toBe("verified");
	expect(stored.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
	const thumbnail = await db.mediaFile.findFirstOrThrow({
		where: { itemId: original.itemId, role: "thumbnail" },
	});
	expect(thumbnail).toMatchObject({
		status: "verified",
		mimeType: "image/jpeg",
		width: 400,
	});
	expect(objects.has(thumbnail.storageKey)).toBe(true);
	expect(
		await db.mediaFile.count({
			where: { itemId: original.itemId, role: "display" },
		}),
	).toBe(0);
	expect(report.copied).toEqual([{ kobId: "KOB-000001", fileId: original.id }]);
});

it("creates a display copy for a TIFF", async () => {
	const bytes = await tiff();
	const original = await pending("KOB-000002", bytes, "image/tiff");
	const { storage } = fakeStorage();
	await copyMedia(db, fakeDrive({ "KOB-000002": bytes }), storage, {
		apply: true,
	});
	expect(
		await db.mediaFile.count({
			where: { itemId: original.itemId, role: "display", status: "verified" },
		}),
	).toBe(1);
});

it("records a size mismatch as failed", async () => {
	const bytes = await jpeg();
	await pending("KOB-000003", bytes, "image/jpeg", { size: 1n });
	const { storage } = fakeStorage();
	const report = await copyMedia(
		db,
		fakeDrive({ "KOB-000003": bytes }),
		storage,
		{ apply: true },
	);
	expect(report.failed).toEqual([
		{ kobId: "KOB-000003", code: "SIZE_MISMATCH" },
	]);
	expect(await db.mediaFile.findFirstOrThrow()).toMatchObject({
		status: "failed",
		failureCode: "SIZE_MISMATCH",
	});
});

it("records a mismatch against a cataloged hash", async () => {
	const bytes = await jpeg();
	await pending("KOB-000004", bytes, "image/jpeg", { sha256: "0".repeat(64) });
	const { storage } = fakeStorage();
	const report = await copyMedia(
		db,
		fakeDrive({ "KOB-000004": bytes }),
		storage,
		{ apply: true },
	);
	expect(report.failed[0].code).toBe("HASH_MISMATCH");
});

it("fails when the stored bytes differ on read-back", async () => {
	const bytes = await jpeg();
	await pending("KOB-000005", bytes, "image/jpeg");
	const { storage } = fakeStorage((key, written) =>
		key.startsWith("originals/") ? written.slice(1) : written,
	);
	const report = await copyMedia(
		db,
		fakeDrive({ "KOB-000005": bytes }),
		storage,
		{ apply: true },
	);
	expect(report.failed[0].code).toBe("VERIFY_MISMATCH");
});

it("keeps a failed Drive read explicit and retries it on the next run", async () => {
	const bytes = await jpeg();
	await pending("KOB-000006", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	expect(
		(await copyMedia(db, fakeDrive({}), storage, { apply: true })).failed[0]
			.code,
	).toBe("DRIVE_READ_FAILED");
	const retry = await copyMedia(
		db,
		fakeDrive({ "KOB-000006": bytes }),
		storage,
		{ apply: true },
	);
	expect(retry.verified).toBe(1);
	expect(
		await db.mediaFile.findFirstOrThrow({ where: { role: "original" } }),
	).toMatchObject({ status: "verified", failureCode: null });
});

it("skips verified files on a rerun", async () => {
	const bytes = await jpeg();
	await pending("KOB-000007", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	const drive = fakeDrive({ "KOB-000007": bytes });
	await copyMedia(db, drive, storage, { apply: true });
	expect(
		(await copyMedia(db, drive, storage, { apply: true })).considered,
	).toBe(0);
});

it("stores a spoofed inline type as neutral", async () => {
	const bytes = new TextEncoder().encode("<html><script>x</script>");
	await pending("KOB-000008", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	await copyMedia(db, fakeDrive({ "KOB-000008": bytes }), storage, {
		apply: true,
	});
	expect((await db.mediaFile.findFirstOrThrow()).mimeType).toBe(
		"application/octet-stream",
	);
});

it("keeps a verified original when its derivative fails", async () => {
	const bytes = Buffer.concat([
		Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
		Buffer.alloc(20),
	]);
	await pending("KOB-000009", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	const report = await copyMedia(
		db,
		fakeDrive({ "KOB-000009": bytes }),
		storage,
		{ apply: true },
	);
	expect(report.verified).toBe(1);
	expect(report.derivativesFailed).toEqual([
		{ kobId: "KOB-000009", code: "DERIVATIVE_FAILED" },
	]);
});

it("honors a limit for a sample run and records counts only", async () => {
	const bytes = await jpeg();
	await pending("KOB-000010", bytes, "image/jpeg");
	await pending("KOB-000011", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	const report = await copyMedia(
		db,
		fakeDrive({ "KOB-000010": bytes, "KOB-000011": bytes }),
		storage,
		{ apply: true, limit: 1 },
	);
	expect(report.considered).toBe(1);
	const run = await db.importRun.findFirstOrThrow({ where: { kind: "media" } });
	expect(JSON.stringify(run.counts)).not.toContain("KOB-");
});

it("copies only the named items, whatever their size", async () => {
	const small = await jpeg();
	const large = Buffer.concat([small, Buffer.alloc(1000)]);
	await pending("KOB-000012", small, "image/jpeg");
	const named = await pending("KOB-000013", large, "image/jpeg");
	const { objects, storage } = fakeStorage();
	const drive = fakeDrive({ "KOB-000012": small, "KOB-000013": large });
	const report = await copyMedia(db, drive, storage, {
		apply: true,
		only: ["KOB-000013"],
	});
	expect(report.considered).toBe(1);
	expect(objects.has(named.storageKey)).toBe(true);
	expect(
		await db.mediaFile.count({
			where: { status: "verified", role: "original" },
		}),
	).toBe(1);
});

it("treats an empty list of named items as nothing to copy, never as everything", async () => {
	const bytes = await jpeg();
	await pending("KOB-000014", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	const report = await copyMedia(
		db,
		fakeDrive({ "KOB-000014": bytes }),
		storage,
		{ apply: true, only: [] },
	);
	expect(report.considered).toBe(0);
	expect(await db.mediaFile.count({ where: { status: "verified" } })).toBe(0);
});

it("reports named items with nothing left to copy", async () => {
	const bytes = await jpeg();
	await pending("KOB-000015", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	const drive = fakeDrive({ "KOB-000015": bytes });
	await copyMedia(db, drive, storage, { apply: true, only: ["KOB-000015"] });
	const rerun = await copyMedia(db, drive, storage, {
		apply: false,
		only: ["KOB-000015", "KOB-999999"],
	});
	expect(rerun.considered).toBe(0);
	expect(rerun.notPending).toEqual(["KOB-000015", "KOB-999999"]);
});

// Fails each write under `prefix` once, as a brief storage outage would.
function failOnce(storage: ObjectStorage, prefix: string): ObjectStorage {
	let failed = false;
	return {
		read: storage.read,
		write: async (key, body, contentType) => {
			if (key.startsWith(prefix) && !failed) {
				failed = true;
				throw new Error("synthetic outage");
			}
			await storage.write(key, body, contentType);
		},
	};
}

it("retries a missing thumbnail from storage on the next run, without Drive", async () => {
	const bytes = await jpeg();
	const original = await pending("KOB-000016", bytes, "image/jpeg");
	const { objects, storage } = fakeStorage();
	const first = await copyMedia(
		db,
		fakeDrive({ "KOB-000016": bytes }),
		failOnce(storage, "thumbnails/"),
		{ apply: true },
	);
	expect(first.derivativesFailed).toEqual([
		{ kobId: "KOB-000016", code: "DERIVATIVE_FAILED" },
	]);
	const retry = await copyMedia(db, fakeDrive({}), storage, { apply: true });
	expect(retry).toMatchObject({
		considered: 0,
		derivativesConsidered: 1,
		derivativesRepaired: 1,
		derivativesFailed: [],
	});
	const thumbnail = await db.mediaFile.findFirstOrThrow({
		where: { itemId: original.itemId, role: "thumbnail" },
	});
	expect(thumbnail.status).toBe("verified");
	expect(objects.has(thumbnail.storageKey)).toBe(true);
	const again = await copyMedia(db, fakeDrive({}), storage, { apply: true });
	expect(again.derivativesConsidered).toBe(0);
});

it("creates only the missing role when a TIFF lost its display copy", async () => {
	const bytes = await tiff();
	const original = await pending("KOB-000017", bytes, "image/tiff");
	const { storage } = fakeStorage();
	await copyMedia(
		db,
		fakeDrive({ "KOB-000017": bytes }),
		failOnce(storage, "displays/"),
		{ apply: true },
	);
	const before = await db.mediaFile.findFirstOrThrow({
		where: { itemId: original.itemId, role: "thumbnail" },
	});
	const retry = await copyMedia(db, fakeDrive({}), storage, { apply: true });
	expect(retry.derivativesRepaired).toBe(1);
	expect(
		await db.mediaFile.count({
			where: { itemId: original.itemId, role: "display", status: "verified" },
		}),
	).toBe(1);
	const after = await db.mediaFile.findUniqueOrThrow({
		where: { id: before.id },
	});
	expect(after.updatedAt).toEqual(before.updatedAt);
});

it("counts missing derivatives on a dry run without writing", async () => {
	const bytes = await jpeg();
	await pending("KOB-000018", bytes, "image/jpeg");
	const { objects, storage } = fakeStorage();
	await copyMedia(
		db,
		fakeDrive({ "KOB-000018": bytes }),
		failOnce(storage, "thumbnails/"),
		{ apply: true },
	);
	const size = objects.size;
	const dry = await copyMedia(db, fakeDrive({}), storage, { apply: false });
	expect(dry).toMatchObject({
		derivativesConsidered: 1,
		derivativesRepaired: 0,
	});
	expect(objects.size).toBe(size);
});

it("refuses to derive from a stored original that no longer matches its hash", async () => {
	const bytes = await jpeg();
	const original = await pending("KOB-000019", bytes, "image/jpeg");
	const { objects, storage } = fakeStorage();
	await copyMedia(
		db,
		fakeDrive({ "KOB-000019": bytes }),
		failOnce(storage, "thumbnails/"),
		{ apply: true },
	);
	objects.set(original.storageKey, await tiff());
	const retry = await copyMedia(db, fakeDrive({}), storage, { apply: true });
	expect(retry.derivativesFailed).toEqual([
		{ kobId: "KOB-000019", code: "STORED_ORIGINAL_MISMATCH" },
	]);
	expect(
		await db.mediaFile.count({
			where: { itemId: original.itemId, role: "thumbnail" },
		}),
	).toBe(0);
});

it("limits derivative retries to the named items", async () => {
	const bytes = await jpeg();
	await pending("KOB-000020", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	await copyMedia(
		db,
		fakeDrive({ "KOB-000020": bytes }),
		failOnce(storage, "thumbnails/"),
		{ apply: true },
	);
	const other = await copyMedia(db, fakeDrive({}), storage, {
		apply: true,
		only: ["KOB-000021"],
	});
	expect(other.derivativesConsidered).toBe(0);
});

it("does not report a named file left out by the limit as not pending", async () => {
	const bytes = await jpeg();
	await pending("KOB-000022", bytes, "image/jpeg");
	await pending("KOB-000023", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	const report = await copyMedia(
		db,
		fakeDrive({ "KOB-000022": bytes, "KOB-000023": bytes }),
		storage,
		{
			apply: false,
			limit: 1,
			only: ["KOB-000022", "KOB-000023", "KOB-999999"],
		},
	);
	expect(report.considered).toBe(1);
	expect(report.notPending).toEqual(["KOB-999999"]);
});
