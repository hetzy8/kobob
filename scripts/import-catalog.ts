import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parse } from "csv-parse/sync";
import { applyBlockers, applyCatalog, resolveSystemFiles } from "../src/import/apply-catalog";
import { planCatalog, reviewLists, type CatalogRow } from "../src/import/catalog-plan";
import { createDriveClient } from "../src/import/drive";
import { createDatabase } from "../src/lib/database";
import { isOutsideRepository } from "../src/import/report-path";

// Operator command. Dry run unless --apply, --confirm-host and --confirm-snapshot
// match. Prints counts only; row detail goes to a new report outside the repository.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let db: ReturnType<typeof createDatabase> | undefined;
let reportFd: number | undefined;
let applying = false;

function fail(message: string): never {
	console.error(message);
	process.exit(2);
}

try {
	const { values } = parseArgs({
		options: {
			catalog: { type: "string" },
			web: { type: "string" },
			report: { type: "string" },
			apply: { type: "boolean", default: false },
			"confirm-host": { type: "string" },
			"confirm-snapshot": { type: "string" },
		},
	});
	const { catalog, web, report: reportPath } = values;
	applying = Boolean(values.apply);
	const databaseUrl = process.env.DATABASE_URL;
	if (!catalog || !web || !reportPath || !databaseUrl) {
		fail("Needs --catalog --web --report and DATABASE_URL");
	}
	let outside: boolean;
	try {
		outside = isOutsideRepository(reportPath, repositoryRoot);
	} catch {
		fail("--report must be in a directory that exists");
	}
	if (!outside) fail("--report must be outside the repository");
	let host: string;
	try {
		host = new URL(databaseUrl).host;
	} catch {
		fail("DATABASE_URL is not a valid URL");
	}
	if (values.apply && values["confirm-host"] !== host) {
		fail(`--apply needs --confirm-host=${host}`);
	}
	console.log(`Database host: ${host}. Mode: ${values.apply ? "APPLY" : "dry run"}`);

	// Each file is read once; the hash and the parse use the same bytes.
	const catalogBytes = readFileSync(catalog);
	const webBytes = readFileSync(web);
	const rows = (bytes: Buffer): CatalogRow[] =>
		parse(bytes, { columns: true, bom: true, relax_column_count: true, skip_empty_lines: true });
	const snapshotHash = createHash("sha256").update(catalogBytes).update("\0").update(webBytes).digest("hex");
	const plan = planCatalog(rows(catalogBytes), rows(webBytes));
	const drive = await createDriveClient();
	const resolved = await resolveSystemFiles(plan.records, drive.readHead);
	const blockers = applyBlockers({ errors: plan.errors, unreadable: resolved.unreadable });
	console.log(`Snapshot hash: ${snapshotHash}`);
	if (values.apply) {
		if (blockers.length > 0) {
			for (const blocker of blockers) console.error(blocker);
			fail("--apply refused: fix the plan and review a clean dry run first");
		}
		if (values["confirm-snapshot"] !== snapshotHash) {
			fail(`--apply needs --confirm-snapshot=${snapshotHash}`);
		}
	}
	try {
		// "wx": never overwrite an existing report; the file is private to the operator.
		reportFd = openSync(reportPath, "wx", 0o600);
	} catch {
		fail("--report must be a new file that can be created");
	}

	db = createDatabase(databaseUrl);
	const report = await applyCatalog(db, resolved.records, snapshotHash, { apply: Boolean(values.apply) });
	const review = reviewLists(resolved.records);
	const detail = {
		snapshotHash,
		report,
		applyBlockers: blockers,
		errors: plan.errors,
		excluded: resolved.excluded.map((record) => ({ kobId: record.kobId, name: record.file?.originalFilename })),
		unreadableSystemCandidates: resolved.unreadable,
		heldInternet: resolved.records.filter((r) => r.origin === "internet" && !r.publish).map((r) => r.kobId),
		// Exactly what visitors will see, so Yoram can read it before it goes live.
		publicCards: resolved.records.filter((r) => r.publish).map((r) => ({ kobId: r.kobId, title: r.title, ...r.source })),
		catalogedDates: review.catalogedDates,
		siteSelected: review.siteSelected,
	};
	writeFileSync(reportFd, JSON.stringify(detail, (_key, value) => (typeof value === "bigint" ? String(value) : value), 2));
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
		publicNoLongerEligible: report.publicNoLongerEligible.length,
		staleCards: report.staleCards.length,
		missingFromExport: report.missingFromExport.length,
		selectedAndPublishing: review.siteSelected.filter((entry) => entry.publish).length,
	});
} catch (error) {
	// Never print the message: it can carry a connection string or row data.
	console.error(`Import failed (${error instanceof Error ? error.constructor.name : "unknown error"}). Details withheld.`);
	if (applying) console.error("Some records may already be written. Rerun with a new --report path; a rerun is safe.");
	process.exitCode = 1;
} finally {
	if (reportFd !== undefined) closeSync(reportFd);
	await db?.$disconnect();
}
