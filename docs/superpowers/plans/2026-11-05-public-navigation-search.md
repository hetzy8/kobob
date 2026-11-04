# Public navigation, family-only archive and search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public archive with public search and item pages, drop Achievements, and show an Archive tab to signed-in family members only.

**Architecture:** A pure search module (`src/services/search.ts`) parses the query and matches one published revision; the archive reader loads published items and filters them with it. Public routes move from `/archive` to `/search` and `/items/[id]`. The root layout renders a server navigation component that adds the Archive tab after a non-throwing membership check.

**Tech Stack:** Next.js 16.4.3 App Router (webpack), React 19.3.1, Prisma 7.10.1, PostgreSQL, Vitest, Playwright, Biome.

Spec: `docs/superpowers/specs/2026-11-05-public-navigation-search-design.md`.

## Global Constraints

- Search reads only active, public items through their **published revision**; unpublished edits, private and archived items are never read.
- People marked `familyOnly` are never matched or shown on any public path.
- A query is cut to 200 characters and 10 words; a word matching `^[12]\d{3}$` is a year, every other word a text word; every word must match.
- A year matches when the item's date period overlaps it: single date = its precision from its start (decade = start year + 9); range = start year to end year (+9 when precision is decade); unknown dates never match a year.
- Visitor navigation: Life story (`/about`), Search (`/search`). Members additionally see Archive (`/family`). Hiding the tab is presentation only; `/family` keeps its own checks. A failed membership check shows visitor navigation, never an error.
- `/archive`, `/archive/[id]` and `/achievements` are removed (answer not-found). No redirects.
- All interface text lives in `src/locales/he.ts`; no inline Hebrew or English in components. Visible page text must contain no Latin letters (existing browser test). New strings need Yoram's approval before release.
- Never touch or stage `next-env.d.ts`. No real names, emails or secrets in tests; synthetic data only.
- Local Node is 20 (project targets 24). Integration and browser tests need the isolated test database (`docs/DEVELOPMENT.md` → Isolated test database).

## File map

| File | Change |
|---|---|
| `src/services/search.ts` | new: `parseQuery`, `yearSpan`, `matches` |
| `tests/unit/search.test.ts` | new |
| `src/services/archive.ts` | add `searchPublicItems`; `listPublicItems` delegates to it |
| `tests/integration/archive.test.ts` | add search tests |
| `src/app/items/[id]/page.tsx` | new (moved from `src/app/archive/[id]/page.tsx`) |
| `src/app/search/page.tsx` | new |
| `src/app/archive/`, `src/app/achievements/` | deleted |
| `src/locales/he.ts` | navigation, member navigation, search strings; drop achievements |
| `src/app/family/items/actions.ts` | revalidate `/search` and `/items/[id]` instead of `/archive` |
| `src/services/access.ts` | add `isMemberForNavigation` |
| `src/components/site-nav.tsx` | new |
| `src/app/layout.tsx` | use `SiteNav` |
| `tests/e2e/sign-in.spec.ts`, `tests/e2e/editorial.spec.ts`, `tests/fixtures/he-interface.json` | updated |
| `docs/DEVELOPMENT.md`, spec | status |

---

### Task 1: Search matching

**Files:**
- Create: `src/services/search.ts`
- Test: `tests/unit/search.test.ts`

