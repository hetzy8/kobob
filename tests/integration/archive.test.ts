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

it("searches the published revision's text, tags, people and places", async () => {
	const a = await editor();
	const person = await a.savePerson({ name: "Synthetic Runner", otherNames: ["Nickname Runner"], familyOnly: false });
	const place = await a.savePlace({ name: "Synthetic Harbor", otherNames: ["Old Harbor"], latitude: null, longitude: null });
	const { id } = await a.createItem(
		input("Race report", {
			description: "A long morning",
			tags: ["marathon"],
			personIds: [person.id],
			placeIds: [place.id],
		}),
	);
	await a.createItem(input("Unrelated private"));
	await a.transitionItem(id, 1, "publish");
	for (const text of ["race", "MORNING", "marath", "synthetic runner", "harbor", "old harbor", "race harbor"]) {
		expect((await reader.searchPublicItems(text)).map((item) => item.id), text).toEqual([id]);
	}
	expect(await reader.searchPublicItems("nickname")).toEqual([]);
	expect(await reader.searchPublicItems("race swimming")).toEqual([]);
	expect(await reader.searchPublicItems("unrelated")).toEqual([]);
	expect((await reader.searchPublicItems("")).map((item) => item.id)).toEqual([id]);
});

it("matches years by the date's whole period", async () => {
	const a = await editor();
	const make = async (title: string, date: ItemInput["date"]) => {
		const { id } = await a.createItem(input(title, { date }));
		await a.transitionItem(id, 1, "publish");
		return id;
	};
	const day = await make("Day", { kind: "single", start: "1985-06-01", precision: "day", approximate: false });
	const decade = await make("Decade", { kind: "single", start: "1980-01-01", precision: "decade", approximate: true });
	const range = await make("Range", { kind: "range", start: "1983-01-01", end: "1986-01-01", precision: "year", approximate: false });
	await make("Undated", { kind: "unknown" });
	const ids = async (text: string) => (await reader.searchPublicItems(text)).map((item) => item.id).sort();
	expect(await ids("1985")).toEqual([day, decade, range].sort());
	expect(await ids("1989")).toEqual([decade]);
	expect(await ids("1983")).toEqual([decade, range].sort());
	expect(await ids("1990")).toEqual([]);
	expect(await ids("day 1985")).toEqual([day]);
});

it("never searches private, archived or unpublished text", async () => {
	const a = await editor();
	const { id: published } = await a.createItem(input("Visible title"));
	await a.transitionItem(published, 1, "publish");
	await a.updateItem(published, 2, input("Draftonly title"));
	await a.createItem(input("Privateonly title"));
	const { id: archived } = await a.createItem(input("Archivedonly title"));
	await a.transitionItem(archived, 1, "publish");
	await a.transitionItem(archived, 2, "archive");
	expect(await reader.searchPublicItems("draftonly")).toEqual([]);
	expect(await reader.searchPublicItems("privateonly")).toEqual([]);
	expect(await reader.searchPublicItems("archivedonly")).toEqual([]);
	expect((await reader.searchPublicItems("visible")).map((item) => item.id)).toEqual([published]);
});

it("never finds an item by a family-only person's names", async () => {
	const a = await editor();
	const hidden = await a.savePerson({ name: "Hiddenname Person", otherNames: ["Hiddenalias"], familyOnly: true });
	const { id } = await a.createItem(input("Group photo", { personIds: [hidden.id] }));
	await a.transitionItem(id, 1, "publish");
	expect(await reader.searchPublicItems("hiddenname")).toEqual([]);
	expect(await reader.searchPublicItems("hiddenalias")).toEqual([]);
	expect((await reader.searchPublicItems("group")).map((item) => item.id)).toEqual([id]);
	expect(JSON.stringify(await reader.searchPublicItems("group"))).not.toContain("Hidden");
});

it("matches % and _ literally", async () => {
	const a = await editor();
	const { id } = await a.createItem(input("Fifty 50% done"));
	await a.transitionItem(id, 1, "publish");
	expect((await reader.searchPublicItems("50%")).map((item) => item.id)).toEqual([id]);
	expect(await reader.searchPublicItems("%%")).toEqual([]);
	expect(await reader.searchPublicItems("fift_")).toEqual([]);
});
