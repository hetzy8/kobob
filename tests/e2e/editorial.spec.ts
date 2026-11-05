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
	await expect(
		page.getByRole("button", { name: copy.items.save }),
	).toBeEnabled();
	await page.getByLabel(copy.items.title).fill(title);
	await page.getByLabel(copy.items.typeNames.picture).check();
	await page.getByRole("button", { name: copy.items.save }).click();
	await page.waitForURL(/\/family\/items\/[^/]+\/edit$/);
	const id = page.url().split("/").at(-2) as string;
	await db.item.update({ where: { id }, data: { rightsStatus: "cleared" } });
	return id;
}

test("explains that publishing needs cleared rights, then allows it", async ({ page }) => {
	await signIn(page, "rights@example.test");
	const id = await createItem(page, "Synthetic rights item");
	await db.item.update({ where: { id }, data: { rightsStatus: "unknown" } });
	await page.reload();
	await page.getByRole("button", { name: copy.items.publish }).click();
	await expect(page.getByText(copy.items.rightsNotCleared)).toBeVisible();
	await page.getByRole("button", { name: copy.items.markRightsCleared }).click();
	await expect(page.getByText(copy.items.rightsNotCleared)).toHaveCount(0);
	await expect(page.getByRole("button", { name: copy.items.undoRightsCleared })).toBeVisible();
	await page.getByRole("button", { name: copy.items.publish }).click();
	await expect(page.getByText(copy.items.public).first()).toBeVisible();
});

test("publishing shows the published version until the next publish", async ({
	page,
}) => {
	await signIn(page, "editor@example.test");
	const id = await createItem(page, "Synthetic first");
	await page.goto(`/items/${id}`);
	await expect(
		page.getByRole("heading", { name: copy.notFound }),
	).toBeVisible();
	await page.goto(`/family/items/${id}/edit`);
	await expect(
		page.getByRole("button", { name: copy.items.save }),
	).toBeEnabled();
	await page.getByRole("button", { name: copy.items.publish }).click();
	await expect(page.getByText(copy.items.public).first()).toBeVisible();
	await page.goto(`/items/${id}`);
	await expect(
		page.getByRole("heading", { name: "Synthetic first" }),
	).toBeVisible();
	await page.goto(`/family/items/${id}/edit`);
	await expect(
		page.getByRole("button", { name: copy.items.save }),
	).toBeEnabled();
	await page.getByLabel(copy.items.title).fill("Synthetic second");
	await page.getByRole("button", { name: copy.items.save }).click();
	await expect(page.locator("form").getByRole("status").last()).toHaveText(
		copy.items.saved,
	);
	await page.goto(`/items/${id}`);
	await expect(
		page.getByRole("heading", { name: "Synthetic first" }),
	).toBeVisible();
	await page.goto(`/family/items/${id}/edit`);
	await expect(
		page.getByRole("button", { name: copy.items.save }),
	).toBeEnabled();
	await page.getByRole("button", { name: copy.items.republish }).click();
	// Wait for the action to finish before navigating away.
	await expect(
		page.getByRole("button", { name: copy.items.republish }),
	).toHaveCount(0);
	await page.goto(`/items/${id}`);
	await expect(
		page.getByRole("heading", { name: "Synthetic second" }),
	).toBeVisible();
	await page.goto("/search");
	await expect(
		page.getByRole("link", { name: "Synthetic second" }),
	).toBeVisible();
	await page.goto("/search?q=Synthetic+second");
	await expect(
		page.getByRole("link", { name: "Synthetic second" }),
	).toBeVisible();
	await page.goto("/search?q=nothing+like+this");
	await expect(page.getByText(copy.searchPage.noResults)).toBeVisible();
});

