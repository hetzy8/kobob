import { test, expect, type Page } from "@playwright/test";
import { createDatabase } from "../../src/lib/database";
import { createAuthSystem } from "../../src/lib/auth-system";
import { readServerConfig, requireTestDatabaseUrl } from "../../src/lib/config";
const db = createDatabase(requireTestDatabaseUrl(process.env));
const config = readServerConfig({
	SITE_ORIGIN: "http://127.0.0.1:3100",
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
async function emailLink() {
	await db.user.create({ data: { email: "browser@example.test" } });
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
	await page.getByRole("button", { name: "Confirm sign-in" }).click();
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
	await expect(page.locator("html")).toHaveAttribute("lang", "he");
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	await expect(page.getByRole("navigation")).toBeVisible();
	await page
		.getByRole("link", { name: "Archive", exact: true })
		.first()
		.click();
	await expect(page).toHaveURL(/\/archive$/);
	await expect(
		page.getByRole("heading", { name: "Archive", exact: true }),
	).toBeVisible();
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
		page.getByRole("button", { name: "Confirm sign-in" }),
	).toBeVisible();
	expect(new URL(page.url()).hash).toBe("");
	expect(await db.session.count()).toBe(0);
	await confirmSignIn(page);
	await expect(
		page.getByRole("heading", { name: "Family workspace" }),
	).toBeVisible();
	expect(await db.session.count()).toBe(1);
	await db.user.updateMany({
		data: { status: "revoked", accessVersion: { increment: 1 } },
	});
	await page.reload();
	await expect(page).toHaveURL(/\/sign-in$/);
	await expect(
		page.getByRole("heading", { name: "Family workspace" }),
	).toHaveCount(0);
});
test("locks private UI when logout fails without claiming server revocation, then retries", async ({
	page,
}) => {
	await page.goto(await emailLink());
	await confirmSignIn(page);
	await page.route("**/api/access/sign-out", (route) => route.abort());
	await page.getByRole("button", { name: "Sign out", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Retry sign-out" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Family workspace" }),
	).toHaveCount(0);
	expect(await db.session.count()).toBe(1);
	await page.unroute("**/api/access/sign-out");
	await page.getByRole("button", { name: "Retry sign-out" }).click();
	await expect(page).toHaveURL(`${config.origin}/`);
	expect(await db.session.count()).toBe(0);
});
test("shows an honest expired-link state and blocks raw auth endpoints", async ({
	page,
	request,
}) => {
	await page.goto("/verify?error=invalid");
	await expect(
		page.getByRole("link", { name: "Request another link" }),
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
			page.getByRole("button", { name: "Request sign-in link" }),
		).toBeDisabled();
	} finally {
		release?.();
		await Promise.all(pending);
		await page.unroute(pattern);
	}
	await expect(
		page.getByRole("button", { name: "Request sign-in link" }),
	).toBeEnabled();
});
