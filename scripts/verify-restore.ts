import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../src/lib/database";
import { verifyRestore } from "../src/ops/verify-restore";

// Operator command for the restore drill (docs/OPERATIONS.md). The session is
// read-only. Prints the host and counts, never content. Use a direct URL: the
// pooled endpoint rejects the session option.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("Needs DATABASE_URL");
	process.exit(2);
}
const url = new URL(databaseUrl);
url.searchParams.set("options", "-c default_transaction_read_only=on");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = readdirSync(resolve(root, "prisma/migrations"), {
	withFileTypes: true,
})
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name);
const db = createDatabase(url.toString());
try {
	// Fail closed: this runs against production, so do not assume the option
	// above took effect.
	const [mode] = await db.$queryRaw<
		{ default_transaction_read_only: string }[]
	>`
		SHOW default_transaction_read_only`;
	if (mode?.default_transaction_read_only !== "on")
		throw new Error("The session is not read-only");
	const report = await verifyRestore(db, migrations);
	console.log(JSON.stringify({ host: url.host, ...report }, null, 2));
	if (report.problems.length) process.exitCode = 1;
} finally {
	await db.$disconnect();
}
