import { closeSync, openSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { copyMedia } from "../src/import/copy-media";
import { createDriveClient } from "../src/import/drive";
import { isOutsideRepository } from "../src/import/report-path";
import { readStorageConfig } from "../src/lib/config";
import { createDatabase } from "../src/lib/database";
import { createR2Storage } from "../src/lib/storage";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Operator command. Dry run unless --apply and --confirm-host match. Drive is
// only read. Prints counts; row detail goes to the report outside the repository.
const { values } = parseArgs({
	options: {
		report: { type: "string" },
		limit: { type: "string" },
		only: { type: "string" },
		apply: { type: "boolean", default: false },
		"confirm-host": { type: "string" },
	},
});
const { report: reportPath } = values;
const databaseUrl = process.env.DATABASE_URL;
if (!reportPath || !databaseUrl) {
	console.error("Needs --report, DATABASE_URL and R2 settings");
	process.exit(2);
}
let outside = false;
try {
	outside = isOutsideRepository(reportPath, repositoryRoot);
} catch {
	console.error("--report must be in an existing folder");
	process.exit(2);
}
if (!outside) {
	console.error("--report must be outside the repository");
	process.exit(2);
}
const only = values.only?.split(",").map((id) => id.trim());
if (only && !only.every((id) => /^KOB-\d{6}$/.test(id))) {
	console.error("--only needs comma-separated catalog ids such as KOB-000001");
	process.exit(2);
}
const limit = values.limit === undefined ? undefined : Number(values.limit);
if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
	console.error("--limit needs a positive whole number");
	process.exit(2);
}
const host = new URL(databaseUrl).host;
if (values.apply && values["confirm-host"] !== host) {
	console.error(`--apply needs --confirm-host=${host}`);
	process.exit(2);
}
const config = readStorageConfig(process.env);
console.log(
	`Database host: ${host}. Bucket: ${config.bucket}. Mode: ${values.apply ? "APPLY" : "dry run"}`,
);
// Opened first, so an existing report is never overwritten and a bad path fails
// before anything is copied.
let reportFd: number;
try {
	reportFd = openSync(reportPath, "wx", 0o600);
} catch {
	console.error("--report must be a new file in an existing folder");
	process.exit(2);
}
const db = createDatabase(databaseUrl);
try {
	const report = await copyMedia(
		db,
		await createDriveClient(),
		createR2Storage(config),
		{
			apply: Boolean(values.apply),
			...(limit ? { limit } : {}),
			...(only ? { only } : {}),
		},
	);
	writeFileSync(
		reportFd,
		JSON.stringify({ ...report, bytes: String(report.bytes) }, null, 2),
	);
	console.log({
		considered: report.considered,
		verified: report.verified,
		failed: report.failed.length,
		derivativesFailed: report.derivativesFailed.length,
		derivativesConsidered: report.derivativesConsidered,
		derivativesRepaired: report.derivativesRepaired,
		notPending: report.notPending.length,
		bytes: String(report.bytes),
	});
	if (report.failed.length) process.exitCode = 1;
} finally {
	closeSync(reportFd);
	await db.$disconnect();
}
