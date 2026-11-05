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

function parseSize(value: string): bigint | null {
	const number = Number(value);
	// Exports can write sizes in exponent form.
	return value.trim() !== "" && Number.isSafeInteger(number) && number >= 0 ? BigInt(number) : null;
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
			mimeType: row[c.mime] ?? "application/octet-stream",
			originalFilename: name,
			sha256: row[c.sha256]?.trim() || null,
		};
	}
	let source: PlannedRecord["source"] = null;
	if (internet && webRow) {
		const url = webRow[w.url] ?? "";
		if (!isSafeSourceUrl(url)) return "UNSAFE_URL";
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
	const webById = new Map(webRows.map((row) => [row[w.id], row]));
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
		const planned = planRow(row, webById.get(kobId) ?? null);
		if (typeof planned === "string") errors.push({ kobId, code: planned });
		else records.push(planned);
	}
	return { records, errors };
}
