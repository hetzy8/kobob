import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../../src/lib/database";
import { readServerConfig, requireTestDatabaseUrl } from "../../src/lib/config";
import { createAuthSystem } from "../../src/lib/auth-system";

const db = createDatabase(requireTestDatabaseUrl(process.env));
const config = readServerConfig({
	SITE_ORIGIN: "http://localhost:3000",
	DATABASE_URL: requireTestDatabaseUrl(process.env),
	AUTH_SECRET: "synthetic-integration-secret-over-32-characters",
});
let deliveries: { email: string; url: string }[] = [];
let deliveryFails = false;
let reportedFailures = 0;
const system = () =>
	createAuthSystem({
		db,
		config,
		sendLink: async (message) => {
			if (deliveryFails) throw new Error("synthetic delivery failure");
			deliveries.push(message);
		},
		onDeliveryError: () => {
			reportedFailures++;
		},
	});
function post(
	path: string,
	body: Record<string, string>,
	cookie?: string,
	origin = config.origin,
) {
	return new Request(config.origin + path, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			origin,
			...(cookie ? { cookie } : {}),
		},
		body: JSON.stringify(body),
	});
}
async function invite(role: "admin" | "member" = "member") {
	return db.user.create({ data: { email: "family@example.test", role } });
}
async function issue(auth = system()) {
	await auth.handle(
		post("/api/access/request", { email: "family@example.test" }),
	);
	const delivered = deliveries.at(-1);
	if (!delivered) throw new Error("No synthetic delivery captured");
	const url = new URL(delivered.url);
	const token = new URLSearchParams(url.hash.slice(1)).get("token");
	if (!token) throw new Error("No credential in synthetic delivery");
	return { auth, token };
}
function cookies(response: Response) {
	return response.headers
		.getSetCookie()
		.map((value) => value.split(";")[0])
		.join("; ");
}
async function login(role: "admin" | "member" = "member") {
	const user = await invite(role);
	const { auth, token } = await issue();
	const response = await auth.handle(post("/api/access/confirm", { token }));
	return {
		auth,
		user,
		response,
		headers: new Headers({ cookie: cookies(response) }),
	};
}
beforeEach(async () => {
	await db.verification.deleteMany();
	await db.rateLimit.deleteMany();
	await db.user.deleteMany();
	deliveries = [];
	deliveryFails = false;
	reportedFailures = 0;
});
afterAll(async () => {
	await db.verification.deleteMany();
	await db.rateLimit.deleteMany();
	await db.user.deleteMany();
	await db.$disconnect();
});

