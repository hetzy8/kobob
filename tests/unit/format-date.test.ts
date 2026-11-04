import { expect, it } from "vitest";
import { formatDate } from "../../src/lib/format-date";
import { copy } from "../../src/locales/he";

it("formats each precision, approximation and ranges", () => {
	expect(formatDate({ kind: "unknown" })).toBe(copy.items.unknownDate);
	expect(
		formatDate({ kind: "single", start: "1975-03-12", precision: "day", approximate: false }),
	).toBe("12.3.1975");
	expect(
		formatDate({ kind: "single", start: "1975-03-01", precision: "month", approximate: false }),
	).toBe("3.1975");
	expect(
		formatDate({ kind: "single", start: "1975-01-01", precision: "year", approximate: true }),
	).toBe(`${copy.items.approximatePrefix} 1975`);
	expect(
		formatDate({ kind: "single", start: "1970-01-01", precision: "decade", approximate: false }),
	).toBe(`${copy.items.decadePrefix}1970`);
	expect(
		formatDate({
			kind: "range",
			start: "1970-01-01",
			end: "1979-01-01",
			precision: "year",
			approximate: false,
		}),
	).toBe("1970–1979");
});
