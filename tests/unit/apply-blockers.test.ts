import { expect, it } from "vitest";
import { applyBlockers } from "../../src/import/apply-catalog";

it("blocks an apply on errors or unreadable files, with counts only", () => {
	expect(applyBlockers({ errors: [], unreadable: [] })).toEqual([]);
	expect(
		applyBlockers({
			errors: [{ kobId: "KOB-000001", code: "INVALID_SIZE" }],
			unreadable: [
				{ kobId: "KOB-000002", code: "DRIVE_READ_FAILED_403" },
				{ kobId: "KOB-000003", code: "DRIVE_READ_FAILED" },
			],
		}),
	).toEqual(["1 planning errors", "2 system-file candidates could not be read from Drive"]);
});
