import type { Database } from "../lib/database";
import { createArchiveReader } from "../services/archive";

export type RestoreReport = {
	latestAppliedMigration: string | null;
	newestMigration: string | null;
	tables: Record<string, number>;
	itemsByOriginAndVisibility: Record<string, number>;
	problems: string[];
};

// Counts and identifiers of migrations only: the report is compared by hand
// and must never carry content.
export async function verifyRestore(
	db: Database,
	migrationNames: string[],
): Promise<RestoreReport> {
	const problems: string[] = [];

	const [applied] = await db.$queryRaw<{ migration_name: string }[]>`
		SELECT migration_name FROM "_prisma_migrations"
		WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
		ORDER BY migration_name DESC LIMIT 1`;
	const latestAppliedMigration = applied?.migration_name ?? null;
	const newestMigration = [...migrationNames].sort().at(-1) ?? null;
	if (latestAppliedMigration !== newestMigration)
		problems.push(
			`latest applied migration ${latestAppliedMigration} is not the newest ${newestMigration}`,
		);

	const names = await db.$queryRaw<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
	const tables: Record<string, number> = {};
	for (const { tablename } of names) {
		// Names come from the catalog, not from input.
		const [row] = await db.$queryRawUnsafe<{ count: number }[]>(
			`SELECT count(*)::int AS count FROM "${tablename.replaceAll('"', '""')}"`,
		);
		tables[tablename] = row.count;
	}

	const groups = await db.item.groupBy({
		by: ["origin", "visibility"],
		_count: { _all: true },
		orderBy: [{ origin: "asc" }, { visibility: "asc" }],
	});
	const itemsByOriginAndVisibility = Object.fromEntries(
		groups.map((group) => [
			`${group.origin}/${group.visibility}`,
			group._count._all,
		]),
	);

	const unpublishedPublic = await db.item.count({
		where: { visibility: "public", publishedRevisionId: null },
	});
	if (unpublishedPublic)
		problems.push(
			`${unpublishedPublic} public item(s) have no published revision`,
		);
	const publishedPrivate = await db.item.count({
		where: { visibility: "private", publishedRevisionId: { not: null } },
	});
	if (publishedPrivate)
		problems.push(
			`${publishedPrivate} private item(s) have a published revision`,
		);

	const reader = createArchiveReader(db);
	const publicItem = await db.item.findFirst({
		where: {
			state: "active",
			visibility: "public",
			publishedRevisionId: { not: null },
		},
		orderBy: { id: "asc" },
		select: { id: true },
	});
	if (!publicItem) problems.push("no public item to read");
	else if (!(await reader.getPublicItem(publicItem.id)))
		problems.push("the public reader did not return a public item");
	const privateItem = await db.item.findFirst({
		where: { visibility: "private" },
		orderBy: { id: "asc" },
		select: { id: true },
	});
	if (!privateItem) problems.push("no private item to read");
	else if (await reader.getPublicItem(privateItem.id))
		problems.push("the public reader returned a private item");

	return {
		latestAppliedMigration,
		newestMigration,
		tables,
		itemsByOriginAndVisibility,
		problems,
	};
}
