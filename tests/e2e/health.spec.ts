import { test, expect } from "@playwright/test";
// The post-deploy smoke gate reads this endpoint; its shape is a contract.
test("health reports a reachable database without caching or leaking detail", {
	tag: "@sanity",
}, async ({ request }) => {
	const response = await request.get("/api/health");
	expect(response.status()).toBe(200);
	expect(response.headers()["cache-control"]).toContain("no-store");
	const body = await response.json();
	expect(Object.keys(body).sort()).toEqual([
		"commit",
		"config",
		"deploymentId",
		"status",
		"timestamp",
	]);
	expect(body.status).toBe("ok");
	// Validity booleans only; a value here would leak configuration.
	for (const value of Object.values(body.config))
		expect(typeof value).toBe("boolean");
	expect(body.config.siteOrigin).toBe(true);
	expect(body.config.authSecret).toBe(true);
	expect(body.config.databaseUrl).toBe(true);
	// CI has no provider credentials: live email must be off there.
	expect(body.config.resend).toBe(false);
	expect(body.config.emailFrom).toBe(false);
	expect(body.config.storage).toBe(false);
});