**Interfaces:**
- Consumes: `DateValue` from `src/services/item-input.ts` (`{kind:"unknown"} | {kind:"single", start:"YYYY-MM-DD", precision, approximate} | {kind:"range", start, end, precision, approximate}`).
- Produces:
  - `type SearchQuery = { words: string[]; years: number[] }`
  - `parseQuery(text: string): SearchQuery`
  - `yearSpan(date: DateValue): [number, number] | null`
  - `matches(doc: { texts: string[]; date: DateValue }, query: SearchQuery): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/search.test.ts
import { expect, it } from "vitest";
import { matches, parseQuery, yearSpan } from "../../src/services/search";

it("splits words and years, lowercases words, and caps length and count", () => {
	expect(parseQuery("  Haifa 1985  race ")).toEqual({ words: ["haifa", "race"], years: [1985] });
	expect(parseQuery("")).toEqual({ words: [], years: [] });
	expect(parseQuery("999 3000 12345")).toEqual({ words: ["999", "3000", "12345"], years: [] });
	expect(parseQuery("1000 2999")).toEqual({ words: [], years: [1000, 2999] });
	const many = Array.from({ length: 15 }, (_, i) => `w${i}`).join(" ");
	expect(parseQuery(many).words).toHaveLength(10);
	expect(parseQuery(`${"a".repeat(250)} tail`)).toEqual({ words: ["a".repeat(200)], years: [] });
});

it("gives each date its year span", () => {
	expect(yearSpan({ kind: "unknown" })).toBeNull();
	expect(yearSpan({ kind: "single", start: "1975-03-12", precision: "day", approximate: false })).toEqual([1975, 1975]);
	expect(yearSpan({ kind: "single", start: "1975-03-01", precision: "month", approximate: false })).toEqual([1975, 1975]);
	expect(yearSpan({ kind: "single", start: "1975-01-01", precision: "year", approximate: true })).toEqual([1975, 1975]);
	expect(yearSpan({ kind: "single", start: "1970-01-01", precision: "decade", approximate: false })).toEqual([1970, 1979]);
	expect(
		yearSpan({ kind: "range", start: "1970-01-01", end: "1974-01-01", precision: "year", approximate: false }),
	).toEqual([1970, 1974]);
	expect(
		yearSpan({ kind: "range", start: "1960-01-01", end: "1970-01-01", precision: "decade", approximate: false }),
	).toEqual([1960, 1979]);
});

const doc = (texts: string[], start = "1985-06-01") => ({
	texts,
	date: { kind: "single" as const, start, precision: "day" as const, approximate: false },
});

it("needs every word in some text and every year in the span", () => {
	const item = doc(["Race in Haifa", "running", "Synthetic Person"]);
	expect(matches(item, parseQuery(""))).toBe(true);
	expect(matches(item, parseQuery("haifa"))).toBe(true);
	expect(matches(item, parseQuery("HAIFA run"))).toBe(true);
	expect(matches(item, parseQuery("haifa swim"))).toBe(false);
	expect(matches(item, parseQuery("1985"))).toBe(true);
	expect(matches(item, parseQuery("1986"))).toBe(false);
	expect(matches(item, parseQuery("haifa 1985"))).toBe(true);
	expect(matches(item, parseQuery("haifa 1984"))).toBe(false);
	expect(matches({ texts: ["x"], date: { kind: "unknown" } }, parseQuery("1985"))).toBe(false);
});

it("matches Hebrew substrings, including with a prefix letter", () => {
	expect(matches(doc(["מרוץ בחיפה"]), parseQuery("חיפה"))).toBe(true);
	expect(matches(doc(["חיפה"]), parseQuery("בחיפה"))).toBe(false);
});

it("treats % and _ literally", () => {
	expect(matches(doc(["50% off"]), parseQuery("50%"))).toBe(true);
	expect(matches(doc(["abc"]), parseQuery("%"))).toBe(false);
	expect(matches(doc(["abc"]), parseQuery("a_c"))).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/search.test.ts`
Expected: FAIL, cannot resolve `../../src/services/search`.

- [ ] **Step 3: Write the implementation**

