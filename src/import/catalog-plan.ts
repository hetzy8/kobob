import { isSafeSourceUrl } from "../lib/source-url";
import type { ItemTypeValue } from "../services/item-input";
import {
	catalog as c,
	catalogTypes,
	explicitIdentityPrefix,
	internetSourceKind,
	needsClarificationPrefix,
	web as w,
	webTypes,
} from "./catalog-columns";
import { isSystemFileName } from "./system-files";

export type CatalogRow = Record<string, string>;
export type PlanError = { kobId: string; code: string };
export type PlannedRecord = {
	kobId: string;
	origin: "family" | "internet";
	title: string;
	types: ItemTypeValue[];
	rightsStatus: "unknown" | "needs_clarification";
	publish: boolean;
	source: { url: string; publisher: string; author: string; publishedText: string; license: string } | null;
	file: { driveFileId: string; sizeBytes: bigint; mimeType: string; originalFilename: string; sha256: string | null } | null;
	systemCandidate: boolean;
	tab: "catalog";
	row: { catalog: CatalogRow; web: CatalogRow | null };
};

const KOB_ID = /^KOB-\d{6}$/;
const MAX_TITLE = 200; // matches itemInputSchema, so the record stays editable

// Visitors must never be sent to a private Drive or Docs link.
const PRIVATE_SOURCE_HOSTS = new Set(["drive.google.com", "docs.google.com", "drive.usercontent.google.com"]);
// Exports can write sizes in exponent form; nothing else is a size.
const SIZE_FORMAT = /^\d+(\.\d+)?([eE]\+?\d+)?$/;

// Google Sheets' CSV download writes sizes with thousands separators.
const GROUPED_SIZE_FORMAT = /^\d{1,3}(,\d{3})+$/;

function parseSize(value: string): bigint | null {
	const plain = GROUPED_SIZE_FORMAT.test(value) ? value.replaceAll(",", "") : value;
	if (!SIZE_FORMAT.test(plain)) return null;
	const number = Number(plain);
	return Number.isSafeInteger(number) ? BigInt(number) : null;
}

function isPrivateSourceHost(url: string): boolean {
	try {
		const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
		return PRIVATE_SOURCE_HOSTS.has(host) || host.endsWith(".googleusercontent.com");
	} catch {
		return false;
	}
}

function planRow(row: CatalogRow, webRow: CatalogRow | null): PlannedRecord | string {
	const name = row[c.originalName] ?? "";
	const internet = row[c.sourceKind] === internetSourceKind;
	if (internet && !webRow) return "MISSING_WEB_ROW";
	const type = internet ? webTypes[webRow?.[w.type] ?? ""] : catalogTypes[row[c.type] ?? ""];
	if (!type) return "UNKNOWN_TYPE";
	const title = ((internet ? webRow?.[w.title] : name) ?? "").trim();
	if (!title) return "MISSING_TITLE";
	if (title.length > MAX_TITLE) return "TITLE_TOO_LONG";
	const driveFileId = row[c.driveId]?.trim() ?? "";
	if (!internet && !driveFileId) return "MISSING_DRIVE_ID";
	let file: PlannedRecord["file"] = null;
	if (driveFileId) {
		const sizeBytes = parseSize(row[c.size] ?? "");
		if (sizeBytes === null) return "INVALID_SIZE";
		file = {
			driveFileId,
			sizeBytes,
			mimeType: row[c.mime] || "application/octet-stream",
			originalFilename: name,
			sha256: row[c.sha256]?.trim() || null,
		};
	}
	let source: PlannedRecord["source"] = null;
	if (internet && webRow) {
		const url = webRow[w.url] ?? "";
		if (!isSafeSourceUrl(url)) return "UNSAFE_URL";
		if (isPrivateSourceHost(url)) return "PRIVATE_SOURCE_HOST";
		source = {
			url,
			publisher: webRow[w.publisher] ?? "",
			author: webRow[w.author] ?? "",
			publishedText: webRow[w.publishedText] ?? "",
			license: webRow[w.licenseSource] ?? "",
		};
	}
	return {
		kobId: row[c.id],
		origin: internet ? "internet" : "family",
		title,
		types: [type],
		// Clearing rights stays a family decision, even with a documented license.
		rightsStatus: (row[c.rights] ?? "").startsWith(needsClarificationPrefix) ? "needs_clarification" : "unknown",
		publish: internet && (webRow?.[w.identityBasis] ?? "").startsWith(explicitIdentityPrefix),
		source,
		file,
		systemCandidate: !internet && isSystemFileName(name),
		tab: "catalog",
		row: { catalog: row, web: webRow },
	};
}

export function planCatalog(catalogRows: CatalogRow[], webRows: CatalogRow[]) {
	const records: PlannedRecord[] = [];
	const errors: PlanError[] = [];
	const webById = new Map<string, CatalogRow>();
	const duplicateWebIds = new Set<string>();
	for (const row of webRows) {
		const id = row[w.id] ?? "";
		if (webById.has(id)) duplicateWebIds.add(id);
		else webById.set(id, row);
	}
	const seen = new Set<string>();
	for (const row of catalogRows) {
		const kobId = row[c.id] ?? "";
		if (!KOB_ID.test(kobId)) {
			errors.push({ kobId, code: "INVALID_ID" });
			continue;
		}
		if (seen.has(kobId)) {
			errors.push({ kobId, code: "DUPLICATE_ID" });
			continue;
		}
		seen.add(kobId);
		if (duplicateWebIds.has(kobId)) continue;
		const planned = planRow(row, webById.get(kobId) ?? null);
		if (typeof planned === "string") errors.push({ kobId, code: planned });
		else records.push(planned);
	}
	for (const id of duplicateWebIds) if (seen.has(id)) errors.push({ kobId: id, code: "DUPLICATE_WEB_ROW" });
	for (const id of webById.keys()) if (!seen.has(id)) errors.push({ kobId: id, code: "ORPHAN_WEB_ROW" });
	return { records, errors };
}

// What Gate A asks Yoram to decide: cataloged dates and site selections.
export const familyOnly = (records: PlannedRecord[]) =>
	records.filter((record) => record.origin !== "internet");

export function reviewLists(records: PlannedRecord[]) {
	const catalogedDates: { kobId: string; value: string }[] = [];
	const siteSelected: { kobId: string; publish: boolean }[] = [];
	for (const record of records) {
		const date = (record.row.catalog[c.eventDate] ?? "").trim();
		if (date) catalogedDates.push({ kobId: record.kobId, value: date });
		if ((record.row.catalog[c.siteSelection] ?? "").trim()) siteSelected.push({ kobId: record.kobId, publish: record.publish });
	}
	return { catalogedDates, siteSelected };
}
