import { readdirSync } from "node:fs";
import { afterAll, beforeEach, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import { createDatabase } from "../../src/lib/database";
import { verifyRestore } from "../../src/ops/verify-restore";

const db = createDatabase(requireTestDatabaseUrl(process.env));
const migrations = readdirSync("prisma/migrations", {
	withFileTypes: true,
})
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name);

beforeEach(async () => {
	await db.item.deleteMany();
});
afterAll(async () => {
	await db.item.deleteMany();
	await db.$disconnect();
});

async function item(visibility: "public" | "private", published: boolean) {
	const created = await db.item.create({ data: { visibility } });
	const revision = await db.itemRevision.create({
		data: {
			itemId: created.id,
			title: "Synthetic title",
			types: ["other"],
			authorId: "synthetic",
		},
	});
	return db.item.update({
		where: { id: created.id },
		data: {
			workingRevisionId: revision.id,
			...(published
				? { publishedRevisionId: revision.id, publishedAt: new Date() }
				: {}),
		},
	});
}

it("reports counts and no problems for a healthy database", async () => {
	await item("public", true);
	await item("private", false);
	const report = await verifyRestore(db, migrations);
	expect(report.problems).toEqual([]);
	expect(report.latestAppliedMigration).toBe(report.newestMigration);
	expect(report.tables.Item).toBe(2);
	expect(report.tables._prisma_migrations).toBeGreaterThan(0);
	expect(report.itemsByOriginAndVisibility).toEqual({
		"family/private": 1,
		"family/public": 1,
	});
});

it("never includes item content", async () => {
	await item("public", true);
	await item("private", false);
	const report = await verifyRestore(db, migrations);
	expect(JSON.stringify(report)).not.toContain("Synthetic title");
});

it("reports a schema behind the newest migration", async () => {
	await item("public", true);
	await item("private", false);
	const report = await verifyRestore(db, [
		...migrations,
		"29990101000000_future",
	]);
	expect(report.newestMigration).toBe("29990101000000_future");
	expect(report.problems).toContainEqual(expect.stringContaining("migration"));
});

it("reports a public item with no published revision", async () => {
	await item("public", false);
	await item("private", false);
	const report = await verifyRestore(db, migrations);
	expect(report.problems).toContain(
		"1 public item(s) have no published revision",
	);
});

it("reports a private item with a published revision", async () => {
	await item("public", true);
	await item("private", true);
	const report = await verifyRestore(db, migrations);
	expect(report.problems).toContain(
		"1 private item(s) have a published revision",
	);
});

it("reports when there is nothing to check through the public reader", async () => {
	const report = await verifyRestore(db, migrations);
	expect(report.problems).toContain("no public item to read");
	expect(report.problems).toContain("no private item to read");
});
