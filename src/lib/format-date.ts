import type { DateValue } from "../services/item-input";
import { copy } from "../locales/he";

type Precision = "day" | "month" | "year" | "decade";

// Numeric day.month.year avoids inventing Hebrew month names in copy.
function part(value: string, precision: Precision) {
	const [year, month, day] = value.split("-").map(Number);
	if (precision === "day") return `${day}.${month}.${year}`;
	if (precision === "month") return `${month}.${year}`;
	if (precision === "year") return `${year}`;
	return `${copy.items.decadePrefix}${year}`;
}

export function formatDate(date: DateValue): string {
	if (date.kind === "unknown") return copy.items.unknownDate;
	const text =
		date.kind === "single"
			? part(date.start, date.precision)
			: `${part(date.start, date.precision)}–${part(date.end, date.precision)}`;
	return date.approximate ? `${copy.items.approximatePrefix} ${text}` : text;
}