describe("invitation-only email access", () => {
	it("returns the same generic response for invited and unknown emails without signing up strangers", async () => {
		const auth = system();
		const unknown = await auth.handle(
			post("/api/access/request", { email: "stranger@example.test" }),
		);
		await invite();
		const invited = await auth.handle(
			post("/api/access/request", { email: " FAMILY@example.test " }),
		);
		expect(unknown.status).toBe(200);
		expect(invited.status).toBe(200);
		expect(await unknown.text()).toBe(await invited.text());
		expect(deliveries).toHaveLength(1);
		expect(deliveries[0].email).toBe("family@example.test");
		expect(await db.user.count()).toBe(1);
		expect(await db.session.count()).toBe(0);
	});
	it("stores only a hashed credential and opening its link does not consume it", async () => {
		await invite();
		const { auth, token } = await issue();
		expect(deliveries[0].url.startsWith(`${config.origin}/verify#`)).toBe(true);
		const row = await db.verification.findFirstOrThrow();
		expect(JSON.stringify(row)).not.toContain(token);
		const before = await auth.handle(new Request(deliveries[0].url));
		expect(before.headers.get("set-cookie")).toBeNull();
		expect(await db.verification.count()).toBe(1);
		expect(await db.session.count()).toBe(0);
		const confirmed = await auth.handle(post("/api/access/confirm", { token }));
		expect(confirmed.status).toBe(303);
		expect(confirmed.headers.get("location")).toBe(`${config.origin}/family`);
		expect(await db.user.findFirstOrThrow()).toMatchObject({
			emailVerified: true,
		});
		expect(await db.session.count()).toBe(1);
		expect(confirmed.headers.get("set-cookie")).toContain("HttpOnly");
		expect(confirmed.headers.get("set-cookie")).toContain("SameSite=Lax");
		expect(confirmed.headers.get("cache-control")).toBe("private, no-store");
	});
	it("consumes a credential only once under concurrent confirmation", async () => {
		await invite();
		const { token } = await issue();
		const responses = await Promise.all(
			[system(), system()].map((auth) =>
				auth.handle(post("/api/access/confirm", { token })),
			),
		);
		expect(
			responses.filter(
				(response) =>
					response.headers.get("location") === `${config.origin}/family`,
			),
		).toHaveLength(1);
		expect(await db.session.count()).toBe(1);
		const replay = await system().handle(
			post("/api/access/confirm", { token }),
		);
		expect(replay.headers.get("location")).not.toBe(`${config.origin}/family`);
		expect(await db.session.count()).toBe(1);
	});
	it("expires credentials after fifteen minutes", async () => {
		await invite();
		const { auth, token } = await issue();
		const row = await db.verification.findFirstOrThrow();
		expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(
			899000,
		);
		expect(
			row.expiresAt.getTime() - row.createdAt.getTime(),
		).toBeLessThanOrEqual(900000);
		await db.verification.updateMany({
			data: { expiresAt: new Date(Date.now() - 1) },
		});
		await auth.handle(post("/api/access/confirm", { token }));
		expect(await db.session.count()).toBe(0);
	});
	it.each(["revoked", "version-change"])(
		"invalidates a pending credential after %s",
		async (change) => {
			const member = await invite();
			const { auth, token } = await issue();
			await db.user.update({
				where: { id: member.id },
				data:
					change === "revoked"
						? { status: "revoked" }
						: { accessVersion: { increment: 1 } },
			});
			await auth.handle(post("/api/access/confirm", { token }));
			expect(await db.session.count()).toBe(0);
		},
	);
	it("does not revive an old credential after revocation and re-invitation", async () => {
		const user = await invite();
		const { auth, token } = await issue();
		await db.user.update({
			where: { id: user.id },
			data: { status: "revoked", accessVersion: { increment: 1 } },
		});
		await db.user.update({
			where: { id: user.id },
			data: { status: "active", accessVersion: { increment: 1 } },
		});
		await auth.handle(post("/api/access/confirm", { token }));
		expect(await db.session.count()).toBe(0);
	});
	it("reports delivery failure without a session, leaked membership or usable pending credentials", async () => {
		await invite();
		deliveryFails = true;
		const result = await system().handle(
			post("/api/access/request", { email: "family@example.test" }),
		);
		expect(result.status).toBe(200);
		expect(await result.text()).not.toContain("family");
		expect(reportedFailures).toBe(1);
		expect(await db.session.count()).toBe(0);
		expect(await db.verification.count()).toBe(0);
	});
	it("enforces per-address issuance limits across independent instances", async () => {
		await invite();
		for (let n = 0; n < 5; n++)
			await system().handle(
				post("/api/access/request", { email: "family@example.test" }),
			);
		expect(deliveries).toHaveLength(3);
	});
	it("atomically enforces issuance limits under concurrent requests", async () => {
		await invite();
		await Promise.all(
			Array.from({ length: 10 }, () =>
				system().handle(
					post("/api/access/request", { email: "family@example.test" }),
				),
			),
		);
		expect(deliveries).toHaveLength(3);
	});
	it("enforces a shared client issuance limit across different addresses", async () => {
		await db.user.createMany({
			data: Array.from({ length: 22 }, (_, n) => ({
				email: `family${n}@example.test`,
			})),
		});
		for (let n = 0; n < 22; n++)
			await system().handle(
				post("/api/access/request", { email: `family${n}@example.test` }),
			);
		expect(deliveries).toHaveLength(20);
	});
	it("bounds throttle storage when a blocked client rotates unknown email addresses", async () => {
		for (let n = 0; n < 60; n++)
			await system().handle(
				post("/api/access/request", { email: `unknown${n}@example.test` }),
			);
		expect(await db.rateLimit.count()).toBeLessThanOrEqual(22);
	});
	it("cleans old issuance buckets when the next bucket starts", async () => {
		await db.rateLimit.create({
			data: {
				key: "stale-fixture",
				count: 1,
				lastRequest: BigInt(Date.now() - 2 * 86400000),
			},
		});
		await system().handle(
			post("/api/access/request", { email: "unknown@example.test" }),
		);
		expect(
			await db.rateLimit.findUnique({ where: { key: "stale-fixture" } }),
		).toBeNull();
	});
	it("rejects cross-origin confirmation and never trusts client redirect targets", async () => {
		await invite();
		const { auth, token } = await issue();
		expect(
			(
				await auth.handle(
					post(
						"/api/access/confirm",
						{ token },
						undefined,
						"https://evil.example",
					),
				)
			).status,
		).toBe(403);
		expect(await db.session.count()).toBe(0);
		const response = await auth.handle(
			post("/api/access/confirm", {
				token,
				callbackURL: "https://evil.example",
			}),
		);
		expect(response.headers.get("location")).not.toContain("evil.example");
	});
	it.each([
		"/api/auth/magic-link/verify?token=x",
		"/api/auth/sign-up/email",
		"/api/auth/update-user",
		"/api/auth/change-email",
		"/api/access/magic-link/verify?token=x",
	])("does not expose raw library endpoint %s", async (path) => {
		const response = await system().handle(new Request(config.origin + path));
		expect(response.status).toBe(404);
		expect(await db.user.count()).toBe(0);
	});
});

