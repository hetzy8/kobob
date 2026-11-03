import "server-only";
import type { DateValue, ItemTypeValue } from "./item-input";

export const revisionInclude = {
	people: { include: { person: true } },
	places: { include: { place: true } },
} as const;

type DateRow = {
	dateKind: "unknown" | "single" | "range";
	dateStart: Date | null;
	dateEnd: Date | null;
	datePrecision: "day" | "month" | "year" | "decade" | null;
	dateApproximate: boolean;
};
type RevisionRow = DateRow & {
	title: string;
	description: string;
	types: ItemTypeValue[];
	tags: string[];
	people: { person: { id: string; name: string; familyOnly: boolean } }[];
	places: { place: { id: string; name: string } }[];
};
export type RevisionView = {
	title: string;
	description: string;
	types: ItemTypeValue[];
	date: DateValue;
	tags: string[];
	people: { id: string; name: string }[];
	places: { id: string; name: string }[];
};

const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? "";

export function dateFromRow(row: DateRow): DateValue {
	if (row.dateKind === "unknown" || !row.datePrecision)
		return { kind: "unknown" };
	if (row.dateKind === "single")
		return {
			kind: "single",
			start: day(row.dateStart),
			precision: row.datePrecision,
			approximate: row.dateApproximate,
		};
	return {
		kind: "range",
		start: day(row.dateStart),
		end: day(row.dateEnd),
		precision: row.datePrecision,
		approximate: row.dateApproximate,
	};
}

export function dateToRow(date: DateValue): DateRow {
	const at = (value: string) => new Date(`${value}T00:00:00Z`);
	if (date.kind === "unknown")
		return {
			dateKind: "unknown",
			dateStart: null,
			dateEnd: null,
			datePrecision: null,
			dateApproximate: false,
		};
	return {
		dateKind: date.kind,
		dateStart: at(date.start),
		dateEnd: date.kind === "range" ? at(date.end) : null,
		datePrecision: date.precision,
		dateApproximate: date.approximate,
	};
}

// publicOnly drops people marked family-only. Callers on public paths must
// pass true; the family editor passes false so members see everyone.
export function toRevisionView(
	row: RevisionRow,
	{ publicOnly }: { publicOnly: boolean },
): RevisionView {
	const byName = <T extends { name: string }>(a: T, b: T) =>
		a.name.localeCompare(b.name, "he");
	return {
		title: row.title,
		description: row.description,
		types: row.types,
		date: dateFromRow(row),
		tags: row.tags,
		people: row.people
			.map((link) => link.person)
			.filter((person) => !publicOnly || !person.familyOnly)
			.map(({ id, name }) => ({ id, name }))
			.sort(byName),
		places: row.places
			.map(({ place }) => ({ id: place.id, name: place.name }))
			.sort(byName),
	};
}
