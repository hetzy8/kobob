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
	await page.goto("/family/items/new");
	await expect(page.getByRole("button", { name: copy.items.save })).toBeEnabled();
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
	await page.goto(`/family/items/${id}/edit`);
	await expect(page.getByRole("button", { name: copy.items.save })).toBeEnabled();
	await page.getByRole("button", { name: copy.items.publish }).click();
	await expect(page.getByText(copy.items.public).first()).toBeVisible();
	await page.goto(`/archive/${id}`);
	await expect(
		page.getByRole("heading", { name: "Synthetic first" }),
	).toBeVisible();
	await page.goto(`/family/items/${id}/edit`);
	await expect(page.getByRole("button", { name: copy.items.save })).toBeEnabled();
	await page.getByLabel(copy.items.title).fill("Synthetic second");
	await page.getByRole("button", { name: copy.items.save }).click();
	await expect(page.locator("form").getByRole("status").last()).toHaveText(
		copy.items.saved,
	);
	await page.goto(`/archive/${id}`);
	await expect(
		page.getByRole("heading", { name: "Synthetic first" }),
	).toBeVisible();
	await page.goto(`/family/items/${id}/edit`);
	await expect(page.getByRole("button", { name: copy.items.save })).toBeEnabled();
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
	await b.goto(`/family/items/${id}/edit`);
	await expect(b.getByRole("button", { name: copy.items.save })).toBeEnabled();
	await a.goto(`/family/items/${id}/edit`);
	await expect(a.getByRole("button", { name: copy.items.save })).toBeEnabled();
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
	await page.goto(`/family/items/${id}/edit`);
	await expect(
		page.getByRole("button", { name: copy.items.restore }),
	).toBeEnabled();
	await page.getByRole("button", { name: copy.items.restore }).click();
	await expect(
		page.getByRole("button", { name: copy.items.restore }),
	).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: copy.items.archive }),
	).toBeVisible();
	await page.goto(`/archive/${id}`);
	await expect(
		page.getByRole("heading", { name: copy.notFound }),
	).toBeVisible();
});

test("a stale person form shows the latest record and keeps the newer family-only decision", async ({
	browser,
}) => {
	const a = await newMemberPage(browser, "a@example.test");
	const b = await newMemberPage(browser, "b@example.test");
	const person = await db.person.create({
		data: { name: "Synthetic person", otherNames: [] },
	});
	await a.goto("/family/people");
	await b.goto("/family/people");
	const panel = (page: Page) => page.locator("section.panel").first();
	const save = (page: Page) =>
		panel(page).getByRole("button", { name: copy.items.save });
	const status = (page: Page) => panel(page).getByRole("status");
	await expect(save(a)).toBeEnabled();
	await expect(save(b)).toBeEnabled();
	await panel(b).getByLabel(copy.items.familyOnly).check();
	await save(b).click();
	await expect(status(b)).toHaveText(copy.items.saved);
	await panel(a).getByLabel(copy.items.otherNames).fill("Synthetic alias");
	await save(a).click();
	await expect(status(a)).toHaveText(copy.items.conflict);
	await expect(panel(a).getByLabel(copy.items.familyOnly)).toBeChecked();
	await expect(panel(a).getByLabel(copy.items.otherNames)).toHaveValue(
		"Synthetic alias",
	);
	const aside = a.getByRole("complementary", { name: copy.items.latest });
	await expect(aside).toContainText("Synthetic person");
	await expect(aside).toContainText(copy.items.familyOnly);
	await save(a).click();
	await expect(status(a)).toHaveText(copy.items.saved);
	const row = await db.person.findFirstOrThrow({ where: { id: person.id } });
	expect(row.familyOnly).toBe(true);
	expect(row.otherNames).toEqual(["Synthetic alias"]);
});

// React resets a form after an `action={…}` submission, which returns a
// controlled checkbox to its page-load state in the DOM while React state
// keeps the new value; a second save must still send the new value.
test("family-only survives a conflict where both members ticked it and a second save", async ({
	browser,
}) => {
	const a = await newMemberPage(browser, "a@example.test");
	const b = await newMemberPage(browser, "b@example.test");
	const person = await db.person.create({
		data: { name: "Synthetic both ticked", otherNames: [] },
	});
	await a.goto("/family/people");
	await b.goto("/family/people");
	const panel = (page: Page) => page.locator("section.panel").first();
	const save = (page: Page) =>
		panel(page).getByRole("button", { name: copy.items.save });
	const status = (page: Page) => panel(page).getByRole("status");
	await expect(save(a)).toBeEnabled();
	await expect(save(b)).toBeEnabled();
	await panel(b).getByLabel(copy.items.familyOnly).check();
	await save(b).click();
	await expect(status(b)).toHaveText(copy.items.saved);
	await panel(a).getByLabel(copy.items.familyOnly).check();
	await panel(a).getByLabel(copy.items.otherNames).fill("Synthetic alias");
	await save(a).click();
	await expect(status(a)).toHaveText(copy.items.conflict);
	await save(a).click();
	await expect(status(a)).toHaveText(copy.items.saved);
	const row = await db.person.findFirstOrThrow({ where: { id: person.id } });
	expect(row.familyOnly).toBe(true);
	expect(row.otherNames).toEqual(["Synthetic alias"]);
	await expect(panel(a).getByLabel(copy.items.familyOnly)).toBeChecked();
});

