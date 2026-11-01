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
// Booleans only, never values (hetzy8 standards rule 7), so a vanished
// production key is visible from a plain curl instead of a user-facing error.
// Email is not wired yet (src/lib/runtime.ts), so its keys are informational.
function configPresence() {
	const env = process.env;
	return {
		siteOrigin: Boolean(env.SITE_ORIGIN?.trim()),
		authSecret: (env.AUTH_SECRET?.trim().length ?? 0) >= 32,
		resend: Boolean(env.RESEND_API_KEY?.trim()),
		emailFrom: Boolean(env.EMAIL_FROM?.trim()),
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
			config: configPresence(),
		},
		{ status: ok ? 200 : 503, headers },
	);
}