```ts
// src/services/search.ts
import type { DateValue } from "./item-input";

// Public search matching (spec 2026-11-05). Pure, so the family-only and year
// rules are unit-tested; callers pass only published, public text.
const MAX_LENGTH = 200;
const MAX_WORDS = 10;
const YEAR = /^[12]\d{3}$/;

export type SearchQuery = { words: string[]; years: number[] };

export function parseQuery(text: string): SearchQuery {
	const parts = text.slice(0, MAX_LENGTH).split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
	const query: SearchQuery = { words: [], years: [] };
	for (const part of parts) {
		if (YEAR.test(part)) query.years.push(Number(part));
		else query.words.push(part.toLocaleLowerCase());
	}
	return query;
}

// A date covers its whole precision: a decade from its start year runs ten years.
export function yearSpan(date: DateValue): [number, number] | null {
	if (date.kind === "unknown") return null;
	const year = (value: string) => Number(value.slice(0, 4));
	const last = year(date.kind === "range" ? date.end : date.start);
	return [year(date.start), date.precision === "decade" ? last + 9 : last];
}

export function matches(
	doc: { texts: string[]; date: DateValue },
	query: SearchQuery,
): boolean {
	const texts = doc.texts.map((text) => text.toLocaleLowerCase());
	const span = yearSpan(doc.date);
	return (
		query.words.every((word) => texts.some((text) => text.includes(word))) &&
		query.years.every((year) => span !== null && span[0] <= year && year <= span[1])
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/search.test.ts` → PASS (5 tests). Then `npm run lint && npm run typecheck` → clean (the existing three `document.cookie` warnings are expected).

- [ ] **Step 5: Commit**

```bash
git add src/services/search.ts tests/unit/search.test.ts
git commit -m "feat: public search query parsing and matching"
```

---

### Task 2: Archive reader search

**Files:**
- Modify: `src/services/archive.ts`
- Test: `tests/integration/archive.test.ts` (append)

**Interfaces:**
- Consumes: `parseQuery`, `matches` from Task 1; `revisionInclude`, `dateFromRow` from `src/services/item-view.ts`.
- Produces: `createArchiveReader(db).searchPublicItems(text: string): Promise<PublicSummary[]>`; `listPublicItems()` keeps its signature and returns `searchPublicItems("")`. `PublicSummary` is unchanged: `{ id, title, types, date }`.

- [ ] **Step 1: Write the failing tests** (append to `tests/integration/archive.test.ts`; it already has `editor()`, `input()`, `reader` and cleanup)

