import { test, expect } from "@playwright/test";
// The post-deploy smoke gate reads this endpoint; its shape is a contract.
test("health reports a reachable database without caching or leaking detail", async ({
	request,
}) => {
	const response = await request.get("/api/health");
	expect(response.status()).toBe(200);
	expect(response.headers()["cache-control"]).toContain("no-store");
	const body = await response.json();
	expect(Object.keys(body).sort()).toEqual([
		"commit",
		"deploymentId",
		"status",
		"timestamp",
	]);
	expect(body.status).toBe("ok");
});
