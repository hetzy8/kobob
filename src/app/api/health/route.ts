import { emailConfigValidity, serverConfigValidity } from "@/lib/config";
import { failureCodes } from "@/lib/failure-codes";
import { database } from "@/lib/runtime";
export const runtime = "nodejs";
// No HTTP caching: the post-deploy smoke gate (.github/workflows/vercel-deploy.yml)
// relies on `commit` and `deploymentId` describing the live deployment.
export const dynamic = "force-dynamic";
// Set by Vercel; empty locally and in CI. `deploymentId` differs on a
// same-commit redeploy, which is how the gate tells the new build from the old.
const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? "";
const headers = { "Cache-Control": "private, no-store" };
// The endpoint is public and discoverable from this repository. Reusing a
// recent database result per instance keeps anonymous polling from holding
// Neon's free compute awake. A reading is at most 15 s old and the cache is
// per deployment, so it can delay the smoke gate briefly but never mislead it.
const databaseCheckTtlMs = 15_000;
let lastCheck: { ok: boolean; at: number } | undefined;
// Booleans only, never values (hetzy8 standards rule 7). Required settings
// report whether they pass the app's own validation, not mere presence: a
// malformed SITE_ORIGIN or DATABASE_URL fails every protected request exactly
// like an unreachable database, and only this tells the two apart.
// Email validity never affects status: pages and the database work without it.
function configValidity() {
	return {
		...serverConfigValidity(process.env),
		...emailConfigValidity(process.env),
	};
}
async function databaseReady(): Promise<boolean> {
	if (lastCheck && Date.now() - lastCheck.at < databaseCheckTtlMs)
		return lastCheck.ok;
	let ok = false;
	try {
		// Touch the migrated schema, not just the connection: a runtime URL that
		// points at an empty or different database than the one migrations ran
		// against must fail the gate instead of answering `SELECT 1`.
		await database().$queryRaw`SELECT 1 FROM "_prisma_migrations" LIMIT 1`;
		ok = true;
	} catch (error) {
		// Driver and configuration errors can contain hostnames or credentials;
		// the response stays generic. The private runtime log gets identifying
		// codes only (never the message), so a failed gate can be diagnosed:
		// e.g. 42P01 = migrated table missing (wrong database), 28P01 = bad
		// password, ECONNREFUSED/ENOTFOUND = unreachable host.
		console.error("[health] database check failed", failureCodes(error));
		ok = false;
	}
	lastCheck = { ok, at: Date.now() };
	return ok;
}
export async function GET() {
	const ok = await databaseReady();
	return Response.json(
		{
			status: ok ? "ok" : "error",
			commit,
			deploymentId,
			timestamp: new Date().toISOString(),
			config: configValidity(),
		},
		{ status: ok ? 200 : 503, headers },
	);
}