```ts
it("searches the published revision's text, tags, people and places", async () => {
	const a = await editor();
	const person = await a.savePerson({ name: "Synthetic Runner", otherNames: ["Nickname Runner"], familyOnly: false });
	const place = await a.savePlace({ name: "Synthetic Harbor", otherNames: ["Old Harbor"], latitude: null, longitude: null });
	const { id } = await a.createItem(
		input("Race report", {
			description: "A long morning",
			tags: ["marathon"],
			personIds: [person.id],
			placeIds: [place.id],
		}),
	);
	await a.createItem(input("Unrelated private"));
	await a.transitionItem(id, 1, "publish");
	for (const text of ["race", "MORNING", "marath", "synthetic runner", "nickname", "harbor", "old harbor", "race harbor"]) {
		expect((await reader.searchPublicItems(text)).map((item) => item.id), text).toEqual([id]);
	}
	expect(await reader.searchPublicItems("race swimming")).toEqual([]);
	expect(await reader.searchPublicItems("unrelated")).toEqual([]);
	expect((await reader.searchPublicItems("")).map((item) => item.id)).toEqual([id]);
});

it("matches years by the date's whole period", async () => {
	const a = await editor();
	const make = async (title: string, date: ItemInput["date"]) => {
		const { id } = await a.createItem(input(title, { date }));
		await a.transitionItem(id, 1, "publish");
		return id;
	};
	const day = await make("Day", { kind: "single", start: "1985-06-01", precision: "day", approximate: false });
	const decade = await make("Decade", { kind: "single", start: "1980-01-01", precision: "decade", approximate: true });
	const range = await make("Range", { kind: "range", start: "1983-01-01", end: "1986-01-01", precision: "year", approximate: false });
	await make("Undated", { kind: "unknown" });
	const ids = async (text: string) => (await reader.searchPublicItems(text)).map((item) => item.id).sort();
	expect(await ids("1985")).toEqual([day, decade, range].sort());
	expect(await ids("1989")).toEqual([decade]);
	expect(await ids("1983")).toEqual([decade, range].sort());
	expect(await ids("1990")).toEqual([]);
	expect(await ids("day 1985")).toEqual([day]);
});

it("never searches private, archived or unpublished text", async () => {
	const a = await editor();
	const { id: published } = await a.createItem(input("Visible title"));
	await a.transitionItem(published, 1, "publish");
	await a.updateItem(published, 2, input("Draftonly title"));
	await a.createItem(input("Privateonly title"));
	const { id: archived } = await a.createItem(input("Archivedonly title"));
	await a.transitionItem(archived, 1, "publish");
	await a.transitionItem(archived, 2, "archive");
	expect(await reader.searchPublicItems("draftonly")).toEqual([]);
	expect(await reader.searchPublicItems("privateonly")).toEqual([]);
	expect(await reader.searchPublicItems("archivedonly")).toEqual([]);
	expect((await reader.searchPublicItems("visible")).map((item) => item.id)).toEqual([published]);
});

it("never finds an item by a family-only person's names", async () => {
	const a = await editor();
	const hidden = await a.savePerson({ name: "Hiddenname Person", otherNames: ["Hiddenalias"], familyOnly: true });
	const { id } = await a.createItem(input("Group photo", { personIds: [hidden.id] }));
	await a.transitionItem(id, 1, "publish");
	expect(await reader.searchPublicItems("hiddenname")).toEqual([]);
	expect(await reader.searchPublicItems("hiddenalias")).toEqual([]);
	expect((await reader.searchPublicItems("group")).map((item) => item.id)).toEqual([id]);
	expect(JSON.stringify(await reader.searchPublicItems("group"))).not.toContain("Hidden");
});

it("matches % and _ literally", async () => {
	const a = await editor();
	const { id } = await a.createItem(input("Fifty 50% done"));
	await a.transitionItem(id, 1, "publish");
	expect((await reader.searchPublicItems("50%")).map((item) => item.id)).toEqual([id]);
	expect(await reader.searchPublicItems("%%")).toEqual([]);
	expect(await reader.searchPublicItems("fift_")).toEqual([]);
});
```

Note: `input()` sets `description` to `${title} description`, so words chosen above ("draftonly", "privateonly"…) must not appear in another item's title. They don't.

- [ ] **Step 2: Run tests to verify they fail**

Run (test database up and migrated, `TEST_DATABASE_URL` exported): `npx vitest run tests/integration/archive.test.ts`
Expected: FAIL, `reader.searchPublicItems is not a function`.

- [ ] **Step 3: Implement** — replace the body of `createArchiveReader` in `src/services/archive.ts`:

```ts
import "server-only";
import type { Database } from "../lib/database";
import type { DateValue, ItemTypeValue } from "./item-input";
import { dateFromRow, revisionInclude, toRevisionView, type RevisionView } from "./item-view";
import { matches, parseQuery } from "./search";

export type PublicSummary = {
	id: string;
	title: string;
	types: ItemTypeValue[];
	date: DateValue;
};

// The only reader for visitors. It needs no session, so it must select from
// the published revision alone and drop family-only people.
const publicWhere = {
	state: "active",
	visibility: "public",
	publishedRevisionId: { not: null },
} as const;

export function createArchiveReader(db: Database) {
	// Loads every published item and matches in code (spec 2026-11-05: fine at
	// family-archive scale; move matching into SQL if it gets slow).
	async function searchPublicItems(text: string): Promise<PublicSummary[]> {
		const query = parseQuery(text);
		const items = await db.item.findMany({
			where: publicWhere,
			include: { publishedRevision: { include: revisionInclude } },
			orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
		});
		return items.flatMap((item) => {
			const revision = item.publishedRevision;
			if (!revision) return [];
			const date = dateFromRow(revision);
			const texts = [
				revision.title,
				revision.description,
				...revision.tags,
				...revision.people
					.filter(({ person }) => !person.familyOnly)
					.flatMap(({ person }) => [person.name, ...person.otherNames]),
				...revision.places.flatMap(({ place }) => [place.name, ...place.otherNames]),
			];
			if (!matches({ texts, date }, query)) return [];
			return [{ id: item.id, title: revision.title, types: revision.types, date }];
		});
	}
	return {
		searchPublicItems,
		listPublicItems: () => searchPublicItems(""),
		async getPublicItem(id: string): Promise<(RevisionView & { id: string }) | null> {
			const item = await db.item.findFirst({
				where: { id, ...publicWhere },
				include: { publishedRevision: { include: revisionInclude } },
			});
			if (!item?.publishedRevision) return null;
			return { id: item.id, ...toRevisionView(item.publishedRevision, { publicOnly: true }) };
		},
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration/archive.test.ts` → all pass, including the four existing tests. Then `npm run lint && npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/services/archive.ts tests/integration/archive.test.ts
git commit -m "feat: search published items by text, people, places and year"
```

