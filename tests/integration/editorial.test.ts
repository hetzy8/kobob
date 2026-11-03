import { afterAll, beforeEach, expect, it } from "vitest";
import { createDatabase } from "../../src/lib/database";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import { createEditorialService } from "../../src/services/editorial";
import type { ItemInput } from "../../src/services/item-input";

const db = createDatabase(requireTestDatabaseUrl(process.env));
async function clean() {
	await db.editorialAudit.deleteMany();
	await db.item.deleteMany();
	await db.person.deleteMany();
	await db.place.deleteMany();
	await db.session.deleteMany();
	await db.user.deleteMany();
}
beforeEach(clean);
afterAll(async () => {
	await clean();
	await db.$disconnect();
});

const input = (title = "Synthetic title"): ItemInput => ({
	title,
	description: "Synthetic description",
	types: ["picture"],
	date: {
		kind: "single",
		start: "1975-01-01",
		precision: "year",
		approximate: false,
	},
	tags: ["synthetic"],
	personIds: [],
	placeIds: [],
});

async function member(email: string) {
	const user = await db.user.create({
		data: { email, emailVerified: true },
	});
	return createEditorialService(db, async () => ({
		id: user.id,
		role: "member",
		accessVersion: user.accessVersion,
	}));
}

it("creates items as private and lets another member edit them", async () => {
	const a = await member("a@example.test");
	const b = await member("b@example.test");
	const { id, version } = await a.createItem(input());
	expect(version).toBe(1);
	const created = await b.getItem(id);
	expect(created.state).toBe("active");
	expect(created.visibility).toBe("private");
	expect(created.working.title).toBe("Synthetic title");
	const saved = await b.updateItem(id, 1, input("Edited by b"));
	expect(saved.version).toBe(2);
	expect((await a.getItem(id)).working.title).toBe("Edited by b");
});

it("keeps the published revision unchanged while a public item is edited", async () => {
	const a = await member("a@example.test");
	const { id } = await a.createItem(input("First"));
	await a.transitionItem(id, 1, "publish");
	const before = await db.item.findUniqueOrThrow({ where: { id } });
	expect(before.visibility).toBe("public");
	expect(before.publishedRevisionId).toBe(before.workingRevisionId);
	await a.updateItem(id, 2, input("Second"));
	const after = await db.item.findUniqueOrThrow({
		where: { id },
		include: { publishedRevision: true, workingRevision: true },
	});
	expect(after.publishedRevision?.title).toBe("First");
	expect(after.workingRevision?.title).toBe("Second");
	expect((await a.getItem(id)).hasUnpublishedEdits).toBe(true);
	await a.transitionItem(id, 3, "publish");
	const republished = await db.item.findUniqueOrThrow({
		where: { id },
		include: { publishedRevision: true },
	});
	expect(republished.publishedRevision?.title).toBe("Second");
	expect((await a.getItem(id)).hasUnpublishedEdits).toBe(false);
});

it("make private, archive and restore never bring back an older public version", async () => {
	const a = await member("a@example.test");
	const { id } = await a.createItem(input("Old public"));
	await a.transitionItem(id, 1, "publish");
	await a.transitionItem(id, 2, "make-private");
	let row = await db.item.findUniqueOrThrow({ where: { id } });
	expect(row.visibility).toBe("private");
	expect(row.publishedRevisionId).toBeNull();
	expect(row.publishedAt).toBeNull();
	await a.transitionItem(id, 3, "publish");
	await a.transitionItem(id, 4, "archive");
	row = await db.item.findUniqueOrThrow({ where: { id } });
	expect(row.state).toBe("archived");
	expect(row.visibility).toBe("private");
	expect(row.publishedRevisionId).toBeNull();
	await a.transitionItem(id, 5, "restore");
	row = await db.item.findUniqueOrThrow({ where: { id } });
	expect(row.state).toBe("active");
	expect(row.visibility).toBe("private");
	expect(row.publishedRevisionId).toBeNull();
	await a.updateItem(id, 6, input("New text"));
	await a.transitionItem(id, 7, "publish");
	const published = await db.item.findUniqueOrThrow({
		where: { id },
		include: { publishedRevision: true },
	});
	expect(published.publishedRevision?.title).toBe("New text");
});

