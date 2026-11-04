import { expect, it } from "vitest";
import { matches, parseQuery, yearSpan } from "../../src/services/search";

it("splits words and years, lowercases words, and caps length and count", () => {
	expect(parseQuery("  Haifa 1985  race ")).toEqual({ words: ["haifa", "race"], years: [1985] });
	expect(parseQuery("")).toEqual({ words: [], years: [] });
	expect(parseQuery("999 3000 12345")).toEqual({ words: ["999", "3000", "12345"], years: [] });
	expect(parseQuery("1000 2999")).toEqual({ words: [], years: [1000, 2999] });
	const many = Array.from({ length: 15 }, (_, i) => `w${i}`).join(" ");
	expect(parseQuery(many).words).toHaveLength(10);
	expect(parseQuery(`${"a".repeat(250)} tail`)).toEqual({ words: ["a".repeat(200)], years: [] });
});

it("gives each date its year span", () => {
	expect(yearSpan({ kind: "unknown" })).toBeNull();
	expect(yearSpan({ kind: "single", start: "1975-03-12", precision: "day", approximate: false })).toEqual([1975, 1975]);
	expect(yearSpan({ kind: "single", start: "1975-03-01", precision: "month", approximate: false })).toEqual([1975, 1975]);
	expect(yearSpan({ kind: "single", start: "1975-01-01", precision: "year", approximate: true })).toEqual([1975, 1975]);
	expect(yearSpan({ kind: "single", start: "1970-01-01", precision: "decade", approximate: false })).toEqual([1970, 1979]);
	expect(
		yearSpan({ kind: "range", start: "1970-01-01", end: "1974-01-01", precision: "year", approximate: false }),
	).toEqual([1970, 1974]);
	expect(
		yearSpan({ kind: "range", start: "1960-01-01", end: "1970-01-01", precision: "decade", approximate: false }),
	).toEqual([1960, 1979]);
});

const doc = (texts: string[], start = "1985-06-01") => ({
	texts,
	date: { kind: "single" as const, start, precision: "day" as const, approximate: false },
});

it("needs every word in some text and every year in the span", () => {
	const item = doc(["Race in Haifa", "running", "Synthetic Person"]);
	expect(matches(item, parseQuery(""))).toBe(true);
	expect(matches(item, parseQuery("haifa"))).toBe(true);
	expect(matches(item, parseQuery("HAIFA run"))).toBe(true);
	expect(matches(item, parseQuery("haifa swim"))).toBe(false);
	expect(matches(item, parseQuery("1985"))).toBe(true);
	expect(matches(item, parseQuery("1986"))).toBe(false);
	expect(matches(item, parseQuery("haifa 1985"))).toBe(true);
	expect(matches(item, parseQuery("haifa 1984"))).toBe(false);
	expect(matches({ texts: ["x"], date: { kind: "unknown" } }, parseQuery("1985"))).toBe(false);
});

it("matches Hebrew substrings, including with a prefix letter", () => {
	expect(matches(doc(["מרוץ בחיפה"]), parseQuery("חיפה"))).toBe(true);
	expect(matches(doc(["חיפה"]), parseQuery("בחיפה"))).toBe(false);
});

it("treats % and _ literally", () => {
	expect(matches(doc(["50% off"]), parseQuery("50%"))).toBe(true);
	expect(matches(doc(["abc"]), parseQuery("%"))).toBe(false);
	expect(matches(doc(["abc"]), parseQuery("a_c"))).toBe(false);
});