---

### Task 3: Public routes — search and item pages; remove archive and achievements

**Files:**
- Create: `src/app/items/[id]/page.tsx`, `src/app/search/page.tsx`
- Delete: `src/app/archive/page.tsx`, `src/app/archive/[id]/page.tsx`, `src/app/achievements/page.tsx`
- Modify: `src/locales/he.ts`, `src/app/family/items/actions.ts`, `tests/e2e/editorial.spec.ts`, `tests/e2e/sign-in.spec.ts`, `tests/fixtures/he-interface.json`

**Interfaces:**
- Consumes: `archiveReader().searchPublicItems`, `archiveReader().getPublicItem` (Task 2).
- Produces (locale, used by Task 4):
  - `copy.navigation: { href: string; label: string }[]` = Life story, Search
  - `copy.memberNavigation: { href: "/family"; label: string }` (label = `copy.archive`)
  - `copy.searchPage: { title, label, submit, noResults }`

- [ ] **Step 1: Locale.** In `src/locales/he.ts` replace the `about`/`achievements`/`archive`/`navigation` block with:

```ts
	about: "סיפור חיים",
	archive: "ארכיון",
	// Visitor tabs in order (Yoram, 2026-11-05). Timeline, Map and From the
	// internet are added when their slices ship.
	navigation: [
		{ href: "/about", label: "סיפור חיים" },
		{ href: "/search", label: "חיפוש" },
	],
	// Shown only to signed-in active members; the page keeps its own checks.
	memberNavigation: { href: "/family", label: "ארכיון" },
	// Pending Yoram's approval (public search, slice 1).
	searchPage: {
		title: "חיפוש",
		label: "מה לחפש",
		submit: "חיפוש",
		noResults: "לא נמצאו פריטים.",
	},
```

Remove every other use of `copy.achievements` (only `src/app/achievements/page.tsx`, deleted below).

- [ ] **Step 2: Update the browser tests first (they will fail).**

`tests/fixtures/he-interface.json`: remove `"achievements"` and add `"search": "חיפוש"`.

`tests/e2e/editorial.spec.ts`: replace every `` `/archive/${id}` `` with `` `/items/${id}` ``, and in the publish test replace the final block

```ts
	await page.goto("/archive");
	await expect(
		page.getByRole("link", { name: "Synthetic second" }),
	).toBeVisible();
```

with

```ts
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
```

Add, after that test:

```ts
test("the old public archive and achievements pages are gone", async ({ page }) => {
	for (const path of ["/archive", "/archive/anything", "/achievements"]) {
		const response = await page.goto(path);
		expect(response?.status(), path).toBe(404);
		await expect(page.getByRole("heading", { name: copy.notFound })).toBeVisible();
	}
});
```

`tests/e2e/sign-in.spec.ts`, test "public foundation has Hebrew RTL root…": replace the click on the Archive link and its two assertions with

```ts
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
```

Test "shows Hebrew interface copy and Achievements with a plain sign-in label": rename to "shows Hebrew interface copy, the visitor tabs and a plain sign-in label"; in the path list replace `["/achievements", expected.achievements]` and `["/archive", expected.archive]` with `["/search", expected.search]`; replace the achievements-link assertion with