test("withdrawing rights warns first, then unpublishes the item", async ({
	page,
	browser,
}) => {
	await signIn(page, "withdraw@example.test");
	const id = await createItem(page, "Synthetic withdrawn item");
	await page.goto(`/family/items/${id}/edit`);
	await expect(page.getByRole("button", { name: copy.items.save })).toBeEnabled();
	await page.getByRole("button", { name: copy.items.publish }).click();
	await expect(page.getByText(copy.items.public).first()).toBeVisible();
	await expect(page.getByText(copy.items.rightsWithdrawWarning)).toBeVisible();
	await page.getByRole("button", { name: copy.items.undoRightsCleared }).click();
	await expect(page.getByText(copy.items.rightsWithdrawn)).toBeVisible();
	await expect(page.getByText(copy.items.rightsWithdrawWarning)).toHaveCount(0);
	await expect(page.getByText(copy.items.private, { exact: true }).first()).toBeVisible();
	await expect(page.getByRole("button", { name: copy.items.publish })).toBeVisible();
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	const anonymous = await (await browser.newContext()).newPage();
	await anonymous.goto(`/items/${id}`);
	await expect(anonymous.getByRole("heading", { name: copy.notFound })).toBeVisible();
	await anonymous.context().close();
});

test("the old public archive and achievements pages are gone", async ({ page }) => {
	for (const path of ["/archive", "/archive/anything", "/achievements"]) {
		const response = await page.goto(path);
		expect(response?.status(), path).toBe(404);
		await expect(page.getByRole("heading", { name: copy.notFound })).toBeVisible();
	}
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
	await page.goto(`/items/${id}`);
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
	await page.goto(`/items/${id}`);
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
		.poll(
			async () =>
				(await db.person.findFirstOrThrow({ where: { id: person.id } }))
					.version,
		)
		.toBeGreaterThan(before.version);
	const row = await db.person.findFirstOrThrow({ where: { id: person.id } });
	expect(row.familyOnly).toBe(true);
	await expect(panel.getByLabel(copy.items.familyOnly)).toBeChecked();
});

test("a person added from the item picker starts family-only", async ({
	page,
}) => {
	await signIn(page, "editor@example.test");
	await page.goto("/family/items/new");
	const people = page
		.locator("fieldset")
		.filter({ hasText: copy.items.people });
	await people.getByLabel(copy.items.search).fill("Synthetic picked");
	const add = people.getByRole("button", { name: copy.items.addNew });
	await expect(add).toBeEnabled();
	await add.click();
	await expect(
		people.getByRole("listitem").filter({ hasText: "Synthetic picked" }),
	).toContainText(copy.items.familyOnly);
	const row = await db.person.findFirstOrThrow({
		where: { name: "Synthetic picked" },
	});
	expect(row.familyOnly).toBe(true);
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
	const row = await db.person.findFirstOrThrow({
		where: { name: "Synthetic added" },
	});
	expect(row.familyOnly).toBe(true);
});

test("an item type ticked on the edit page survives a second save", async ({
	page,
}) => {
	await signIn(page, "editor@example.test");
	const id = await createItem(page, "Synthetic types");
	await expect(
		page.getByRole("button", { name: copy.items.save }),
	).toBeEnabled();
	await page.getByLabel(copy.items.typeNames.video).check();
	await page.getByRole("button", { name: copy.items.save }).click();
	await expect(page.locator("form").getByRole("status").last()).toHaveText(
		copy.items.saved,
	);
	const before = await db.item.findFirstOrThrow({ where: { id } });
	await page.getByRole("button", { name: copy.items.save }).click();
	await expect
		.poll(
			async () => (await db.item.findFirstOrThrow({ where: { id } })).version,
		)
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
	await expect(
		b.getByRole("button", { name: copy.items.archive }),
	).toBeEnabled();
	await b.getByRole("button", { name: copy.items.archive }).click();
	await expect(
		b.getByRole("button", { name: copy.items.restore }),
	).toBeVisible();
	await a.getByRole("button", { name: copy.items.save }).click();
	await expect(a.locator("form").getByRole("status").last()).toHaveText(
		copy.items.conflict,
	);
	await expect(a.getByLabel(copy.items.title)).toHaveValue(
		"Typed before archive",
	);
});

