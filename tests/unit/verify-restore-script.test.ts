import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

const PASSWORD = "synthetic-password-xyz";
const ROLE = "synthetic_role_xyz";

function run(databaseUrl: string) {
	const env: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		HOME: process.env.HOME ?? "",
		DATABASE_URL: databaseUrl,
	};
	const result = spawnSync(
		"node",
		[
			"--conditions=react-server",
			"--import",
			"tsx",
			"scripts/verify-restore.ts",
		],
		{ encoding: "utf8", env: env as NodeJS.ProcessEnv, timeout: 60_000 },
	);
	return {
		status: result.status,
		output: `${result.stdout}${result.stderr}`,
	};
}

it("rejects an invalid URL without printing any part of it", () => {
	const { status, output } = run(`not a url ${ROLE}:${PASSWORD}@`);
	expect(status).toBe(2);
	expect(output).toContain("DATABASE_URL is not a valid URL");
	expect(output).not.toContain(PASSWORD);
	expect(output).not.toContain(ROLE);
}, 70_000);

it("prints a fixed line, not the error, when the database is unreachable", () => {
	const { status, output } = run(
		`postgresql://${ROLE}:${PASSWORD}@127.0.0.1:1/restore`,
	);
	expect(status).toBe(2);
	expect(output).toContain("Verification could not run");
	expect(output).not.toContain(PASSWORD);
	expect(output).not.toContain(ROLE);
	expect(output).not.toContain("at ");
}, 70_000);
