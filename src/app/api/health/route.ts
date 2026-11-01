import { database } from "@/lib/runtime";
export const runtime = "nodejs";
// Never cache: the post-deploy smoke gate (.github/workflows/vercel-deploy.yml)
// relies on `commit` and `deploymentId` describing the live deployment and on
// the database ping hitting the real connection.
export const dynamic = "force-dynamic";
// Set by Vercel; empty locally and in CI. `deploymentId` differs on a
// same-commit redeploy, which is how the gate tells the new build from the old.
const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? "";
const headers = { "Cache-Control": "private, no-store" };
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
export async function GET() {
	const timestamp = new Date().toISOString();
	try {
		await database().$queryRaw`SELECT 1`;
		return Response.json(
			{
				status: "ok",
				commit,
				deploymentId,
				timestamp,
				config: configPresence(),
			},
			{ headers },
		);
	} catch {
		// This endpoint is public. Driver and configuration errors can contain
		// hostnames or credentials, so report only a generic failure.
		return Response.json(
			{
				status: "error",
				commit,
				deploymentId,
				timestamp,
				config: configPresence(),
			},
			{ status: 503, headers },
		);
	}
}