// Any action re-renders the page with fresh props. A form must keep posting
// the version of the values it loaded, never the refreshed one, unless it
// also shows the refreshed values.
test("an edited person form conflicts after another save on the page refreshed it", async ({
	browser,
}) => {
	const a = await newMemberPage(browser, "a@example.test");
	const b = await newMemberPage(browser, "b@example.test");
	const x = await db.person.create({
		data: { name: "Synthetic X", otherNames: [] },
	});
	await db.person.create({ data: { name: "Synthetic Y", otherNames: [] } });
	await a.goto("/family/people");
	await b.goto("/family/people");
	const panel = (page: Page, index: number) =>
		page.locator("section.panel").nth(index);
	const save = (page: Page, index: number) =>
		panel(page, index).getByRole("button", { name: copy.items.save });
	const status = (page: Page, index: number) =>
		panel(page, index).getByRole("status");
	await expect(save(a, 0)).toBeEnabled();
	await expect(save(b, 0)).toBeEnabled();
	await panel(b, 0).getByLabel(copy.items.familyOnly).check();
	await save(b, 0).click();
	await expect(status(b, 0)).toHaveText(copy.items.saved);
	await panel(a, 0).getByLabel(copy.items.otherNames).fill("Synthetic alias");
	await panel(a, 1).getByLabel(copy.items.otherNames).fill("Synthetic Y alias");
	await save(a, 1).click();
	await expect(status(a, 1)).toHaveText(copy.items.saved);
	await save(a, 0).click();
	await expect(status(a, 0)).toHaveText(copy.items.conflict);
	await expect(
		panel(a, 0).getByRole("complementary", { name: copy.items.latest }),
	).toContainText(copy.items.familyOnly);
	expect(
		(await db.person.findFirstOrThrow({ where: { id: x.id } })).familyOnly,
	).toBe(true);
	await save(a, 0).click();
	await expect(status(a, 0)).toHaveText(copy.items.saved);
	const row = await db.person.findFirstOrThrow({ where: { id: x.id } });
	expect(row.familyOnly).toBe(true);
	expect(row.otherNames).toEqual(["Synthetic alias"]);
});

test("an unedited person form loads the refreshed record after another save on the page", async ({
	browser,
}) => {
	const a = await newMemberPage(browser, "a@example.test");
	const b = await newMemberPage(browser, "b@example.test");
	const x = await db.person.create({
		data: { name: "Synthetic X", otherNames: [] },
	});
	await db.person.create({ data: { name: "Synthetic Y", otherNames: [] } });
	await a.goto("/family/people");
	await b.goto("/family/people");
	const panel = (page: Page, index: number) =>
		page.locator("section.panel").nth(index);
	const save = (page: Page, index: number) =>
		panel(page, index).getByRole("button", { name: copy.items.save });
	const status = (page: Page, index: number) =>
		panel(page, index).getByRole("status");
	await expect(save(a, 0)).toBeEnabled();
	await expect(save(b, 0)).toBeEnabled();
	await panel(b, 0).getByLabel(copy.items.familyOnly).check();
	await save(b, 0).click();
	await expect(status(b, 0)).toHaveText(copy.items.saved);
	await panel(a, 1).getByLabel(copy.items.otherNames).fill("Synthetic Y alias");
	await save(a, 1).click();
	await expect(status(a, 1)).toHaveText(copy.items.saved);
	await expect(panel(a, 0).getByLabel(copy.items.familyOnly)).toBeChecked();
	await panel(a, 0).getByLabel(copy.items.otherNames).fill("Synthetic alias");
	await save(a, 0).click();
	await expect(status(a, 0)).toHaveText(copy.items.saved);
	const row = await db.person.findFirstOrThrow({ where: { id: x.id } });
	expect(row.familyOnly).toBe(true);
	expect(row.otherNames).toEqual(["Synthetic alias"]);
});