it("refuses actions that do not fit the current state, changing nothing", async () => {
	const a = await member("a@example.test");
	const { id } = await a.createItem(input());
	await expect(a.transitionItem(id, 1, "make-private")).rejects.toThrow(
		"CONFLICT",
	);
	await expect(a.transitionItem(id, 1, "restore")).rejects.toThrow("CONFLICT");
	await a.transitionItem(id, 1, "publish");
	await expect(a.transitionItem(id, 2, "publish")).rejects.toThrow("CONFLICT");
	await a.transitionItem(id, 2, "archive");
	await expect(a.updateItem(id, 3, input("x"))).rejects.toThrow("CONFLICT");
	await expect(a.transitionItem(id, 3, "archive")).rejects.toThrow("CONFLICT");
	const row = await db.item.findUniqueOrThrow({ where: { id } });
	expect(row.version).toBe(3);
});

it("fails a stale version without changing anything", async () => {
	const a = await member("a@example.test");
	const b = await member("b@example.test");
	const { id } = await a.createItem(input("Original"));
	await a.updateItem(id, 1, input("A wins"));
	await expect(b.updateItem(id, 1, input("B stale"))).rejects.toThrow(
		"CONFLICT",
	);
	await expect(b.transitionItem(id, 1, "publish")).rejects.toThrow("CONFLICT");
	const row = await db.item.findUniqueOrThrow({
		where: { id },
		include: { workingRevision: true },
	});
	expect(row.version).toBe(2);
	expect(row.visibility).toBe("private");
	expect(row.workingRevision?.title).toBe("A wins");
});

