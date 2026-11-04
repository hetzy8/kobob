import { afterAll, beforeEach, expect, it } from "vitest";
import { createDatabase } from "../../src/lib/database";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import { createEditorialService } from "../../src/services/editorial";
import { createArchiveReader } from "../../src/services/archive";
import type { ItemInput } from "../../src/services/item-input";

const db = createDatabase(requireTestDatabaseUrl(process.env));
const reader = createArchiveReader(db);
async function clean() {
	await db.editorialAudit.deleteMany();
	await db.item.deleteMany();
	await db.person.deleteMany();
	await db.place.deleteMany();
	await db.user.deleteMany();
}
beforeEach(clean);
afterAll(async () => {
	await clean();
	await db.$disconnect();
});
async function editor() {
	const user = await db.user.create({ data: { email: "a@example.test", emailVerified: true } });
	return createEditorialService(db, async () => ({
		id: user.id,
		role: "member",
		accessVersion: user.accessVersion,
	}));
}
const input = (title: string, extra: Partial<ItemInput> = {}): ItemInput => ({
	title,
	description: `${title} description`,
	types: ["article"],
	date: { kind: "unknown" },
	tags: [],
	personIds: [],
	placeIds: [],
	...extra,
});

it("shows only published items, and only their published version", async () => {
	const a = await editor();
	const { id: shown } = await a.createItem(input("Published text"));
	await a.createItem(input("Private text"));
	await a.transitionItem(shown, 1, "publish");
	await a.updateItem(shown, 2, input("Unpublished draft"));
	expect(await reader.listPublicItems()).toEqual([
		{ id: shown, title: "Published text", types: ["article"], date: { kind: "unknown" } },
	]);
	const item = await reader.getPublicItem(shown);
	expect(item?.title).toBe("Published text");
	expect(item?.description).toBe("Published text description");
	expect(JSON.stringify(await reader.listPublicItems())).not.toContain("Unpublished draft");
	expect(JSON.stringify(await reader.listPublicItems())).not.toContain("Private text");
});

it("hides items on the next read after make private or archive", async () => {
	const a = await editor();
	const { id } = await a.createItem(input("Public then private"));
	await a.transitionItem(id, 1, "publish");
	expect(await reader.getPublicItem(id)).not.toBeNull();
	await a.transitionItem(id, 2, "make-private");
	expect(await reader.getPublicItem(id)).toBeNull();
	await a.transitionItem(id, 3, "publish");
	await a.transitionItem(id, 4, "archive");
	expect(await reader.getPublicItem(id)).toBeNull();
	await a.transitionItem(id, 5, "restore");
	expect(await reader.getPublicItem(id)).toBeNull();
	expect(await reader.listPublicItems()).toEqual([]);
	expect(await reader.getPublicItem("missing")).toBeNull();
});

it("never shows family-only people, and shows places and other people", async () => {
	const a = await editor();
	const hidden = await a.savePerson({ name: "Hidden Person", otherNames: [], familyOnly: true });
	const shown = await a.savePerson({ name: "Shown Person", otherNames: [], familyOnly: false });
	const place = await a.savePlace({
		name: "Synthetic Place",
		otherNames: [],
		latitude: null,
		longitude: null,
	});
	const { id } = await a.createItem(
		input("With people", { personIds: [hidden.id, shown.id], placeIds: [place.id] }),
	);
	await a.transitionItem(id, 1, "publish");
	const item = await reader.getPublicItem(id);
	expect(item?.people).toEqual([{ id: shown.id, name: "Shown Person" }]);
	expect(item?.places).toEqual([{ id: place.id, name: "Synthetic Place" }]);
	expect(JSON.stringify(item)).not.toContain("Hidden Person");
	await a.savePerson(
		{ name: "Shown Person", otherNames: [], familyOnly: true },
		{ id: shown.id, expectedVersion: 1 },
	);
	expect((await reader.getPublicItem(id))?.people).toEqual([]);
});

it("orders the public list by publication, newest first", async () => {
	const a = await editor();
	const { id: older } = await a.createItem(input("Older"));
	const { id: newer } = await a.createItem(input("Newer"));
	await a.transitionItem(older, 1, "publish");
	await new Promise((resolve) => setTimeout(resolve, 10));
	await a.transitionItem(newer, 1, "publish");
	await a.updateItem(older, 2, input("Older draft edit"));
	expect((await reader.listPublicItems()).map((item) => item.id)).toEqual([newer, older]);
});
