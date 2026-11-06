import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "../generated/prisma/client";
import type { Database } from "../lib/database";
import type { PlannedRecord } from "./catalog-plan";
import { confirmSystemFile } from "./system-files";

export const SYSTEM_ACTOR = "system:import";

export type CatalogReport = {
	created: number;
	published: number;
	existing: number;
	changed: string[];
	conflicts: string[];
	files: number;
	publicNoLongerEligible: string[];
	staleCards: string[];
	missingFromExport: string[];
};

// An apply needs a clean plan: counts only, so a message never carries row data.
export function applyBlockers({
	errors,
	unreadable,
}: {
	errors: readonly unknown[];
	unreadable: readonly unknown[];
}): string[] {
	const blockers: string[] = [];
	if (errors.length > 0) blockers.push(`${errors.length} planning errors`);
	if (unreadable.length > 0) blockers.push(`${unreadable.length} system-file candidates could not be read from Drive`);
	return blockers;
}

export async function resolveSystemFiles(
	records: PlannedRecord[],
	readHead: (driveFileId: string) => Promise<Uint8Array>,
) {
	const kept: PlannedRecord[] = [];
	const excluded: PlannedRecord[] = [];
	const unreadable: { kobId: string; code: string }[] = [];
	for (const record of records) {
		if (!record.systemCandidate || !record.file) {
			kept.push(record);
			continue;
		}
		try {
			const head = await readHead(record.file.driveFileId);
			(confirmSystemFile(record.file.originalFilename, record.file.sizeBytes, head) ? excluded : kept).push(record);
		} catch (error) {
			const status = error instanceof Error ? /DRIVE_READ_FAILED_(\d+)/.exec(error.message)?.[1] : undefined;
			unreadable.push({ kobId: record.kobId, code: status ? `DRIVE_READ_FAILED_${status}` : "DRIVE_READ_FAILED" });
			kept.push(record);
		}
	}
	return { records: kept, excluded, unreadable };
}

type SourceFields = NonNullable<PlannedRecord["source"]>;
const sameSource = (stored: SourceFields, planned: SourceFields) =>
	stored.url === planned.url &&
	stored.publisher === planned.publisher &&
	stored.author === planned.author &&
	stored.publishedText === planned.publishedText &&
	stored.license === planned.license;

async function createRecord(tx: Prisma.TransactionClient, record: PlannedRecord, snapshotHash: string) {
	const item = await tx.item.create({
		data: {
			kobId: record.kobId,
			origin: record.origin,
			rightsStatus: record.rightsStatus,
			reviewStatus: "needs_review",
		},
	});
	// Catalog descriptions stay in the catalog record: some hold review wording.
	// record.description is the owner's public note, never catalog text.
	const revision = await tx.itemRevision.create({
		data: { itemId: item.id, title: record.title, description: record.description, types: record.types, authorId: SYSTEM_ACTOR },
	});
	await tx.item.update({
		where: { id: item.id },
		data: {
			workingRevisionId: revision.id,
			...(record.publish
				? { visibility: "public", publishedRevisionId: revision.id, publishedAt: new Date() }
				: {}),
		},
	});
	await tx.itemCatalogRecord.create({
		data: { itemId: item.id, tab: record.tab, row: record.row as unknown as Prisma.InputJsonObject, snapshotHash },
	});
	if (record.source) await tx.externalSource.create({ data: { itemId: item.id, ...record.source } });
	if (record.file)
		await tx.mediaFile.create({
			data: {
				itemId: item.id,
				role: "original",
				storageKey: `originals/${item.id}`,
				mimeType: record.file.mimeType,
				sizeBytes: record.file.sizeBytes,
				sha256: record.file.sha256,
				originalFilename: record.file.originalFilename,
			},
		});
	await tx.editorialAudit.create({
		data: { actorId: SYSTEM_ACTOR, targetType: "item", targetId: item.id, action: record.publish ? "import-publish" : "import" },
	});
}

// Keyed on kobId. A rerun never touches revisions, status or visibility.
export async function applyCatalog(
	db: Database,
	records: PlannedRecord[],
	snapshotHash: string,
	{ apply }: { apply: boolean },
): Promise<CatalogReport> {
	const report: CatalogReport = {
		created: 0,
		published: 0,
		existing: 0,
		changed: [],
		conflicts: [],
		files: 0,
		publicNoLongerEligible: [],
		staleCards: [],
		missingFromExport: [],
	};
	const startedAt = new Date();
	for (const record of records) {
		const existing = await db.item.findUnique({
			where: { kobId: record.kobId },
			include: { catalogRecord: true, publishedRevision: true, sources: true },
		});
		if (!existing) {
			report.created++;
			if (record.publish) report.published++;
			if (record.file) report.files++;
			if (apply) await db.$transaction((tx) => createRecord(tx, record, snapshotHash));
			continue;
		}
		report.existing++;
		// Drift on a public item is reported, never applied: visibility and the card stay as published.
		let stale = false;
		if (existing.visibility === "public") {
			if (!record.publish) report.publicNoLongerEligible.push(record.kobId);
			const planned = record.source;
			stale =
				existing.publishedRevision?.title !== record.title ||
				existing.publishedRevision?.description !== record.description ||
				(planned !== null && !existing.sources.some((source) => sameSource(source, planned)));
			if (stale) report.staleCards.push(record.kobId);
		}
		if (stale && existing.version === 1) continue;
		if (isDeepStrictEqual(existing.catalogRecord?.row, record.row)) continue;
		if (existing.version > 1) {
			report.conflicts.push(record.kobId);
			continue;
		}
		report.changed.push(record.kobId);
		if (apply && existing.catalogRecord)
			await db.itemCatalogRecord.update({
				where: { id: existing.catalogRecord.id },
				data: { row: record.row as unknown as Prisma.InputJsonObject, snapshotHash },
			});
	}
	const given = new Set(records.map((record) => record.kobId));
	const known = await db.item.findMany({ where: { kobId: { not: null } }, select: { kobId: true }, orderBy: { kobId: "asc" } });
	report.missingFromExport = known.flatMap(({ kobId }) => (kobId && !given.has(kobId) ? [kobId] : []));
	if (apply)
		await db.importRun.create({
			data: {
				kind: "catalog",
				snapshotHash,
				startedAt,
				finishedAt: new Date(),
				counts: {
					created: report.created,
					published: report.published,
					existing: report.existing,
					changed: report.changed.length,
					conflicts: report.conflicts.length,
					files: report.files,
					publicNoLongerEligible: report.publicNoLongerEligible.length,
					staleCards: report.staleCards.length,
					missingFromExport: report.missingFromExport.length,
				},
			},
		});
	return report;
}
