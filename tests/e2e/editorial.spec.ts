import { type Browser, expect, type Page, test } from "@playwright/test";
import { createAuthSystem } from "../../src/lib/auth-system";
import { readServerConfig, requireTestDatabaseUrl } from "../../src/lib/config";
import { createDatabase } from "../../src/lib/database";
import { copy } from "../../src/locales/he";

const db = createDatabase(requireTestDatabaseUrl(process.env));
const config = readServerConfig({
	SITE_ORIGIN: `http://127.0.0.1:${process.env.KOBOB_TEST_PORT || "3100"}`,
	DATABASE_URL: requireTestDatabaseUrl(process.env),
	AUTH_SECRET: "synthetic-browser-secret-more-than-32-characters",
});
async function clean() {
	await db.editorialAudit.deleteMany();
	await db.item.deleteMany();
	await db.person.deleteMany();
	await db.place.deleteMany();
	await db.verification.deleteMany();
	await db.rateLimit.deleteMany();
	await db.user.deleteMany();
}
test.beforeEach(clean);
test.afterAll(async () => {
	await clean();
	await db.$disconnect();
});

// Same flow as sign-in.spec.ts: issue a link through the auth system with a
// capturing sender, open it, confirm.
async function signIn(page: Page, email: string) {
	await db.user.create({ data: { email } });
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
			body: JSON.stringify({ email }),
		}),
	);
	await page.goto(link);
	await page.getByRole("button", { name: copy.confirm }).click();
	await page.waitForURL(/\/family$/);
}
async function newMemberPage(browser: Browser, email: string) {
	const context = await browser.newContext();
	const page = await context.newPage();
	await signIn(page, email);
	return page;
}
async function createItem(page: Page, title: string) {
	await page.goto("/family/items/new", { waitUntil: "networkidle" });
	await page.getByLabel(copy.items.title).fill(title);
	await page.getByLabel(copy.items.typeNames.picture).check();
	await page.getByRole("button", { name: copy.items.save }).click();
	await page.waitForURL(/\/family\/items\/[^/]+\/edit$/);
	return page.url().split("/").at(-2) as string;
}

test("publishing shows the published version until the next publish", async ({
	page,
}) => {
	await signIn(page, "editor@example.test");
	const id = await createItem(page, "Synthetic first");
	await page.goto(`/archive/${id}`);
	await expect(
		page.getByRole("heading", { name: copy.notFound }),
	).toBeVisible();
	await page.goto(`/family/items/${id}/edit`, { waitUntil: "networkidle" });
	await page.getByRole("button", { name: copy.items.publish }).click();
	await expect(page.getByText(copy.items.public).first()).toBeVisible();
	await page.goto(`/archive/${id}`);
	await expect(
		page.getByRole("heading", { name: "Synthetic first" }),
	).toBeVisible();
	await page.goto(`/family/items/${id}/edit`, { waitUntil: "networkidle" });
	await page.getByLabel(copy.items.title).fill("Synthetic second");
	await page.getByRole("button", { name: copy.items.save }).click();
	await expect(page.locator("form").getByRole("status").last()).toHaveText(
		copy.items.saved,
	);
	await page.goto(`/archive/${id}`);
	await expect(
		page.getByRole("heading", { name: "Synthetic first" }),
	).toBeVisible();
	await page.goto(`/family/items/${id}/edit`, { waitUntil: "networkidle" });
	await page.getByRole("button", { name: copy.items.republish }).click();
	// Wait for the action to finish before navigating away.
	await expect(
		page.getByRole("button", { name: copy.items.republish }),
	).toHaveCount(0);
	await page.goto(`/archive/${id}`);
	await expect(
		page.getByRole("heading", { name: "Synthetic second" }),
	).toBeVisible();
	await page.goto("/archive");
	await expect(
		page.getByRole("link", { name: "Synthetic second" }),
	).toBeVisible();
});

test("a stale save keeps the member's input and shows the latest version", async ({
	browser,
}) => {
	const a = await newMemberPage(browser, "a@example.test");
	const b = await newMemberPage(browser, "b@example.test");
	const id = await createItem(a, "Synthetic original");
	await b.goto(`/family/items/${id}/edit`, { waitUntil: "networkidle" });
	await a.goto(`/family/items/${id}/edit`, { waitUntil: "networkidle" });
	await a.getByLabel(copy.items.title).fill("Saved by A");
	await a.getByRole("button", { name: copy.items.save }).click();
	await expect(a.locator("form").getByRole("status").last()).toHaveText(
		copy.items.saved,
	);
	await b.getByLabel(copy.items.title).fill("Typed by B");
	await b.getByRole("button", { name: copy.items.save }).click();
	await expect(b.locator("form").getByRole("status").last()).toHaveText(
		copy.items.conflict,
	);
	await expect(b.getByLabel(copy.items.title)).toHaveValue("Typed by B");
	await expect(
		b.getByRole("complementary", { name: copy.items.latest }),
	).toContainText("Saved by A");
	await b.getByRole("button", { name: copy.items.save }).click();
	await expect(b.locator("form").getByRole("status").last()).toHaveText(
		copy.items.saved,
	);
	await a.reload();
	await expect(a.getByLabel(copy.items.title)).toHaveValue("Typed by B");
});

test("archive hides an item and restore brings it back as private", async ({
	page,
}) => {
	await signIn(page, "editor@example.test");
	const id = await createItem(page, "Synthetic archived");
	await page.getByRole("button", { name: copy.items.publish }).click();
	await expect(
		page.getByRole("button", { name: copy.items.makePrivate }),
	).toBeVisible();
	await page.getByRole("button", { name: copy.items.archive }).click();
	await expect(
		page.getByRole("button", { name: copy.items.restore }),
	).toBeVisible();
	await page.goto("/family/archived");
	await expect(
		page.getByRole("link", { name: "Synthetic archived" }),
	).toBeVisible();
	await page.goto(`/archive/${id}`);
	await expect(
		page.getByRole("heading", { name: copy.notFound }),
	).toBeVisible();
	await page.goto(`/family/items/${id}/edit`, { waitUntil: "networkidle" });
	await page.getByRole("button", { name: copy.items.restore }).click();
	await expect(page.getByText(copy.items.private).first()).toBeVisible();
	await page.goto(`/archive/${id}`);
	await expect(
		page.getByRole("heading", { name: copy.notFound }),
	).toBeVisible();
});

test("family pages are Hebrew RTL and require sign-in", async ({ page }) => {
	for (const path of [
		"/family/items/new",
		"/family/archived",
		"/family/people",
		"/family/places",
	]) {
		await page.goto(path);
		await expect(page).toHaveURL(/\/sign-in$/);
	}
	await signIn(page, "editor@example.test");
	for (const path of [
		"/family/items/new",
		"/family/archived",
		"/family/people",
		"/family/places",
	]) {
		await page.goto(path);
		await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
		await expect(page.locator("html")).toHaveAttribute("lang", "he");
	}
});
