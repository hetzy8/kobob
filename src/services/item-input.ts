import { z } from "zod";

export const itemTypes = [
	"picture",
	"video",
	"audio",
	"drawing",
	"article",
	"interview",
	"document",
	"other",
] as const;
export type ItemTypeValue = (typeof itemTypes)[number];
export const datePrecisions = ["day", "month", "year", "decade"] as const;

const unique = <T>(values: T[]) => [...new Set(values)];
const id = z.string().min(1).max(64);

// A stored date is the first day of its period: 1975-03-01 for March 1975,
// 1970-01-01 for the 1970s. Unknown stays unknown; nothing is guessed.
const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((value) => {
		const date = new Date(`${value}T00:00:00Z`);
		return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
	}, "INVALID_DATE");
function startsPeriod(value: string, precision: (typeof datePrecisions)[number]) {
	const [year, month, day] = value.split("-").map(Number);
	if (precision === "day") return true;
	if (precision === "month") return day === 1;
	if (precision === "year") return month === 1 && day === 1;
	return month === 1 && day === 1 && year % 10 === 0;
}
const precision = z.enum(datePrecisions);
const single = z
	.object({
		kind: z.literal("single"),
		start: isoDate,
		precision,
		approximate: z.boolean(),
	})
	.strict()
	.refine((d) => startsPeriod(d.start, d.precision), {
		path: ["start"],
		message: "PERIOD_START",
	});
const range = z
	.object({
		kind: z.literal("range"),
		start: isoDate,
		end: isoDate,
		precision,
		approximate: z.boolean(),
	})
	.strict()
	.refine((d) => startsPeriod(d.start, d.precision), {
		path: ["start"],
		message: "PERIOD_START",
	})
	.refine((d) => startsPeriod(d.end, d.precision), {
		path: ["end"],
		message: "PERIOD_START",
	})
	.refine((d) => d.end >= d.start, { path: ["end"], message: "RANGE_ORDER" });
const unknown = z.object({ kind: z.literal("unknown") }).strict();

export const itemInputSchema = z
	.object({
		title: z.string().trim().min(1).max(200),
		description: z.string().max(20000),
		types: z.array(z.enum(itemTypes)).min(1).max(8).transform(unique),
		date: z.union([unknown, single, range]),
		tags: z
			.array(z.string().trim().min(1).max(50))
			.max(30)
			.transform(unique),
		personIds: z.array(id).max(50).transform(unique),
		placeIds: z.array(id).max(50).transform(unique),
	})
	.strict();
export type ItemInput = z.input<typeof itemInputSchema>;
export type ParsedItem = z.output<typeof itemInputSchema>;
export type DateValue = ParsedItem["date"];

const name = z.string().trim().min(1).max(120);
const otherNames = z.array(name).max(20).transform(unique);
export const personInputSchema = z
	.object({ name, otherNames, familyOnly: z.boolean() })
	.strict();
export type PersonInput = z.input<typeof personInputSchema>;
export const placeInputSchema = z
	.object({
		name,
		otherNames,
		latitude: z.number().min(-90).max(90).nullable(),
		longitude: z.number().min(-180).max(180).nullable(),
	})
	.strict()
	.refine((p) => (p.latitude === null) === (p.longitude === null), {
		path: ["latitude"],
		message: "COORDINATES_PAIR",
	});
export type PlaceInput = z.input<typeof placeInputSchema>;
