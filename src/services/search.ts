import type { DateValue } from "./item-input";

// Public search matching (spec 2026-11-05). Pure, so the family-only and year
// rules are unit-tested; callers pass only published, public text.
const MAX_LENGTH = 200;
const MAX_WORDS = 10;
const YEAR = /^[12]\d{3}$/;

export type SearchQuery = { words: string[]; years: number[] };

export function parseQuery(text: string): SearchQuery {
	const parts = text.slice(0, MAX_LENGTH).split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
	const query: SearchQuery = { words: [], years: [] };
	for (const part of parts) {
		if (YEAR.test(part)) query.years.push(Number(part));
		else query.words.push(part.toLocaleLowerCase());
	}
	return query;
}

// A date covers its whole precision: a decade from its start year runs ten years.
export function yearSpan(date: DateValue): [number, number] | null {
	if (date.kind === "unknown") return null;
	const year = (value: string) => Number(value.slice(0, 4));
	const last = year(date.kind === "range" ? date.end : date.start);
	return [year(date.start), date.precision === "decade" ? last + 9 : last];
}

export function matches(
	doc: { texts: string[]; date: DateValue },
	query: SearchQuery,
): boolean {
	const texts = doc.texts.map((text) => text.toLocaleLowerCase());
	const span = yearSpan(doc.date);
	return (
		query.words.every((word) => texts.some((text) => text.includes(word))) &&
		query.years.every((year) => span !== null && span[0] <= year && year <= span[1])
	);
}