it("lets exactly one of two concurrent actions on the same version succeed", async () => {
	const a = await member("a@example.test");
	const b = await member("b@example.test");
	const pairs: [() => Promise<unknown>, () => Promise<unknown>][] = [];
	const { id: first } = await a.createItem(input());
	pairs.push([
		() => a.updateItem(first, 1, input("Save")),
		() => b.transitionItem(first, 1, "publish"),
	]);
	const { id: second } = await a.createItem(input());
	await a.transitionItem(second, 1, "publish");
	pairs.push([
		() => a.transitionItem(second, 2, "archive"),
		() => b.transitionItem(second, 2, "make-private"),
	]);
	for (const [x, y] of pairs) {
		const results = await Promise.allSettled([x(), y()]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		const failed = results.find((r) => r.status === "rejected");
		expect((failed as PromiseRejectedResult).reason.message).toBe("CONFLICT");
	}
	const firstRow = await db.item.findUniqueOrThrow({ where: { id: first } });
	expect(firstRow.version).toBe(2);
});

it("refuses non-members and revoked members on every function", async () => {
	const a = await member("a@example.test");
	const { id } = await a.createItem(input());
	const anonymous = createEditorialService(db, async () => {
		throw new Error("UNAUTHORIZED");
	});
	const revokedUser = await db.user.create({
		data: { email: "revoked@example.test", emailVerified: true },
	});
	const revoked = createEditorialService(db, async () => ({
		id: revokedUser.id,
		role: "member",
		accessVersion: revokedUser.accessVersion,
	}));
	await db.user.update({
		where: { id: revokedUser.id },
		data: { status: "revoked", accessVersion: { increment: 1 } },
	});
	for (const service of [anonymous, revoked])
		for (const operation of [
			() => service.createItem(input()),
			() => service.updateItem(id, 1, input()),
			() => service.transitionItem(id, 1, "publish"),
			() => service.getItem(id),
			() => service.listItems(),
			() => service.listArchived(),
		])
			await expect(operation()).rejects.toThrow(/UNAUTHORIZED|FORBIDDEN/);
	expect((await db.item.findUniqueOrThrow({ where: { id } })).version).toBe(1);
});

it("offers members no permanent delete", async () => {
	const a = await member("a@example.test");
	expect(Object.keys(a)).not.toContain("deleteItem");
	expect(Object.keys(a).some((key) => /delete|purge|destroy/i.test(key))).toBe(
		false,
	);
});

it("rejects links to people or places that do not exist", async () => {
	const a = await member("a@example.test");
	await expect(
		a.createItem({ ...input(), personIds: ["missing"] }),
	).rejects.toThrow("INVALID_REFERENCE");
	expect(await db.item.count()).toBe(0);
});

it("lists active and archived items with labels, and audits without content", async () => {
	const a = await member("a@example.test");
	const { id: kept } = await a.createItem(input("Kept"));
	const { id: gone } = await a.createItem(input("Gone"));
	await a.transitionItem(kept, 1, "publish");
	await a.updateItem(kept, 2, input("Kept edited"));
	await a.transitionItem(gone, 1, "archive");
	expect(await a.listItems()).toEqual([
		{
			id: kept,
			title: "Kept edited",
			visibility: "public",
			hasUnpublishedEdits: true,
		},
	]);
	expect(await a.listArchived()).toEqual([
		{
			id: gone,
			title: "Gone",
			visibility: "private",
			hasUnpublishedEdits: false,
		},
	]);
	const audit = await db.editorialAudit.findMany();
	expect(audit.map((row) => row.action).sort()).toEqual([
		"archive",
		"create",
		"create",
		"publish",
		"save",
	]);
	const text = JSON.stringify(audit);
	for (const word of ["Kept", "Gone", "Synthetic"])
		expect(text).not.toContain(word);
});

it("returns NOT_FOUND for an unknown item", async () => {
	const a = await member("a@example.test");
	await expect(a.getItem("missing")).rejects.toThrow("NOT_FOUND");
	await expect(a.updateItem("missing", 1, input())).rejects.toThrow(
		"NOT_FOUND",
	);
	await expect(a.transitionItem("missing", 1, "publish")).rejects.toThrow(
		"NOT_FOUND",
	);
});

it("creates and edits people and places with version checks", async () => {
	const a = await member("a@example.test");
	const b = await member("b@example.test");
	const person = await a.savePerson({
		name: "Synthetic Person",
		otherNames: ["Synthetic Alias"],
		familyOnly: false,
	});
	expect(person.version).toBe(1);
	await b.savePerson(
		{ name: "Synthetic Person B", otherNames: [], familyOnly: true },
		{ id: person.id, expectedVersion: 1 },
	);
	await expect(
		a.savePerson(
			{ name: "Stale", otherNames: [], familyOnly: false },
			{ id: person.id, expectedVersion: 1 },
		),
	).rejects.toThrow("CONFLICT");
	expect(await a.listPeople()).toEqual([
		{
			id: person.id,
			name: "Synthetic Person B",
			otherNames: [],
			familyOnly: true,
			version: 2,
		},
	]);
	const place = await a.savePlace({
		name: "Synthetic Place",
		otherNames: [],
		latitude: 32.5,
		longitude: 35.1,
	});
	await a.savePlace(
		{ name: "Synthetic Place", otherNames: [], latitude: null, longitude: null },
		{ id: place.id, expectedVersion: 1 },
	);
	expect(await a.listPlaces()).toEqual([
		{
			id: place.id,
			name: "Synthetic Place",
			otherNames: [],
			latitude: null,
			longitude: null,
			version: 2,
		},
	]);
	await expect(
		a.savePlace(
			{ name: "x", otherNames: [], latitude: null, longitude: null },
			{ id: "missing", expectedVersion: 1 },
		),
	).rejects.toThrow("NOT_FOUND");
	const actions = (await db.editorialAudit.findMany()).map(
		(row) => `${row.targetType}:${row.action}`,
	);
	expect(actions.sort()).toEqual(
		["person:create", "person:save", "place:create", "place:save"].sort(),
	);
	expect(JSON.stringify(await db.editorialAudit.findMany())).not.toContain("Synthetic");
});

it("links people and places to the working revision only", async () => {
	const a = await member("a@example.test");
	const person = await a.savePerson({ name: "Synthetic Person", otherNames: [], familyOnly: false });
	const place = await a.savePlace({
		name: "Synthetic Place",
		otherNames: [],
		latitude: null,
		longitude: null,
	});
	const { id } = await a.createItem({ ...input(), personIds: [person.id], placeIds: [place.id] });
	await a.transitionItem(id, 1, "publish");
	await a.updateItem(id, 2, { ...input(), personIds: [], placeIds: [] });
	const item = await a.getItem(id);
	expect(item.working.people).toEqual([]);
	const published = await db.item.findUniqueOrThrow({
		where: { id },
		include: { publishedRevision: { include: { people: true, places: true } } },
	});
	expect(published.publishedRevision?.people.map((p) => p.personId)).toEqual([person.id]);
	expect(published.publishedRevision?.places.map((p) => p.placeId)).toEqual([place.id]);
});

it("refuses non-members on people and places", async () => {
	const anonymous = createEditorialService(db, async () => {
		throw new Error("UNAUTHORIZED");
	});
	for (const operation of [
		() => anonymous.listPeople(),
		() => anonymous.listPlaces(),
		() => anonymous.savePerson({ name: "x", otherNames: [], familyOnly: false }),
		() =>
			anonymous.savePlace({ name: "x", otherNames: [], latitude: null, longitude: null }),
	])
		await expect(operation()).rejects.toThrow("UNAUTHORIZED");
});
