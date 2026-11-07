import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, type Database } from "../src/lib/database";
import { failureCodes } from "../src/lib/failure-codes";
import { verifyRestore } from "../src/ops/verify-restore";

// Operator command for the restore drill (docs/OPERATIONS.md). The session is
// read-only. Prints the host and counts, never content. Use a direct URL: the
// pooled endpoint rejects the session option.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("Needs DATABASE_URL");
	process.exit(2);
}
// new URL() errors carry the whole input, so never print or rethrow them.
let url: URL;
try {
	url = new URL(databaseUrl);
} catch {
	console.error("DATABASE_URL is not a valid URL");
	process.exit(2);
}
url.searchParams.set("options", "-c default_transaction_read_only=on");
let db: Database | undefined;
try {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
	const migrations = readdirSync(resolve(root, "prisma/migrations"), {
		withFileTypes: true,
	})
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
	db = createDatabase(url.toString());
	// Fail closed: this runs against production, so do not assume the option
	// above took effect.
	const [mode] = await db.$queryRaw<
		{ default_transaction_read_only: string }[]
	>`
		SHOW default_transaction_read_only`;
	if (mode?.default_transaction_read_only !== "on")
		throw Object.assign(new Error("The session is not read-only"), {
			code: "NOT_READ_ONLY",
		});
	const report = await verifyRestore(db, migrations);
	console.log(JSON.stringify({ host: url.host, ...report }, null, 2));
	if (report.problems.length) process.exitCode = 1;
} catch (error) {
	// Messages and stacks can name the host or role: print codes only.
	console.error(
		["Verification could not run", ...failureCodes(error)].join(" "),
	);
	process.exitCode = 2;
} finally {
	await db?.$disconnect().catch(() => {});
}
