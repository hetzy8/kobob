import { afterAll, beforeEach, expect, it } from "vitest";
import { applyBlockers, applyCatalog, resolveSystemFiles, SYSTEM_ACTOR } from "../../src/import/apply-catalog";
import type { PlannedRecord } from "../../src/import/catalog-plan";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import { createDatabase } from "../../src/lib/database";
import { createArchiveReader } from "../../src/services/archive";

const db = createDatabase(requireTestDatabaseUrl(process.env));
const reader = createArchiveReader(db);
async function clean() {
	await db.editorialAudit.deleteMany();
	await db.importRun.deleteMany();
	await db.item.deleteMany();
}
beforeEach(clean);
afterAll(async () => {
	await clean();
	await db.$disconnect();
});

const record = (kobId: string, extra: Partial<PlannedRecord> = {}): PlannedRecord => ({
	kobId,
	origin: "family",
	title: "synthetic.jpg",
	types: ["picture"],
	rightsStatus: "unknown",
	publish: false,
	source: null,
	file: { driveFileId: `d-${kobId}`, sizeBytes: 10n, mimeType: "image/jpeg", originalFilename: "synthetic.jpg", sha256: null },
	systemCandidate: false,
	tab: "catalog",
	row: { catalog: { note: "PRIVATE-NOTE" }, web: null },
	...extra,
});
const card = (kobId: string) =>
	record(kobId, {
		origin: "internet",
		title: "Public card",
		publish: true,
		file: null,
		source: { url: "https://example.test/a", publisher: "Press", author: "", publishedText: "", license: "" },
	});

it("writes nothing on a dry run but reports what it would do", async () => {
	const report = await applyCatalog(db, [record("KOB-000001"), card("KOB-000002")], "h1", { apply: false });
	expect(report).toMatchObject({ created: 2, published: 1, files: 1 });
	expect(await db.item.count()).toBe(0);
	expect(await db.importRun.count()).toBe(0);
});

it("creates a private family item needing review, with an empty description", async () => {
	await applyCatalog(db, [record("KOB-000001")], "h1", { apply: true });
	const item = await db.item.findUniqueOrThrow({
		where: { kobId: "KOB-000001" },
		include: { workingRevision: true, files: true, catalogRecord: true },
	});
	expect(item).toMatchObject({ visibility: "private", publishedRevisionId: null, reviewStatus: "needs_review", origin: "family" });
	expect(item.workingRevision).toMatchObject({ title: "synthetic.jpg", description: "", authorId: SYSTEM_ACTOR });
	expect(item.files[0]).toMatchObject({ role: "original", status: "pending", storageKey: `originals/${item.id}` });
	expect(item.catalogRecord?.row).toEqual({ catalog: { note: "PRIVATE-NOTE" }, web: null });
});

it("publishes a card readable by visitors, with nothing private", async () => {
	await applyCatalog(db, [card("KOB-000002")], "h1", { apply: true });
	const item = await db.item.findUniqueOrThrow({ where: { kobId: "KOB-000002" } });
	const view = await reader.getPublicItem(item.id);
	expect(view?.title).toBe("Public card");
	expect(JSON.stringify(view)).not.toContain("PRIVATE-NOTE");
});

it("keeps a search-match internet record away from visitors", async () => {
	await applyCatalog(db, [{ ...card("KOB-000009"), publish: false }], "h1", { apply: true });
	const item = await db.item.findUniqueOrThrow({ where: { kobId: "KOB-000009" } });
	expect(item).toMatchObject({ origin: "internet", visibility: "private", publishedRevisionId: null });
	expect(await reader.getPublicItem(item.id)).toBeNull();
	expect(await reader.searchPublicItems("Public card")).toEqual([]);
});

it("reruns without duplicates or changes to website edits", async () => {
	await applyCatalog(db, [record("KOB-000001")], "h1", { apply: true });
	const report = await applyCatalog(db, [record("KOB-000001")], "h1", { apply: true });
	expect(report).toMatchObject({ created: 0, existing: 1, changed: [], conflicts: [] });
	expect(await db.item.count()).toBe(1);
});