```ts
		await expect(
			page.getByRole("navigation", { name: expected.navigation })
				.getByRole("link", { name: expected.search, exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: expected.archive, exact: true }),
		).toHaveCount(0);
```

Run: `npm run test:e2e -- tests/e2e/editorial.spec.ts tests/e2e/sign-in.spec.ts` → expected FAIL (routes not yet there).

- [ ] **Step 3: Item page.** `git mv src/app/archive/[id]/page.tsx src/app/items/[id]/page.tsx`, then rename the component `ArchiveItem` → `PublicItem`. Content otherwise unchanged.

- [ ] **Step 4: Search page.** Create `src/app/search/page.tsx`:

```tsx
import Link from "next/link";
import { formatDate } from "@/lib/format-date";
import { copy } from "@/locales/he";
import { archiveReader } from "@/services/editorial-runtime";

export const dynamic = "force-dynamic";

// Public search over published items only (spec 2026-11-05). A GET form keeps
// every search a shareable address.
export default async function Search({
	searchParams,
}: {
	searchParams: Promise<{ q?: string | string[] }>;
}) {
	const { q } = await searchParams;
	const text = (Array.isArray(q) ? q[0] : q) ?? "";
	const reader = archiveReader();
	const items = await reader.searchPublicItems(text);
	const anyPublished = text.trim() === "" ? items.length > 0 : (await reader.listPublicItems()).length > 0;
	return (
		<>
			<h1>{copy.searchPage.title}</h1>
			<form action="/search" method="get" role="search">
				<label htmlFor="q">{copy.searchPage.label}</label>{" "}
				<input id="q" name="q" type="search" defaultValue={text} maxLength={200} />{" "}
				<button type="submit">{copy.searchPage.submit}</button>
			</form>
			{!anyPublished ? (
				<p>{copy.empty}</p>
			) : items.length === 0 ? (
				<p>{copy.searchPage.noResults}</p>
			) : (
				<ul>
					{items.map((item) => (
						<li key={item.id}>
							<Link href={`/items/${item.id}`}>{item.title}</Link> ·{" "}
							{formatDate(item.date)} ·{" "}
							{item.types.map((type) => copy.items.typeNames[type]).join(", ")}
						</li>
					))}
				</ul>
			)}
		</>
	);
}
```

- [ ] **Step 5: Remove old routes and fix revalidation.** `git rm src/app/archive/page.tsx src/app/achievements/page.tsx` (the `[id]` page was moved in Step 3). In `src/app/family/items/actions.ts` replace

```ts
		revalidatePath("/archive");
		revalidatePath(`/archive/${id}`);
```

with

```ts
		revalidatePath("/search");
		revalidatePath(`/items/${id}`);
```

Then `grep -rn "/archive\|achievements" src tests` must show no route references (the words `archived`/`archive` in family copy and actions are fine).

- [ ] **Step 6: Run checks**

Run: `npm run lint && npm run typecheck && npm run test:e2e -- tests/e2e/editorial.spec.ts tests/e2e/sign-in.spec.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src/app src/locales/he.ts tests/e2e tests/fixtures
git commit -m "feat: public search and item pages replace the public archive; drop achievements"
```

(Check `git status` first: `next-env.d.ts` must not be staged.)

---

### Task 4: Member-only Archive tab

**Files:**
- Modify: `src/services/access.ts`, `src/app/layout.tsx`
- Create: `src/components/site-nav.tsx`
- Test: `tests/e2e/editorial.spec.ts` (append)

**Interfaces:**
- Consumes: `copy.navigation`, `copy.memberNavigation`, `copy.navigationLabel` (Task 3); `requireMember` (`src/services/access.ts`); `logoutPending` (`src/app/family/access.ts`).
- Produces: `isMemberForNavigation(): Promise<boolean>`; `<SiteNav />` server component.

- [ ] **Step 1: Write the failing browser test** (append to `tests/e2e/editorial.spec.ts`; `signIn` and `copy` already exist there):

