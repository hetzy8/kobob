import expected from "../fixtures/he-interface.json" with { type: "json" };
import { test, expect, type Page } from "@playwright/test";
import { createDatabase } from "../../src/lib/database";
import { createAuthSystem } from "../../src/lib/auth-system";
import { readServerConfig, requireTestDatabaseUrl } from "../../src/lib/config";
const db = createDatabase(requireTestDatabaseUrl(process.env));
const config = readServerConfig({
	SITE_ORIGIN: `http://127.0.0.1:${process.env.KOBOB_TEST_PORT || "3100"}`,
	DATABASE_URL: requireTestDatabaseUrl(process.env),
	AUTH_SECRET: "synthetic-browser-secret-more-than-32-characters",
});
test.beforeEach(async () => {
	await db.verification.deleteMany();
	await db.rateLimit.deleteMany();
	await db.user.deleteMany();
});
test.afterAll(async () => {
	await db.verification.deleteMany();
	await db.rateLimit.deleteMany();
	await db.user.deleteMany();
	await db.$disconnect();
});
async function emailLink(role: "admin" | "member" = "member") {
	await db.user.create({ data: { email: "browser@example.test", role } });
	let link = "";
	const auth = createAuthSystem({
		db,
		config,
		sendLink: async (message) => {
			link = message.url;
		},
	});
	await auth.handle(
		new Request(`${config.origin}/api/access/request`, {
			method: "POST",
			headers: { origin: config.origin, "content-type": "application/json" },
			body: JSON.stringify({ email: "browser@example.test" }),
		}),
	);
	return link;
}
async function confirmSignIn(page: Page) {
	const confirmation = page.waitForResponse(
		(response) => new URL(response.url()).pathname === "/api/access/confirm",
	);
	await page.getByRole("button", { name: expected.confirm }).click();
	const response = await confirmation;
	expect(response.status()).toBe(303);
	expect(response.headers().location).toBe(`${config.origin}/family`);
	// Follow the complete asynchronous fetch + navigation. A cold development
	// route on a small CI runner can compile beyond the 5-second assertion limit.
	await page.waitForURL(/\/family$/);
}
test("public foundation has Hebrew RTL root, relative navigation and no private family content", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page.locator("body")).not.toContainText("גרסת פיתוח");
	await expect(page.locator("html")).toHaveAttribute("lang", "he");
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	await expect(page.getByRole("navigation")).toBeVisible();
	await page
		.getByRole("link", { name: expected.search, exact: true })
		.first()
		.click();
	await expect(page).toHaveURL(/\/search$/);
	await expect(
		page.getByRole("heading", { name: expected.search, exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: expected.archive, exact: true }),
	).toHaveCount(0);
	await expect(page.getByText("browser@example.test")).toHaveCount(0);
	await page.setViewportSize({ width: 375, height: 812 });
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
});
test("requires explicit confirmation, removes the token from the address bar, then enforces revocation", async ({
	page,
}) => {
	await page.goto(await emailLink());
	await expect(
		page.getByRole("button", { name: expected.confirm }),
	).toBeVisible();
	expect(new URL(page.url()).hash).toBe("");
	expect(await db.session.count()).toBe(0);
	await confirmSignIn(page);
	await expect(
		page.getByRole("heading", { name: expected.family }),
	).toBeVisible();
	expect(await db.session.count()).toBe(1);
	await db.user.updateMany({
		data: { status: "revoked", accessVersion: { increment: 1 } },
	});
	await page.reload();
	await expect(page).toHaveURL(/\/sign-in$/);
	await expect(
		page.getByRole("heading", { name: expected.family }),
	).toHaveCount(0);
});
test("locks private UI when logout fails without claiming server revocation, then retries", async ({
	page,
}) => {
	await page.goto(await emailLink());
	await confirmSignIn(page);
	await page.route("**/api/access/sign-out", (route) => route.abort());
	await page
		.getByRole("button", { name: expected.signOut, exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: expected.retrySignOut }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: expected.family }),
	).toHaveCount(0);
	expect(await db.session.count()).toBe(1);
	await page.goto("/");
	await page.goto("/family");
	await expect(
		page.getByRole("button", { name: expected.retrySignOut }),
	).toBeVisible();
	await page.reload();
	await expect(
		page.getByRole("heading", { name: expected.family }),
	).toHaveCount(0);
	await page.unroute("**/api/access/sign-out");
	await page.getByRole("button", { name: expected.retrySignOut }).click();
	await expect(page).toHaveURL(`${config.origin}/`);
	expect(await db.session.count()).toBe(0);
});
test("shows an honest expired-link state and blocks raw auth endpoints", async ({
	page,
	request,
}) => {
	await page.goto("/verify?error=invalid");
	await expect(
		page.getByRole("link", { name: expected.requestAnother }),
	).toBeVisible();
	expect(
		(
			await request.get("/api/auth/magic-link/verify?token=synthetic-invalid")
		).status(),
	).toBe(404);
});