it("does not republish a card a family member made private", async () => {
	await applyCatalog(db, [card("KOB-000002")], "h1", { apply: true });
	await db.item.update({
		where: { kobId: "KOB-000002" },
		data: { visibility: "private", publishedRevisionId: null, publishedAt: null, version: 2 },
	});
	await applyCatalog(db, [card("KOB-000002")], "h2", { apply: true });
	expect((await db.item.findUniqueOrThrow({ where: { kobId: "KOB-000002" } })).visibility).toBe("private");
});

it("refreshes a changed row on an untouched item and flags a conflict on an edited one", async () => {
	await applyCatalog(db, [record("KOB-000001"), record("KOB-000003")], "h1", { apply: true });
	await db.item.update({ where: { kobId: "KOB-000003" }, data: { version: 2 } });
	const changed = { catalog: { note: "CHANGED" }, web: null };
	const report = await applyCatalog(
		db,
		[record("KOB-000001", { row: changed }), record("KOB-000003", { row: changed })],
		"h2",
		{ apply: true },
	);
	expect(report.changed).toEqual(["KOB-000001"]);
	expect(report.conflicts).toEqual(["KOB-000003"]);
	const edited = await db.item.findUniqueOrThrow({ where: { kobId: "KOB-000003" }, include: { catalogRecord: true } });
	expect(edited.catalogRecord?.row).toEqual({ catalog: { note: "PRIVATE-NOTE" }, web: null });
});

it("records counts only on the import run", async () => {
	await applyCatalog(db, [record("KOB-000001")], "h1", { apply: true });
	const run = await db.importRun.findFirstOrThrow();
	expect(run).toMatchObject({ kind: "catalog", snapshotHash: "h1" });
	expect(JSON.stringify(run.counts)).not.toContain("KOB-");
	expect(run.finishedAt).not.toBeNull();
});

it("excludes only system files confirmed by content, keeping readable failures as items", async () => {
	const candidate = (kobId: string, name: string) =>
		record(kobId, {
			systemCandidate: true,
			file: { driveFileId: kobId, sizeBytes: 4096n, mimeType: "image/jpeg", originalFilename: name, sha256: null },
		});
	const appleDouble = Uint8Array.from([0x00, 0x05, 0x16, 0x07]);
	const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
	const result = await resolveSystemFiles(
		[
			candidate("KOB-000001", "._a.jpg"),
			candidate("KOB-000002", "._b.jpg"),
			candidate("KOB-000003", "._c.jpg"),
			record("KOB-000004"),
			candidate("KOB-000005", "._d.jpg"),
		],
		async (id) => {
			if (id === "KOB-000003") throw new Error("DRIVE_READ_FAILED_403");
			if (id === "KOB-000005") throw new Error("socket closed");
			return id === "KOB-000001" ? appleDouble : jpeg;
		},
	);
	expect(result.excluded.map((r) => r.kobId)).toEqual(["KOB-000001"]);
	expect(result.records.map((r) => r.kobId)).toEqual(["KOB-000002", "KOB-000003", "KOB-000004", "KOB-000005"]);
	expect(result.unreadable).toEqual([
		{ kobId: "KOB-000003", code: "DRIVE_READ_FAILED_403" },
		{ kobId: "KOB-000005", code: "DRIVE_READ_FAILED" },
	]);
});

it("blocks an apply on errors or unreadable files, with counts only", () => {
	expect(applyBlockers({ errors: [], unreadable: [] })).toEqual([]);
	const blockers = applyBlockers({
		errors: [{ kobId: "KOB-000001", code: "INVALID_SIZE" }],
		unreadable: [
			{ kobId: "KOB-000002", code: "DRIVE_READ_FAILED_403" },
			{ kobId: "KOB-000003", code: "DRIVE_READ_FAILED" },
		],
	});
	expect(blockers).toHaveLength(2);
	expect(blockers[0]).toContain("1");
	expect(blockers[1]).toContain("2");
	expect(blockers.join(" ")).not.toContain("KOB-");
});