```ts
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
```

Run: `npm run test:e2e -- tests/e2e/editorial.spec.ts -g "Archive tab"` → FAIL (no Archive link after sign-in).

- [ ] **Step 2: Membership check for the header.** Append to `src/services/access.ts`:

```ts
import { unstable_rethrow } from "next/navigation";

// Header only: decides whether to show the Archive tab. Not an authorization
// check; every family page and action calls requireMember itself. Any failure
// (no session, revoked, database down) shows the visitor tabs.
export async function isMemberForNavigation() {
	try {
		await requireMember();
		return true;
	} catch (error) {
		// Let Next's own control-flow errors (e.g. dynamic-rendering bailout) through.
		unstable_rethrow(error);
		return false;
	}
}
```

(Put the import with the other imports at the top of the file.)

- [ ] **Step 3: Navigation component.** Create `src/components/site-nav.tsx`:

```tsx
import Link from "next/link";
import { logoutPending } from "@/app/family/access";
import { copy } from "@/locales/he";
import { isMemberForNavigation } from "@/services/access";

export async function SiteNav() {
	const member = !(await logoutPending()) && (await isMemberForNavigation());
	const links = member ? [...copy.navigation, copy.memberNavigation] : copy.navigation;
	return (
		<nav aria-label={copy.navigationLabel}>
			{links.map((item) => (
				<Link key={item.href} href={item.href}>
					{item.label}
				</Link>
			))}
		</nav>
	);
}
```

- [ ] **Step 4: Layout.** In `src/app/layout.tsx` replace the `<nav aria-label={copy.navigationLabel}>…</nav>` block with `<SiteNav />` and add `import { SiteNav } from "@/components/site-nav";`. The home page's section links (`src/app/page.tsx`) keep using `copy.navigation` and so never show Archive.

- [ ] **Step 5: Run checks**

Run: `npm run lint && npm run typecheck && npm run test:e2e` → all browser tests pass. Then `npm run build` → succeeds (the layout now reads cookies and headers, so every page renders per request; that is intended — `Cache-Control: private, no-store` is already set for all paths in `next.config.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/services/access.ts src/components/site-nav.tsx src/app/layout.tsx tests/e2e/editorial.spec.ts
git commit -m "feat: Archive tab for signed-in family members only"
```

---

### Task 5: Full check and docs

**Files:**
- Modify: `docs/DEVELOPMENT.md`, `docs/superpowers/specs/2026-11-05-public-navigation-search-design.md`

- [ ] **Step 1: Full check.** Run `npm run check` with the test database. Record the unit, integration and browser test counts from the output.

- [ ] **Step 2: DEVELOPMENT.md.** In "Current slice", replace "Home, About Yaki and Achievements;\nthe published-item Archive pages;" with "Home and Life story (About);\npublic search and published-item pages;", and "Home, About and Achievements are honest empty shells; `/archive` and\n`/archive/[id]` show published items." with "Home and Life story are honest empty shells; `/search` and\n`/items/[id]` show published items only.". Append a paragraph after the item-editing paragraph:

```markdown
Public navigation and search (2026-11-05, phase 2 slice 1): visitors see Life
story and Search; signed-in members also see Archive, which opens `/family`.
Achievements and the public `/archive` were removed. `/search` matches the
published revision's text, tags, non-family-only people, places and years
(`src/services/search.ts`). The `searchPage` strings await Yoram's approval.
Checks at this slice: <N> unit, <N> integration and <N> browser tests, lint,
typecheck and the webpack build pass.
```

Fill in the counts from Step 1 (real numbers only).

- [ ] **Step 3: Spec status.** Under the spec's `**Status:**` line add `**Implemented:** 2026-11-05 on \`feat/public-search\`.`

- [ ] **Step 4: Commit**

```bash
git add docs/DEVELOPMENT.md docs/superpowers/specs/2026-11-05-public-navigation-search-design.md
git commit -m "docs: record public navigation and search"
```