test("an edited item form conflicts after a lifecycle action refreshed the page", async ({
	browser,
}) => {
	const a = await newMemberPage(browser, "a@example.test");
	const b = await newMemberPage(browser, "b@example.test");
	const id = await createItem(a, "Synthetic original");
	await expect(a.getByRole("button", { name: copy.items.save })).toBeEnabled();
	await b.goto(`/family/items/${id}/edit`);
	await expect(b.getByRole("button", { name: copy.items.save })).toBeEnabled();
	await b.getByLabel(copy.items.title).fill("Title by B");
	await b.getByRole("button", { name: copy.items.save }).click();
	await expect(b.locator("form").getByRole("status").last()).toHaveText(
		copy.items.saved,
	);
	await a.getByLabel(copy.items.description).fill("Description by A");
	// A's lifecycle buttons still carry the old version, so this conflicts and
	// re-renders the page with B's version and title.
	await a.getByRole("button", { name: copy.items.publish }).click();
	await expect(
		a.getByRole("status").filter({ hasText: copy.items.conflict }),
	).toHaveCount(1);
	await a.getByRole("button", { name: copy.items.save }).click();
	await expect(a.locator("form").getByRole("status").last()).toHaveText(
		copy.items.conflict,
	);
	await expect(a.getByLabel(copy.items.description)).toHaveValue(
		"Description by A",
	);
	await expect(
		a.getByRole("complementary", { name: copy.items.latest }),
	).toContainText("Title by B");
	const item = await db.item.findFirstOrThrow({
		where: { id },
		include: { workingRevision: true },
	});
	expect(item.workingRevision?.title).toBe("Title by B");
});

test("the conflict aside shows the types and tags another member saved", async ({
	browser,
}) => {
	const a = await newMemberPage(browser, "a@example.test");
	const b = await newMemberPage(browser, "b@example.test");
	const id = await createItem(a, "Synthetic aside");
	await expect(a.getByRole("button", { name: copy.items.save })).toBeEnabled();
	await b.goto(`/family/items/${id}/edit`);
	await expect(b.getByRole("button", { name: copy.items.save })).toBeEnabled();
	await b.getByLabel(copy.items.typeNames.video).check();
	await b.getByLabel(copy.items.tags).fill("Synthetic tag by B");
	await b.getByRole("button", { name: copy.items.save }).click();
	await expect(b.locator("form").getByRole("status").last()).toHaveText(
		copy.items.saved,
	);
	await a.getByLabel(copy.items.title).fill("Title by A");
	await a.getByRole("button", { name: copy.items.save }).click();
	await expect(a.locator("form").getByRole("status").last()).toHaveText(
		copy.items.conflict,
	);
	const aside = a.getByRole("complementary", { name: copy.items.latest });
	await expect(aside).toContainText("Synthetic tag by B");
	await expect(aside).toContainText(copy.items.typeNames.video);
});

test("publishing from the edit page does not make the next save conflict", async ({
	page,
}) => {
	await signIn(page, "editor@example.test");
	const id = await createItem(page, "Synthetic published");
	await expect(
		page.getByRole("button", { name: copy.items.save }),
	).toBeEnabled();
	await page.getByRole("button", { name: copy.items.publish }).click();
	await expect(
		page.getByRole("button", { name: copy.items.makePrivate }),
	).toBeVisible();
	await page
		.getByLabel(copy.items.title)
		.fill("Synthetic edited after publish");
	await page.getByRole("button", { name: copy.items.save }).click();
	await expect(page.locator("form").getByRole("status").last()).toHaveText(
		copy.items.saved,
	);
	const item = await db.item.findFirstOrThrow({
		where: { id },
		include: { workingRevision: true },
	});
	expect(item.workingRevision?.title).toBe("Synthetic edited after publish");
});

