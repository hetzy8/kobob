import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "csv-parse/sync";
import { applyCatalog, resolveSystemFiles } from "../src/import/apply-catalog";
import { planCatalog, type CatalogRow } from "../src/import/catalog-plan";
import { createDriveClient } from "../src/import/drive";
import { createDatabase } from "../src/lib/database";

// Operator command. Dry run unless --apply and --confirm-host match. Prints
// counts only; row detail goes to the report outside the repository.
const { values } = parseArgs({
	options: {
		catalog: { type: "string" },
		web: { type: "string" },
		report: { type: "string" },
		"drive-key": { type: "string" },
		apply: { type: "boolean", default: false },
		"confirm-host": { type: "string" },
	},
});
const { catalog, web, report: reportPath, "drive-key": driveKey } = values;
const databaseUrl = process.env.DATABASE_URL;
if (!catalog || !web || !reportPath || !driveKey || !databaseUrl) {
	console.error("Needs --catalog --web --report --drive-key and DATABASE_URL");
	process.exit(2);
}
if (!relative(process.cwd(), resolve(reportPath)).startsWith("..")) {
	console.error("--report must be outside the repository");
	process.exit(2);
}
const host = new URL(databaseUrl).host;
if (values.apply && values["confirm-host"] !== host) {
	console.error(`--apply needs --confirm-host=${host}`);
	process.exit(2);
}
console.log(`Database host: ${host}. Mode: ${values.apply ? "APPLY" : "dry run"}`);

const read = (path: string) => readFileSync(path);
const rows = (path: string): CatalogRow[] =>
	parse(read(path), { columns: true, bom: true, relax_column_count: true, skip_empty_lines: true });
const snapshotHash = createHash("sha256").update(read(catalog)).update(read(web)).digest("hex");
const plan = planCatalog(rows(catalog), rows(web));
const drive = createDriveClient(driveKey);
const resolved = await resolveSystemFiles(plan.records, drive.readHead);
const db = createDatabase(databaseUrl);
try {
	const report = await applyCatalog(db, resolved.records, snapshotHash, { apply: Boolean(values.apply) });
	const detail = {
		snapshotHash,
		report,
		errors: plan.errors,
		excluded: resolved.excluded.map((record) => ({ kobId: record.kobId, name: record.file?.originalFilename })),
		unreadableSystemCandidates: resolved.unreadable,
		heldInternet: resolved.records.filter((r) => r.origin === "internet" && !r.publish).map((r) => r.kobId),
		// Exactly what visitors will see, so Yoram can read it before it goes live.
		publicCards: resolved.records.filter((r) => r.publish).map((r) => ({ kobId: r.kobId, title: r.title, ...r.source })),
	};
	writeFileSync(reportPath, JSON.stringify(detail, (_key, value) => (typeof value === "bigint" ? String(value) : value), 2));
	console.log({
		items: resolved.records.length,
		excluded: resolved.excluded.length,
		errors: plan.errors.length,
		unreadable: resolved.unreadable.length,
		created: report.created,
		published: report.published,
		files: report.files,
		existing: report.existing,
		changed: report.changed.length,
		conflicts: report.conflicts.length,
	});
} finally {
	await db.$disconnect();
}