test("family-only stays on when a saved person form is saved again", async ({
	page,
}) => {
	await signIn(page, "editor@example.test");
	const person = await db.person.create({
		data: { name: "Synthetic resaved", otherNames: [] },
	});
	await page.goto("/family/people");
	const panel = page.locator("section.panel").first();
	const save = panel.getByRole("button", { name: copy.items.save });
	await expect(save).toBeEnabled();
	await panel.getByLabel(copy.items.familyOnly).check();
	await save.click();
	await expect(panel.getByRole("status")).toHaveText(copy.items.saved);
	const before = await db.person.findFirstOrThrow({ where: { id: person.id } });
	await save.click();
	await expect
		.poll(async () => (await db.person.findFirstOrThrow({ where: { id: person.id } })).version)
		.toBeGreaterThan(before.version);
	const row = await db.person.findFirstOrThrow({ where: { id: person.id } });
	expect(row.familyOnly).toBe(true);
	await expect(panel.getByLabel(copy.items.familyOnly)).toBeChecked();
});

test("the new-person form clears after a successful add", async ({ page }) => {
	await signIn(page, "editor@example.test");
	await page.goto("/family/people");
	const form = page.locator("form").first();
	const add = form.getByRole("button", { name: copy.items.addNew });
	await expect(add).toBeEnabled();
	await form.getByLabel(copy.items.name).fill("Synthetic added");
	await form.getByLabel(copy.items.familyOnly).check();
	await add.click();
	await expect(form.getByRole("status")).toHaveText(copy.items.saved);
	await expect(form.getByLabel(copy.items.name)).toHaveValue("");
	await expect(form.getByLabel(copy.items.familyOnly)).not.toBeChecked();
	const row = await db.person.findFirstOrThrow({ where: { name: "Synthetic added" } });
	expect(row.familyOnly).toBe(true);
});

test("an item type ticked on the edit page survives a second save", async ({
	page,
}) => {
	await signIn(page, "editor@example.test");
	const id = await createItem(page, "Synthetic types");
	await expect(page.getByRole("button", { name: copy.items.save })).toBeEnabled();
	await page.getByLabel(copy.items.typeNames.video).check();
	await page.getByRole("button", { name: copy.items.save }).click();
	await expect(page.locator("form").getByRole("status").last()).toHaveText(
		copy.items.saved,
	);
	const before = await db.item.findFirstOrThrow({ where: { id } });
	await page.getByRole("button", { name: copy.items.save }).click();
	await expect
		.poll(async () => (await db.item.findFirstOrThrow({ where: { id } })).version)
		.toBeGreaterThan(before.version);
	const item = await db.item.findFirstOrThrow({
		where: { id },
		include: { workingRevision: true },
	});
	expect(item.workingRevision?.types).toEqual(
		expect.arrayContaining(["picture", "video"]),
	);
	await expect(page.getByLabel(copy.items.typeNames.video)).toBeChecked();
});

test("a save on an item archived meanwhile keeps the input and shows the conflict", async ({
	browser,
}) => {
	const a = await newMemberPage(browser, "a@example.test");
	const b = await newMemberPage(browser, "b@example.test");
	const id = await createItem(a, "Synthetic soon archived");
	await expect(a.getByRole("button", { name: copy.items.save })).toBeEnabled();
	await a.getByLabel(copy.items.title).fill("Typed before archive");
	await b.goto(`/family/items/${id}/edit`);
	await expect(b.getByRole("button", { name: copy.items.archive })).toBeEnabled();
	await b.getByRole("button", { name: copy.items.archive }).click();
	await expect(b.getByRole("button", { name: copy.items.restore })).toBeVisible();
	await a.getByRole("button", { name: copy.items.save }).click();
	await expect(a.locator("form").getByRole("status").last()).toHaveText(
		copy.items.conflict,
	);
	await expect(a.getByLabel(copy.items.title)).toHaveValue("Typed before archive");
});

test("family sub-pages hide private content while logout is pending", async ({
	page,
	context,
}) => {
	await signIn(page, "editor@example.test");
	const id = await createItem(page, "Synthetic locked item");
	await db.person.create({ data: { name: "Synthetic locked person", otherNames: [] } });
	await context.addCookies([
		{
			name: "kobob_logout_pending",
			value: "1",
			url: config.origin,
		},
	]);
	for (const [path, text] of [
		["/family/people", "Synthetic locked person"],
		[`/family/items/${id}/edit`, "Synthetic locked item"],
	]) {
		await page.goto(path);
		await expect(page.getByRole("alert")).toHaveText(copy.locked);
		await expect(page.getByText(text)).toHaveCount(0);
		await expect(page.getByLabel(copy.items.title)).toHaveCount(0);
	}
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