test("family sub-pages hide private content while logout is pending", async ({
	page,
	context,
}) => {
	await signIn(page, "editor@example.test");
	const id = await createItem(page, "Synthetic locked item");
	await db.person.create({
		data: { name: "Synthetic locked person", otherNames: [] },
	});
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

test("only signed-in members see the Archive tab, and it opens the family list", async ({
	page,
}) => {
	const nav = page.getByRole("navigation", { name: copy.navigationLabel });
	await page.goto("/");
	await expect(nav.getByRole("link", { name: copy.searchPage.title, exact: true })).toBeVisible();
	await expect(nav.getByRole("link", { name: copy.archive, exact: true })).toHaveCount(0);
	await page.goto("/family");
	await page.waitForURL(/\/sign-in$/);
	await signIn(page, "navigator@example.test");
	await page.goto("/search");
	await nav.getByRole("link", { name: copy.archive, exact: true }).click();
	await page.waitForURL(/\/family$/);
	await expect(page.getByRole("heading", { name: copy.family })).toBeVisible();
	await db.user.update({ where: { email: "navigator@example.test" }, data: { status: "revoked" } });
	await page.goto("/");
	await expect(nav.getByRole("link", { name: copy.archive, exact: true })).toHaveCount(0);
});

test("a public link card shows its source details and nothing private", async ({ page }) => {
	const item = await db.item.create({ data: { origin: "internet", visibility: "public", publishedAt: new Date() } });
	const revision = await db.itemRevision.create({
		data: { itemId: item.id, title: "Synthetic link card", types: ["article"], authorId: "system:import" },
	});
	await db.item.update({ where: { id: item.id }, data: { workingRevisionId: revision.id, publishedRevisionId: revision.id } });
	await db.externalSource.createMany({
		data: [
			{
				itemId: item.id,
				url: "https://example.test/article",
				publisher: "Synthetic Press",
				publishedText: "Synthetic 1979",
				license: "Synthetic license",
			},
			{ itemId: item.id, url: "javascript:alert(1)", publisher: "Synthetic bad" },
		],
	});
	await db.itemCatalogRecord.create({
		data: { itemId: item.id, tab: "catalog", row: { catalog: { note: "PRIVATE-FOLDER" }, web: null }, snapshotHash: "synthetic" },
	});
	await db.mediaFile.create({
		data: {
			itemId: item.id,
			role: "original",
			storageKey: `originals/${item.id}`,
			mimeType: "text/html",
			sizeBytes: 1n,
			originalFilename: "PRIVATE-NAME.html",
		},
	});
	await page.goto(`/items/${item.id}`);
	await expect(page.getByRole("heading", { name: "Synthetic link card" })).toBeVisible();
	const link = page.getByRole("link", { name: copy.items.sourceLink });
	await expect(link).toHaveCount(1);
	await expect(link).toHaveAttribute("href", "https://example.test/article");
	await expect(link).toHaveAttribute("rel", "noopener noreferrer");
	const article = page.getByRole("article");
	await expect(article).toContainText(`${copy.items.publisher}: Synthetic Press`);
	await expect(article).toContainText("Synthetic 1979");
	await expect(article).toContainText(`${copy.items.license}: Synthetic license`);
	const html = await page.content();
	expect(html).not.toContain("PRIVATE-FOLDER");
	expect(html).not.toContain("PRIVATE-NAME");
	expect(html).not.toContain("javascript:");
});

test("the family list pages and filters items needing review", async ({ page }) => {
	await signIn(page, "paging@example.test");
	for (let index = 0; index < 51; index++) {
		const item = await db.item.create({ data: { reviewStatus: index === 0 ? "needs_review" : "reviewed" } });
		const revision = await db.itemRevision.create({
			data: { itemId: item.id, title: `Synthetic ${index}`, types: ["other"], authorId: "system:import" },
		});
		await db.item.update({ where: { id: item.id }, data: { workingRevisionId: revision.id } });
	}
	await page.goto("/family");
	await expect(page.getByText(copy.items.pageOf(1, 2))).toBeVisible();
	await page.getByRole("link", { name: copy.items.nextPage }).click();
	await expect(page.getByText(copy.items.pageOf(2, 2))).toBeVisible();
	await page.getByRole("link", { name: copy.items.showNeedsReview }).click();
	await expect(page.getByRole("link", { name: "Synthetic 0", exact: true })).toBeVisible();
	await expect(page.getByRole("link", { name: "Synthetic 1", exact: true })).toHaveCount(0);
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
