import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { isOutsideRepository } from "../../src/import/report-path";

const base = mkdtempSync(join(tmpdir(), "report-path-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

const repo = join(base, "repo");
const elsewhere = join(base, "elsewhere");
mkdirSync(join(repo, "sub"), { recursive: true });
mkdirSync(elsewhere);
symlinkSync(join(repo, "sub"), join(elsewhere, "link"));

it("accepts a report in a directory outside the repository", () => {
	expect(isOutsideRepository(join(elsewhere, "report.json"), repo)).toBe(true);
});

it("refuses a report in or under the repository", () => {
	expect(isOutsideRepository(join(repo, "report.json"), repo)).toBe(false);
	expect(isOutsideRepository(join(repo, "sub", "report.json"), repo)).toBe(false);
});

it("refuses a report reached through a symlinked parent that lands inside the repository", () => {
	expect(isOutsideRepository(join(elsewhere, "link", "report.json"), repo)).toBe(false);
});

it("refuses a differently-cased path to the repository on a case-insensitive volume", () => {
	const swapped = join(base, "REPO");
	let insensitive = false;
	try {
		insensitive = realpathSync.native(swapped) === realpathSync.native(repo);
	} catch {
		insensitive = false;
	}
	if (!insensitive) return;
	expect(isOutsideRepository(join(swapped, "report.json"), repo)).toBe(false);
});

it("throws when the parent directory is missing", () => {
	expect(() => isOutsideRepository(join(base, "missing", "report.json"), repo)).toThrow();
});

it("treats a dot-prefixed name inside the repository as inside", () => {
	mkdirSync(join(repo, "..sub"));
	expect(isOutsideRepository(join(repo, "..review.json"), repo)).toBe(false);
	expect(isOutsideRepository(join(repo, "..sub", "report.json"), repo)).toBe(false);
});
