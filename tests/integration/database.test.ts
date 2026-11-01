import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDatabase } from "../../src/lib/database";
import { requireTestDatabaseUrl } from "../../src/lib/config";
const db = createDatabase(requireTestDatabaseUrl(process.env));
beforeAll(async () => {
	await db.user.deleteMany();
});
afterAll(async () => {
	await db.user.deleteMany();
	await db.$disconnect();
});
it("persists explicit synthetic membership with safe role/status defaults", async () => {
	const user = await db.user.create({
		data: { email: "fixture@example.test" },
	});
	expect(user.role).toBe("member");
	expect(user.emailVerified).toBe(false);
	expect(user.status).toBe("active");
	expect(user.accessVersion).toBe(1);
	await expect(
		db.user.create({ data: { email: "fixture@example.test" } }),
	).rejects.toThrow();
	expect(await db.user.count()).toBe(1);
});

it("applies the initial migration in isolation and rolls it back without touching public data", async () => {
	const client = new Client({
		connectionString: requireTestDatabaseUrl(process.env),
	});
	const schema = `round_trip_${randomUUID().replaceAll("-", "")}`;
	await client.connect();
	try {
		await client.query("BEGIN");
		await client.query(`CREATE SCHEMA "${schema}"`);
		await client.query(`SET LOCAL search_path TO "${schema}"`);
		const migration = await readFile(
			new URL(
				"../../prisma/migrations/20261101000000_member_access/migration.sql",
				import.meta.url,
			),
			"utf8",
		);
		await client.query(migration);
		await client.query(
			`INSERT INTO "User" (id, email, "updatedAt") VALUES ('migration-fixture', 'migration@example.test', CURRENT_TIMESTAMP)`,
		);
		const result = await client.query(
			`SELECT role, status, "emailVerified" FROM "User" WHERE id = 'migration-fixture'`,
		);
		expect(result.rows).toEqual([
			{ role: "member", status: "active", emailVerified: false },
		]);
		await client.query("ROLLBACK");
		expect(
			(
				await client.query(
					"SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
					[schema],
				)
			).rows,
		).toEqual([]);
	} finally {
		await client.query("ROLLBACK");
		await client.end();
	}
});