describe("fresh access checks", () => {
	it("requires verification and active membership, and denies members admin privileges", async () => {
		const { auth, user, headers } = await login();
		expect(await auth.requireMember(headers)).toMatchObject({
			id: user.id,
			role: "member",
			accessVersion: 1,
		});
		await expect(auth.requireAdmin(headers)).rejects.toThrow("FORBIDDEN");
		await db.user.update({
			where: { id: user.id },
			data: { emailVerified: false },
		});
		await expect(auth.requireMember(headers)).rejects.toThrow("UNAUTHORIZED");
	});
	it("uses the current role rather than stale cookie data", async () => {
		const { auth, user, headers } = await login("admin");
		expect((await auth.requireAdmin(headers)).role).toBe("admin");
		await db.user.update({ where: { id: user.id }, data: { role: "member" } });
		await expect(auth.requireAdmin(headers)).rejects.toThrow("FORBIDDEN");
	});
	it.each(["revoked", "version-change", "expired", "absolute-expiry"])(
		"denies the next protected read after %s",
		async (change) => {
			const { auth, user, headers } = await login();
			if (change === "revoked")
				await db.user.update({
					where: { id: user.id },
					data: { status: "revoked" },
				});
			if (change === "version-change")
				await db.user.update({
					where: { id: user.id },
					data: { accessVersion: { increment: 1 } },
				});
			if (change === "expired")
				await db.session.updateMany({
					data: { expiresAt: new Date(Date.now() - 1) },
				});
			if (change === "absolute-expiry")
				await db.session.updateMany({
					data: { createdAt: new Date(Date.now() - 7 * 86400000 - 1) },
				});
			await expect(auth.requireMember(headers)).rejects.toThrow("UNAUTHORIZED");
		},
	);
	it("revokes logout sessions and clears the browser cookie", async () => {
		const { auth, headers } = await login();
		const response = await auth.handle(
			post("/api/access/sign-out", {}, headers.get("cookie") ?? undefined),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
		expect(await db.session.count()).toBe(0);
		await expect(auth.requireMember(headers)).rejects.toThrow("UNAUTHORIZED");
	});
	it("does not claim logout success or clear the retry cookie when database deletion fails", async () => {
		const { auth, headers } = await login();
		await db.$executeRawUnsafe(
			`CREATE FUNCTION reject_test_logout() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'synthetic-private-db-marker'; END; $$ LANGUAGE plpgsql`,
		);
		await db.$executeRawUnsafe(
			`CREATE TRIGGER reject_test_logout BEFORE DELETE ON "Session" FOR EACH ROW EXECUTE FUNCTION reject_test_logout()`,
		);
		const logs = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const failed = await auth.handle(
				post("/api/access/sign-out", {}, headers.get("cookie") ?? undefined),
			);
			expect(failed.status).toBe(503);
			expect(failed.headers.get("set-cookie")).toBeNull();
			expect(await db.session.count()).toBe(1);
			expect((await auth.requireMember(headers)).role).toBe("member");
			expect(logs.mock.calls.flat().map(String).join(" ")).not.toContain(
				"synthetic-private-db-marker",
			);
		} finally {
			logs.mockRestore();
			await db.$executeRawUnsafe(
				`DROP TRIGGER reject_test_logout ON "Session"`,
			);
			await db.$executeRawUnsafe(`DROP FUNCTION reject_test_logout()`);
		}
		const retried = await auth.handle(
			post("/api/access/sign-out", {}, headers.get("cookie") ?? undefined),
		);
		expect(retried.status).toBe(200);
		expect(retried.headers.get("set-cookie")).toContain("Max-Age=0");
		expect(await db.session.count()).toBe(0);
		await expect(auth.requireMember(headers)).rejects.toThrow("UNAUTHORIZED");
	});
	it("rejects anonymous requests without exposing members", async () => {
		await expect(system().requireMember(new Headers())).rejects.toThrow(
			"UNAUTHORIZED",
		);
	});
});