test("keeps sign-in disabled until client handlers are ready", async ({
	page,
}) => {
	let release: (() => void) | undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const pending: Promise<void>[] = [];
	const pattern = "**/_next/static/**/*.js";
	await page.route(pattern, (route) => {
		const task = gate.then(() => route.continue());
		pending.push(task);
		return task;
	});
	try {
		await page.goto("/sign-in", { waitUntil: "commit" });
		await expect(
			page.getByRole("button", { name: expected.requestLink }),
		).toBeDisabled();
	} finally {
		release?.();
		await Promise.all(pending);
		await page.unroute(pattern);
	}
	await expect(
		page.getByRole("button", { name: expected.requestLink }),
	).toBeEnabled();
});

test("shows Hebrew interface copy, the visitor tabs and a plain sign-in label", async ({
	page,
}) => {
	for (const [path, heading] of [
		["/", expected.home],
		["/about", expected.about],
		["/search", expected.search],
		["/sign-in", expected.signIn],
		["/verify", expected.confirm],
		["/missing-page", expected.notFound],
	]) {
		await page.goto(path);
		await expect(
			page.getByRole("heading", { name: heading, exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("navigation", { name: expected.navigation }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: expected.signIn, exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("navigation", { name: expected.navigation })
				.getByRole("link", { name: expected.search, exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: expected.archive, exact: true }),
		).toHaveCount(0);
		// biome-ignore lint/performance/useDomNodeTextContent: assert visible interface text, excluding script payloads.
		expect(await page.locator("body").innerText()).not.toMatch(/[A-Za-z]/);
		await expect(page.locator('[lang="en"]')).toHaveCount(0);
		expect(await page.title()).toBe(expected.title);
	}
});

test("reads a fresh verification fragment in the same document", async ({
	page,
}) => {
	const link = await emailLink();
	await page.goto("/verify#token=synthetic-invalid");
	await page.getByRole("button", { name: expected.confirm }).click();
	// A completed invalid confirmation proves client handlers are attached and
	// also verifies that the next fragment clears the previous error.
	await expect(page.locator("main").getByRole("alert")).toHaveText(
		expected.invalid,
	);
	await page.evaluate((url) => {
		window.location.href = url;
	}, link);
	await expect(
		page.getByRole("button", { name: expected.confirm }),
	).toBeVisible();
	expect(new URL(page.url()).hash).toBe("");
	await confirmSignIn(page);
});

test("administrator adds, changes, revokes and restores membership", async ({
	page,
}) => {
	await page.goto(await emailLink("admin"));
	await confirmSignIn(page);
	await page.goto("/admin/members");
	const add = page.locator("form").filter({
		has: page.getByRole("button", { name: "הוספת גישה", exact: true }),
	});
	await add.getByRole("textbox").fill("new@example.test");
	await add.getByRole("button").click();
	let row = page.locator("section").filter({
		has: page.getByRole("heading", { name: "new@example.test", exact: true }),
	});
	await expect(row).toBeVisible();
	await row.getByRole("textbox").fill("changed@example.test");
	await row.getByRole("button", { name: "עדכון כתובת דוא״ל" }).click();
	row = page.locator("section").filter({
		has: page.getByRole("heading", {
			name: "changed@example.test",
			exact: true,
		}),
	});
	await expect(row).toBeVisible();
	await row.getByRole("button", { name: "ביטול גישה", exact: true }).click();
	await expect(row.getByRole("button", { name: "חידוש גישה" })).toBeVisible();
	await row.getByRole("button", { name: "חידוש גישה" }).click();
	await expect(
		row.getByRole("button", { name: "ביטול גישה", exact: true }),
	).toBeVisible();
});
test("anonymous and ordinary family users cannot view membership", async ({
	page,
}) => {
	await page.goto("/admin/members");
	await expect(page).toHaveURL(/\/sign-in$/);
	await page.goto(await emailLink());
	await confirmSignIn(page);
	await page.goto("/admin/members");
	await expect(page).toHaveURL(/\/sign-in$/);
	await expect(page.getByText("browser@example.test")).toHaveCount(0);
});

test("an open admin form cannot mutate membership after role removal", async ({
	page,
}) => {
	await page.goto(await emailLink("admin"));
	await confirmSignIn(page);
	await page.goto("/admin/members");
	const form = page
		.locator("form")
		.filter({
			has: page.getByRole("button", { name: "הוספת גישה", exact: true }),
		});
	await form.getByRole("textbox").fill("denied@example.test");
	await db.user.updateMany({ data: { role: "member" } });
	await form.getByRole("button").click();
	await expect(form.getByRole("status")).not.toBeEmpty();
	await expect(form.getByRole("textbox")).toHaveValue("denied@example.test");
	expect(await db.user.count({ where: { email: "denied@example.test" } })).toBe(
		0,
	);
});

test("the media route gives visitors the same 404 for any id", async ({ request }) => {
	const response = await request.get("/api/media/missing-id");
	expect(response.status()).toBe(404);
	expect(response.headers()["cache-control"]).toContain("no-store");
});
