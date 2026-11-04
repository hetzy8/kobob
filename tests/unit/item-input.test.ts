import { describe, expect, it } from "vitest";
import {
	itemInputSchema,
	personInputSchema,
	placeInputSchema,
} from "../../src/services/item-input";

const valid = {
	title: " Synthetic title ",
	description: "",
	types: ["picture"],
	date: { kind: "unknown" },
	tags: [],
	personIds: [],
	placeIds: [],
};

describe("itemInputSchema", () => {
	it("trims the title and accepts an unknown date", () => {
		const parsed = itemInputSchema.parse(valid);
		expect(parsed.title).toBe("Synthetic title");
		expect(parsed.date).toEqual({ kind: "unknown" });
	});
	it("rejects an empty or too long title", () => {
		expect(itemInputSchema.safeParse({ ...valid, title: "  " }).success).toBe(false);
		expect(
			itemInputSchema.safeParse({ ...valid, title: "x".repeat(201) }).success,
		).toBe(false);
	});
	it("limits description, types, tags, people and places", () => {
		const tooMany = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`);
		expect(
			itemInputSchema.safeParse({ ...valid, description: "x".repeat(20001) }).success,
		).toBe(false);
		expect(itemInputSchema.safeParse({ ...valid, types: [] }).success).toBe(false);
		expect(itemInputSchema.safeParse({ ...valid, types: ["film"] }).success).toBe(false);
		expect(itemInputSchema.safeParse({ ...valid, tags: tooMany(31) }).success).toBe(false);
		expect(
			itemInputSchema.safeParse({ ...valid, tags: ["x".repeat(51)] }).success,
		).toBe(false);
		expect(itemInputSchema.safeParse({ ...valid, personIds: tooMany(51) }).success).toBe(false);
		expect(itemInputSchema.safeParse({ ...valid, placeIds: tooMany(51) }).success).toBe(false);
	});
	it("removes duplicate types, tags and links", () => {
		const parsed = itemInputSchema.parse({
			...valid,
			types: ["picture", "picture", "video"],
			tags: ["a", " a ", "b"],
			personIds: ["p1", "p1"],
			placeIds: ["l1", "l1"],
		});
		expect(parsed.types).toEqual(["picture", "video"]);
		expect(parsed.tags).toEqual(["a", "b"]);
		expect(parsed.personIds).toEqual(["p1"]);
		expect(parsed.placeIds).toEqual(["l1"]);
	});
	it("accepts single dates that start their period", () => {
		for (const [start, precision] of [
			["1975-03-12", "day"],
			["1975-03-01", "month"],
			["1975-01-01", "year"],
			["1970-01-01", "decade"],
		] as const)
			expect(
				itemInputSchema.safeParse({
					...valid,
					date: { kind: "single", start, precision, approximate: false },
				}).success,
			).toBe(true);
	});
	it("rejects dates that do not start their period or do not exist", () => {
		for (const [start, precision] of [
			["1975-03-12", "month"],
			["1975-03-01", "year"],
			["1975-01-01", "decade"],
			["1975-02-30", "day"],
			["75-01-01", "year"],
		] as const)
			expect(
				itemInputSchema.safeParse({
					...valid,
					date: { kind: "single", start, precision, approximate: false },
				}).success,
			).toBe(false);
	});
	it("requires a range end on or after its start", () => {
		const range = (start: string, end: string) =>
			itemInputSchema.safeParse({
				...valid,
				date: { kind: "range", start, end, precision: "year", approximate: true },
			}).success;
		expect(range("1970-01-01", "1979-01-01")).toBe(true);
		expect(range("1970-01-01", "1970-01-01")).toBe(true);
		expect(range("1979-01-01", "1970-01-01")).toBe(false);
	});
	it("rejects date values on an unknown date", () => {
		expect(
			itemInputSchema.safeParse({
				...valid,
				date: { kind: "unknown", start: "1975-01-01" },
			}).success,
		).toBe(false);
	});
});

describe("person and place input", () => {
	it("validates names and the family-only switch", () => {
		expect(
			personInputSchema.parse({ name: " Synthetic Person ", otherNames: [], familyOnly: true }),
		).toEqual({ name: "Synthetic Person", otherNames: [], familyOnly: true });
		expect(
			personInputSchema.safeParse({ name: "", otherNames: [], familyOnly: false }).success,
		).toBe(false);
	});
	it("requires both coordinates or neither, within range", () => {
		const place = (latitude: number | null, longitude: number | null) =>
			placeInputSchema.safeParse({
				name: "Synthetic Place",
				otherNames: [],
				latitude,
				longitude,
			}).success;
		expect(place(null, null)).toBe(true);
		expect(place(32.5, 35.1)).toBe(true);
		expect(place(32.5, null)).toBe(false);
		expect(place(null, 35.1)).toBe(false);
		expect(place(91, 35.1)).toBe(false);
		expect(place(32.5, 181)).toBe(false);
	});
});