const stored = (kobId: string) => db.item.findUniqueOrThrow({ where: { kobId }, include: { catalogRecord: true } });

it("reports a public item whose record no longer qualifies, without changing it", async () => {
	await applyCatalog(db, [card("KOB-000002")], "h1", { apply: true });
	const report = await applyCatalog(db, [{ ...card("KOB-000002"), publish: false }], "h2", { apply: true });
	expect(report.publicNoLongerEligible).toEqual(["KOB-000002"]);
	expect((await stored("KOB-000002")).visibility).toBe("public");
});

it("reports a stale public card on every run and does not refresh its catalog row", async () => {
	await applyCatalog(db, [card("KOB-000002")], "h1", { apply: true });
	const retitled = { ...card("KOB-000002"), title: "Retitled card", row: { catalog: { note: "CHANGED" }, web: null } };
	for (const hash of ["h2", "h3"]) {
		const report = await applyCatalog(db, [retitled], hash, { apply: true });
		expect(report.staleCards).toEqual(["KOB-000002"]);
		expect(report.changed).toEqual([]);
	}
	expect((await stored("KOB-000002")).catalogRecord?.row).toEqual({ catalog: { note: "PRIVATE-NOTE" }, web: null });
	const base = card("KOB-000002");
	const moved = { ...base, source: { url: "https://example.test/moved", publisher: "Press", author: "", publishedText: "", license: "" } };
	expect((await applyCatalog(db, [moved], "h4", { apply: false })).staleCards).toEqual(["KOB-000002"]);
	expect((await applyCatalog(db, [base], "h5", { apply: false })).staleCards).toEqual([]);
});

it("reports items missing from the export", async () => {
	await applyCatalog(db, [record("KOB-000001"), record("KOB-000003")], "h1", { apply: true });
	await db.item.create({ data: {} });
	const report = await applyCatalog(db, [record("KOB-000001")], "h2", { apply: true });
	expect(report.missingFromExport).toEqual(["KOB-000003"]);
	const run = await db.importRun.findFirstOrThrow({ where: { snapshotHash: "h2" } });
	expect(run.counts).toMatchObject({ publicNoLongerEligible: 0, staleCards: 0, missingFromExport: 1 });
});

it("writes nothing on a dry run against existing items", async () => {
	await applyCatalog(db, [record("KOB-000001"), card("KOB-000002")], "h1", { apply: true });
	const snapshot = async () =>
		JSON.stringify([
			await db.item.findMany({ orderBy: { id: "asc" } }),
			await db.itemCatalogRecord.findMany({ orderBy: { id: "asc" } }),
			await db.itemRevision.findMany({ orderBy: { id: "asc" } }),
			await db.editorialAudit.count(),
			await db.importRun.count(),
		]);
	const before = await snapshot();
	await applyCatalog(
		db,
		[record("KOB-000001", { row: { catalog: { note: "CHANGED" }, web: null } }), { ...card("KOB-000002"), title: "Other" }, record("KOB-000004")],
		"h2",
		{ apply: false },
	);
	expect(await snapshot()).toBe(before);
});

it("keeps private markers out of public search results for a published card", async () => {
	await applyCatalog(
		db,
		[{ ...card("KOB-000002"), row: { catalog: { note: "PRIVATE-NOTE" }, web: { note: "PRIVATE-WEB" } } }],
		"h1",
		{ apply: true },
	);
	const results = await reader.searchPublicItems("Public card");
	expect(results).toHaveLength(1);
	expect(JSON.stringify(results)).not.toMatch(/PRIVATE|KOB-/);
	expect(await reader.searchPublicItems("PRIVATE-NOTE")).toEqual([]);
});
