// Applies Prisma migrations during the Vercel production build only.
//
// Why here: Vercel Git deploys are disabled and production is built from the
// deploy hook, so the build is the one place that runs once per release with
// production credentials. Locally and in CI this exits 0 without touching any
// database, so `npm run build` never migrates by accident.
//
// Why DIRECT_URL: Neon's pooled endpoint (DATABASE_URL, used at runtime) does
// not support the session features `migrate deploy` needs. The direct URL is
// passed to the child only, so prisma.config.ts keeps a single DATABASE_URL
// and the test-database script cannot pick up a production value.
//
// Why retries: Neon's free compute autosuspends; the first connection after a
// suspension can lose the race against the cold start (sana's P1001 builds).
// Fail closed: on production a missing DIRECT_URL fails the build.
import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
	console.log("[migrate-production] not a Vercel production build; skipping.");
	process.exit(0);
}
const directUrl = process.env.DIRECT_URL?.trim();
if (!directUrl) {
	console.error("[migrate-production] DIRECT_URL is not set; refusing to build.");
	process.exit(1);
}
const backoffMs = [3000, 6000, 10000, 15000];
for (let attempt = 1; attempt <= backoffMs.length + 1; attempt++) {
	const result = spawnSync("prisma", ["migrate", "deploy"], {
		stdio: "inherit",
		env: { ...process.env, DATABASE_URL: directUrl },
		shell: false,
	});
	if (result.status === 0) process.exit(0);
	const wait = backoffMs[attempt - 1];
	if (wait === undefined) {
		console.error(`[migrate-production] attempt ${attempt} failed; giving up.`);
		process.exit(result.status ?? 1);
	}
	console.error(
		`[migrate-production] attempt ${attempt} failed; retrying in ${wait}ms (likely Neon cold start).`,
	);
	await new Promise((resolve) => setTimeout(resolve, wait));
}
