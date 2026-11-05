# Private Media Storage and Collection Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The family sees and reviews the existing collection inside the site, and public internet material appears as public link cards.

**Architecture:** Additive Prisma models hold files, sources and a verbatim catalog record per item. Operator scripts on Yoram's Mac read a dated catalog export and Drive, and write to PostgreSQL and a private R2 bucket; nothing bulk runs on Vercel. A single access-checked route streams files.

**Tech Stack:** Next.js 16 App Router, Prisma 7, PostgreSQL, Vitest, Playwright; new: `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, and script-only `csv-parse`, `sharp`, `google-auth-library`.

**Spec:** [2026-11-05-media-import-design.md](../specs/2026-11-05-media-import-design.md).

## Global Constraints

- Every imported family record is private; only explicitly identified internet records publish, and only on first creation. A rerun never republishes or overwrites website edits.
- Summaries, notes, catalog rows and saved internet copies never reach a public query.
- This repository is public: no real names, filenames, URLs, Drive ids or catalog exports in Git, tests or logs. Use synthetic fixtures. Reports go outside the repository.
- Catalog column names and enumerations are source values and may appear in `src/import/catalog-columns.ts` in Hebrew. All other code, comments and docs are English.
- New Hebrew interface strings live in `src/locales/he.ts`, marked `// Pending Yoram's approval`, and need approval before release.
- Pin exact dependency versions, as `package.json` already does.
- Every real-data run needs Yoram's explicit go. Agents do not provision services, change Vercel, push to `dev`/`main`, or touch `.env*` files (the command guard blocks it); give Yoram the exact commands.
- Do not stage `next-env.d.ts`. In Bash avoid `$VAR` expansion, computed program names and inline `node -e`.
- Before writing a route or page, read the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md).
- Test commands need the isolated database: `npm run db:test:up`, then prefix commands with `TEST_DATABASE_URL='postgresql://kobob_test:synthetic-local-test-only@127.0.0.1:55439/kobob_test'`, after `npm run db:test:migrate`.

## Prerequisite

`dev` must be recreated from the v0.4.0 commit `fe7cc03` first (Yoram's command, OPERATIONS.md). It was still at `1c545a5` when this plan was written. Confirm with `git ls-remote origin refs/heads/dev`. Branch each stage from `origin/dev`, and PR with `gh pr create --base dev`.

## Deviations from the spec

The spec was updated to match these on approval (2026-11-05):

- **BMP:** `sharp` has no BMP input, so the 2 BMP files stay download-only instead of getting a display copy.
- **Rights and review actions ship in stage 1,** not stage 4. The rights rule would otherwise stop the family publishing anything after the stage 1 release.
- **The viewer ships in stage 4,** not stage 2. Stage 2 measures through direct `/api/media/<id>` links, so nothing is shown before files exist.
- **Lock files are confirmed by name, size and an owner-name length byte,** not by size alone.
- **Withdrawing rights unpublishes (added after stage 1 was built, Yoram, 2026-11-05):** withdrawing rights on a public family item makes it private in the same transaction, with a warning beside the button beforehand and a confirmation afterwards. Internet and private items are unaffected, and a legacy public item with unknown rights stays public until its rights change.
- **The copy holds one file in memory at a time** rather than streaming. The largest file is about 220 MB, it runs on Yoram's Mac, and it keeps verification simple. Size and hash are still checked before and after upload.

## File map

| File | Responsibility |
|---|---|
| `prisma/schema.prisma`, new migration | Models and enums |
| `src/services/editorial.ts` | Rights rule, status changes, paged list, richer `getItem` |
| `src/services/archive.ts`, `src/app/items/[id]/page.tsx` | Public source fields and card |
| `src/lib/source-url.ts` | Accept only `http`/`https` source links |
| `src/import/catalog-columns.ts` | Catalog headers and value mappings |
| `src/import/system-files.ts` | Detect and confirm system files |
| `src/import/catalog-plan.ts` | Pure: rows to planned records |
| `src/import/apply-catalog.ts` | Idempotent database writes and report counts |
| `src/import/drive.ts` | Read-only Drive client |
| `src/import/file-formats.ts` | Sniff types; which formats are inline or derivable |
| `src/import/derive.ts` | Thumbnail and display copies with `sharp` |
| `src/import/copy-media.ts` | Copy, verify and derive one file |
| `src/lib/config.ts`, `src/lib/storage.ts` | R2 settings and client |
| `src/lib/byte-range.ts` | Parse and cap `Range` headers |
| `src/services/media.ts`, `src/services/media-runtime.ts`, `src/app/api/media/[id]/route.ts` | Access-checked delivery |
| `scripts/import-catalog.ts`, `scripts/import-media.ts`, `scripts/media-measure.ts` | Operator commands |
| `src/components/item-status-actions.tsx`, `src/components/item-media.tsx`, `src/components/item-catalog.tsx` | Family item page parts |

---

# Stage 1: schema, rights rule, public cards, catalog import

Branch: `feat/catalog-import`.

### Task 1: Data model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_media_import/migration.sql` (generated)
- Test: `tests/integration/database.test.ts`

**Interfaces:**
- Produces: `Item.origin`, `Item.rightsStatus`, `Item.reviewStatus`, models `ExternalSource`, `MediaFile`, `ItemCatalogRecord`, `ImportRun`.

- [ ] **Step 1: Write the failing test.** Append to `tests/integration/database.test.ts`, using the file's existing `db`:

```ts
it("defaults new items to family origin, unknown rights and already reviewed", async () => {
	const item = await db.item.create({ data: {} });
	expect(item.origin).toBe("family");
	expect(item.rightsStatus).toBe("unknown");
	expect(item.reviewStatus).toBe("reviewed");
	await db.item.delete({ where: { id: item.id } });
});

it("removes files, sources and catalog records with their item", async () => {
	const item = await db.item.create({ data: {} });
	await db.mediaFile.create({
		data: {
			itemId: item.id,
			role: "original",
			storageKey: `originals/${item.id}`,
			mimeType: "image/jpeg",
			sizeBytes: 10n,
			originalFilename: "synthetic.jpg",
		},
	});
	await db.externalSource.create({ data: { itemId: item.id, url: "https://example.test/a" } });
	await db.itemCatalogRecord.create({
		data: { itemId: item.id, tab: "catalog", row: { a: "b" }, snapshotHash: "x" },
	});
	await db.item.delete({ where: { id: item.id } });
	expect(await db.mediaFile.count({ where: { itemId: item.id } })).toBe(0);
	expect(await db.externalSource.count({ where: { itemId: item.id } })).toBe(0);
	expect(await db.itemCatalogRecord.count({ where: { itemId: item.id } })).toBe(0);
});
```

- [ ] **Step 2: Run it.** `TEST_DATABASE_URL='...' npx vitest run tests/integration/database.test.ts`. Expected: FAIL, the fields and models do not exist (also a type error at `db.mediaFile`).

- [ ] **Step 3: Edit the schema.** Add after `enum DatePrecision`:

```prisma
enum ItemOrigin {
  family
  internet
}
enum RightsStatus {
  unknown
  needs_clarification
  cleared
}
enum ReviewStatus {
  needs_review
  reviewed
}
enum MediaRole {
  original
  thumbnail
  display
}
enum MediaStatus {
  pending
  verified
  failed
}
```

Add to `model Item`, after `publishedAt`:

```prisma
  origin              ItemOrigin     @default(family)
  rightsStatus        RightsStatus   @default(unknown)
  reviewStatus        ReviewStatus   @default(reviewed)
```

and after `revisions`:

```prisma
  sources             ExternalSource[]
  files               MediaFile[]
  catalogRecord       ItemCatalogRecord?
```

and add `@@index([state, reviewStatus])` beside the existing index. Add at the end of the file:

```prisma
// Public on published items: select only through archive.ts.
model ExternalSource {
  id            String  @id @default(cuid())
  itemId        String
  item          Item    @relation(fields: [itemId], references: [id], onDelete: Cascade)
  url           String
  publisher     String  @default("")
  author        String  @default("")
  publishedText String  @default("")
  license       String  @default("")
  @@index([itemId])
}
// Family-only. storageKey is opaque and never reaches a browser.
model MediaFile {
  id               String      @id @default(cuid())
  itemId           String
  item             Item        @relation(fields: [itemId], references: [id], onDelete: Cascade)
  role             MediaRole
  storageKey       String      @unique
  mimeType         String
  sizeBytes        BigInt
  sha256           String?
  width            Int?
  height           Int?
  status           MediaStatus @default(pending)
  failureCode      String?
  originalFilename String
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
  @@unique([itemId, role])
  @@index([status])
}
// Family-only: the verbatim source row. Never select from a public reader.
model ItemCatalogRecord {
  id           String   @id @default(cuid())
  itemId       String   @unique
  item         Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  tab          String
  row          Json
  snapshotHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
// Counts only. Row detail stays in the private report outside Git.
model ImportRun {
  id           String    @id @default(cuid())
  kind         String
  snapshotHash String
  counts       Json
  startedAt    DateTime  @default(now())
  finishedAt   DateTime?
}
```

- [ ] **Step 4: Generate the migration against the local development database,** never the test or production one:

Run: `DATABASE_URL='postgresql://kobob_dev:synthetic-local-dev-only@127.0.0.1:55440/kobob_dev' npx prisma migrate dev --name media_import`
Expected: one new migration containing only `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE "Item" ADD COLUMN` with defaults, and foreign keys on the new tables. Read the SQL; anything else is a stop.

- [ ] **Step 5: Run the test.** `npm run db:test:migrate`, then the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit.** `git add prisma tests/integration/database.test.ts`, `git commit -m "feat: add media, source and catalog record models"`.

### Task 2: Rights rule and status actions

**Files:**
- Modify: `src/services/editorial.ts`, `src/app/family/items/actions.ts`, `src/components/item-actions.tsx`, `src/app/family/items/[id]/edit/page.tsx`, `src/locales/he.ts`
- Create: `src/components/item-status-actions.tsx`
- Test: `tests/integration/editorial.test.ts`, `tests/integration/archive.test.ts`, `tests/e2e/editorial.spec.ts`

**Interfaces:**
- Produces: `editorialService().setRightsStatus(id, expectedVersion, status): Promise<{id, version}>`, `setReviewStatus(id, expectedVersion, status)`; `transitionItem` throws `Error("RIGHTS_NOT_CLEARED")`; `FamilyItem` gains `origin`, `rightsStatus`, `reviewStatus`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/integration/editorial.test.ts`, using its `member`/service helpers:

```ts
it("refuses to publish a family item until rights are cleared", async () => {
	const service = await serviceFor("a@example.test");
	const { id } = await rawCreate(service);
	await expect(service.transitionItem(id, 1, "publish")).rejects.toThrow("RIGHTS_NOT_CLEARED");
	expect((await db.item.findUniqueOrThrow({ where: { id } })).visibility).toBe("private");
	const { version } = await service.setRightsStatus(id, 1, "cleared");
	await service.transitionItem(id, version, "publish");
	expect((await db.item.findUniqueOrThrow({ where: { id } })).visibility).toBe("public");
});

it("blocks republishing after rights are withdrawn but keeps the public version", async () => {
	const service = await serviceFor("b@example.test");
	const { id } = await rawCreate(service);
	const cleared = await service.setRightsStatus(id, 1, "cleared");
	const published = await service.transitionItem(id, cleared.version, "publish");
	const withdrawn = await service.setRightsStatus(id, published.version, "needs_clarification");
	const edited = await service.updateItem(id, withdrawn.version, input("Edited"));
	await expect(service.transitionItem(id, edited.version, "publish")).rejects.toThrow("RIGHTS_NOT_CLEARED");
	expect((await db.item.findUniqueOrThrow({ where: { id } })).visibility).toBe("public");
});

it("lets internet items publish without cleared rights", async () => {
	const service = await serviceFor("c@example.test");
	const { id } = await rawCreate(service);
	await db.item.update({ where: { id }, data: { origin: "internet" } });
	await service.transitionItem(id, 1, "publish");
	expect((await db.item.findUniqueOrThrow({ where: { id } })).visibility).toBe("public");
});

it("rejects status changes on a stale version or an archived item", async () => {
	const service = await serviceFor("d@example.test");
	const { id } = await rawCreate(service);
	await expect(service.setRightsStatus(id, 9, "cleared")).rejects.toThrow("CONFLICT");
	await service.transitionItem(id, 1, "archive");
	await expect(service.setReviewStatus(id, 2, "reviewed")).rejects.toThrow("CONFLICT");
});

it("audits status changes with ids and action names only", async () => {
	const service = await serviceFor("e@example.test");
	const { id } = await rawCreate(service);
	await service.setRightsStatus(id, 1, "cleared");
	const rows = await db.editorialAudit.findMany({ where: { targetId: id } });
	expect(rows.map((row) => row.action)).toContain("rights-cleared");
});
```

Replace the file's existing `member` helper with these. Existing tests keep calling `member` and keep their meaning, because it clears rights on creation without bumping the version, so their hard-coded versions stay correct. New rights tests use `serviceFor`, which does not clear anything:

```ts
async function serviceFor(email: string) {
	const user = await db.user.create({
		data: { email, emailVerified: true },
	});
	return createEditorialService(db, async () => ({
		id: user.id,
		role: "member",
		accessVersion: user.accessVersion,
	}));
}
const rawCreate = (service: Awaited<ReturnType<typeof serviceFor>>) =>
	service.createItem(input());
async function member(email: string) {
	const service = await serviceFor(email);
	return {
		...service,
		createItem: async (value: ItemInput) => {
			const created = await service.createItem(value);
			await db.item.update({
				where: { id: created.id },
				data: { rightsStatus: "cleared" },
			});
			return created;
		},
	};
}
```

- [ ] **Step 2: Run them.** `TEST_DATABASE_URL='...' npx vitest run tests/integration/editorial.test.ts`. Expected: the new tests FAIL (`setRightsStatus` does not exist).

- [ ] **Step 3: Implement in `src/services/editorial.ts`.** Add the two fields to `ItemRow` and these exports:

```ts
type RightsValue = "unknown" | "needs_clarification" | "cleared";
type ReviewValue = "needs_review" | "reviewed";
```

Add to `ItemRow`: `origin: "family" | "internet"; rightsStatus: RightsValue;`. In `FamilyItem` add `origin`, `rightsStatus: RightsValue`, `reviewStatus: ReviewValue`, and return them from `getItem`. In `transition`, replace the publish branch:

```ts
	if (action === "publish") {
		if (item.visibility !== "private" && !unpublishedEdits(item)) return null;
		// Internet items are already public at their source (Yoram, 2026-11-05).
		if (item.origin === "family" && item.rightsStatus !== "cleared")
			throw new Error("RIGHTS_NOT_CLEARED");
		return {
			visibility: "public",
			publishedRevisionId: item.workingRevisionId,
			publishedAt: new Date(),
		};
	}
```

Add to the returned service:

```ts
		setRightsStatus: (id: string, expectedVersion: number, status: RightsValue) =>
			run(async (tx, actor) => {
				await claim(tx, id, expectedVersion, (item) =>
					item.state === "active" ? { rightsStatus: status } : null,
				);
				await audit(tx, actor.id, "item", id, `rights-${status}`);
				return { id, version: expectedVersion + 1 };
			}),
		setReviewStatus: (id: string, expectedVersion: number, status: ReviewValue) =>
			run(async (tx, actor) => {
				await claim(tx, id, expectedVersion, (item) =>
					item.state === "active" ? { reviewStatus: status } : null,
				);
				await audit(tx, actor.id, "item", id, `review-${status}`);
				return { id, version: expectedVersion + 1 };
			}),
```

- [ ] **Step 4: Run them.** Same command. Expected: PASS.

- [ ] **Step 5: Keep `archive.test.ts` green.** In `editor()`, wrap creation so these tests still publish:

```ts
	const service = createEditorialService(db, async () => ({
		id: user.id,
		role: "member",
		accessVersion: user.accessVersion,
	}));
	return {
		...service,
		createItem: async (value: ItemInput) => {
			const created = await service.createItem(value);
			await db.item.update({ where: { id: created.id }, data: { rightsStatus: "cleared" } });
			return created;
		},
	};
```

Run: `TEST_DATABASE_URL='...' npx vitest run tests/integration/archive.test.ts`. Expected: PASS.

- [ ] **Step 6: Add the Hebrew strings** to `items` in `src/locales/he.ts`:

```ts
		// Pending Yoram's approval (media import, stage 1).
		rights: "זכויות",
		rightsNames: { unknown: "לא ידוע", needs_clarification: "נדרש בירור", cleared: "אושרו" },
		markRightsCleared: "סימון שהזכויות אושרו",
		undoRightsCleared: "ביטול אישור הזכויות",
		rightsNotCleared: "אי אפשר לפרסם לפני אישור הזכויות.",
		reviewNames: { needs_review: "נדרשת בדיקה", reviewed: "נבדק" },
		markReviewed: "סימון כנבדק",
		markNeedsReview: "החזרה לבדיקה",
		sourceLink: "למקור",
		publisher: "מפרסם",
		author: "יוצר",
		license: "רישיון",
```

- [ ] **Step 7: Add the server action** to `src/app/family/items/actions.ts`, and add `"rights"` to `ItemFormState["status"]`:

```ts
const rightsValues = ["unknown", "needs_clarification", "cleared"] as const;
const reviewValues = ["needs_review", "reviewed"] as const;

export async function changeItemStatus(
	_previous: ItemFormState,
	data: FormData,
): Promise<ItemFormState> {
	const id = String(data.get("id") ?? "");
	const expected = Number(data.get("version"));
	const rights = rightsValues.find((value) => value === data.get("rights"));
	const review = reviewValues.find((value) => value === data.get("review"));
	if (!rights && !review) return { status: "failed" };
	try {
		const service = editorialService();
		const { version } = rights
			? await service.setRightsStatus(id, expected, rights)
			: await service.setReviewStatus(id, expected, review as (typeof reviewValues)[number]);
		revalidatePath("/family");
		revalidatePath(`/family/items/${id}/edit`);
		return { status: "saved", version };
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		if (error instanceof Error && error.message === "CONFLICT") {
			revalidatePath(`/family/items/${id}/edit`);
			return { status: "conflict" };
		}
		return { status: "failed" };
	}
}
```

In `changeItemState`, before the final `return { status: "failed" }` in its catch, add:

```ts
		if (error instanceof Error && error.message === "RIGHTS_NOT_CLEARED")
			return { status: "rights" };
```

and in `src/components/item-actions.tsx` add inside `role="status"`:

```tsx
{state.status === "rights" && copy.items.rightsNotCleared}
```

- [ ] **Step 8: Create `src/components/item-status-actions.tsx`:**

```tsx
"use client";
import { useActionState } from "react";
import { changeItemStatus, type ItemFormState } from "@/app/family/items/actions";
import type { FamilyItem } from "@/services/editorial";
import { copy } from "@/locales/he";
import { useClientReady } from "./use-client-ready";

// Rights and review status are family decisions; the server enforces them.
export function ItemStatusActions({ item }: { item: FamilyItem }) {
	const [state, submit, pending] = useActionState(changeItemStatus, {
		status: "idle",
	} as ItemFormState);
	const ready = useClientReady();
	const cleared = item.rightsStatus === "cleared";
	const reviewed = item.reviewStatus === "reviewed";
	const button = (name: "rights" | "review", value: string, label: string) => (
		<form action={submit}>
			<input type="hidden" name="id" value={item.id} />
			<input type="hidden" name="version" value={item.version} />
			<input type="hidden" name={name} value={value} />
			<button type="submit" disabled={!ready || pending}>
				{label}
			</button>
		</form>
	);
	return (
		<div>
			<p>
				{copy.items.rights}: {copy.items.rightsNames[item.rightsStatus]} ·{" "}
				{copy.items.reviewNames[item.reviewStatus]}
			</p>
			{item.origin === "family" &&
				(cleared
					? button("rights", "needs_clarification", copy.items.undoRightsCleared)
					: button("rights", "cleared", copy.items.markRightsCleared))}
			{reviewed
				? button("review", "needs_review", copy.items.markNeedsReview)
				: button("review", "reviewed", copy.items.markReviewed)}
			<p role="status">
				{state.status === "conflict" && copy.items.conflict}
				{state.status === "failed" && copy.items.failed}
			</p>
		</div>
	);
}
```

In the edit page, render `{item.state === "active" && <ItemStatusActions item={item} />}` directly above `<ItemActions item={item} />`.

- [ ] **Step 9: Update browser tests.** In `tests/e2e/editorial.spec.ts`, inside `createItem`, before its `return`, clear rights so existing flows keep their meaning:

```ts
	const id = page.url().split("/").at(-2) as string;
	await db.item.update({ where: { id }, data: { rightsStatus: "cleared" } });
	return id;
```

Add a new test that does not use that helper's clearing, by setting rights back:

```ts
test("explains that publishing needs cleared rights, then allows it", async ({ page }) => {
	await signIn(page, "rights@example.test");
	const id = await createItem(page, "Synthetic rights item");
	await db.item.update({ where: { id }, data: { rightsStatus: "unknown" } });
	await page.reload();
	await page.getByRole("button", { name: copy.items.publish }).click();
	await expect(page.getByText(copy.items.rightsNotCleared)).toBeVisible();
	await page.getByRole("button", { name: copy.items.markRightsCleared }).click();
	await expect(page.getByRole("button", { name: copy.items.undoRightsCleared })).toBeVisible();
	await page.getByRole("button", { name: copy.items.publish }).click();
	await expect(page.getByText(copy.items.public).first()).toBeVisible();
});
```

Run: `TEST_DATABASE_URL='...' npm run test:e2e -- tests/e2e/editorial.spec.ts`. Expected: PASS.

- [ ] **Step 10: Commit.** `git add` the listed files, then `git commit -m "feat: require cleared rights before publishing family items"`.

### Task 3: Public link cards

**Files:**
- Create: `src/lib/source-url.ts`, `tests/unit/source-url.test.ts`
- Modify: `src/services/archive.ts`, `src/app/items/[id]/page.tsx`
- Test: `tests/integration/archive.test.ts`

**Interfaces:**
- Produces: `isSafeSourceUrl(value: string): boolean`; `getPublicItem` returns `sources: PublicSource[]`; `type PublicSource = { url: string; publisher: string; author: string; publishedText: string; license: string }`.

- [ ] **Step 1: Write the failing tests.** `tests/unit/source-url.test.ts`:

```ts
import { expect, it } from "vitest";
import { isSafeSourceUrl } from "../../src/lib/source-url";

it.each(["https://example.test/a", "http://example.test/%D7%90"])("accepts %s", (url) => {
	expect(isSafeSourceUrl(url)).toBe(true);
});
it.each(["javascript:alert(1)", "data:text/html,x", "file:///a", "ftp://example.test", "", "not a url", "https://user:pass@example.test"])(
	"rejects %s",
	(url) => {
		expect(isSafeSourceUrl(url)).toBe(false);
	},
);
```

Append to `tests/integration/archive.test.ts`:

```ts
async function card(title: string, overrides: { summaryInRow?: string } = {}) {
	const item = await db.item.create({ data: { origin: "internet", visibility: "public", kobId: `KOB-${title}` } });
	const revision = await db.itemRevision.create({
		data: { itemId: item.id, title, types: ["other"], authorId: "system:import" },
	});
	await db.item.update({
		where: { id: item.id },
		data: { workingRevisionId: revision.id, publishedRevisionId: revision.id, publishedAt: new Date() },
	});
	await db.externalSource.create({
		data: { itemId: item.id, url: "https://example.test/a", publisher: "Synthetic Press", author: "Synthetic Writer" },
	});
	await db.itemCatalogRecord.create({
		data: { itemId: item.id, tab: "web", row: { summary: overrides.summaryInRow ?? "PRIVATE-SUMMARY" }, snapshotHash: "x" },
	});
	await db.mediaFile.create({
		data: {
			itemId: item.id, role: "original", storageKey: `originals/${item.id}`,
			mimeType: "image/jpeg", sizeBytes: 1n, originalFilename: "PRIVATE-NAME.jpg", status: "verified",
		},
	});
	return item.id;
}

it("shows a public card's source fields and nothing from its catalog record or file", async () => {
	const id = await card("Public card");
	const item = await reader.getPublicItem(id);
	expect(item?.sources).toEqual([
		{ url: "https://example.test/a", publisher: "Synthetic Press", author: "Synthetic Writer", publishedText: "", license: "" },
	]);
	const serialized = JSON.stringify(item);
	expect(serialized).not.toContain("PRIVATE-SUMMARY");
	expect(serialized).not.toContain("PRIVATE-NAME");
	expect(serialized).not.toContain("originals/");
});

it("finds a card by publisher and removes it from search when made private", async () => {
	const id = await card("Card to hide");
	expect((await reader.searchPublicItems("Synthetic Press")).map((row) => row.id)).toContain(id);
	await db.item.update({ where: { id }, data: { visibility: "private", publishedRevisionId: null } });
	expect(await reader.searchPublicItems("Synthetic Press")).toEqual([]);
	expect(await reader.getPublicItem(id)).toBeNull();
});
```

- [ ] **Step 2: Run them.** `TEST_DATABASE_URL='...' npx vitest run tests/unit/source-url.test.ts tests/integration/archive.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** `src/lib/source-url.ts`:

```ts
// External links come from the catalog; only plain web links may be rendered.
export function isSafeSourceUrl(value: string): boolean {
	if (!URL.canParse(value)) return false;
	const url = new URL(value);
	return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}
```

In `src/services/archive.ts`:

```ts
export type PublicSource = {
	url: string;
	publisher: string;
	author: string;
	publishedText: string;
	license: string;
};
// An explicit field list: anything else on an item's relations stays family-only.
const publicSources = {
	select: { url: true, publisher: true, author: true, publishedText: true, license: true },
	orderBy: { id: "asc" },
} as const;
```

Add `sources: publicSources` to both `include` objects. In `searchPublicItems`, add to `texts`: `...item.sources.flatMap((source) => [source.publisher, source.author])`. Change `getPublicItem`'s return type to `(RevisionView & { id: string; sources: PublicSource[] }) | null`, and return `{ id: item.id, sources: item.sources, ...toRevisionView(...) }`.

In `src/app/items/[id]/page.tsx`, add `import { isSafeSourceUrl } from "@/lib/source-url";` and before `</article>`:

```tsx
			{item.sources.filter((source) => isSafeSourceUrl(source.url)).map((source) => (
				<p key={source.url}>
					{source.publisher && `${copy.items.publisher}: ${source.publisher} · `}
					{source.author && `${copy.items.author}: ${source.author} · `}
					{source.publishedText && `${source.publishedText} · `}
					{source.license && `${copy.items.license}: ${source.license} · `}
					<a href={source.url} rel="noopener noreferrer" target="_blank">
						{copy.items.sourceLink}
					</a>
				</p>
			))}
```

- [ ] **Step 4: Run them.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "feat: show source links on public items"`, with the listed files staged.

### Task 4: Catalog planning (pure)

**Files:**
- Create: `src/import/catalog-columns.ts`, `src/import/system-files.ts`, `src/import/catalog-plan.ts`
- Test: `tests/unit/catalog-plan.test.ts`, `tests/unit/system-files.test.ts`

**Interfaces:**
- Produces:
  - `isSystemFileName(name: string): boolean`; `confirmSystemFile(name: string, sizeBytes: bigint, head: Uint8Array): boolean`
  - `planCatalog(catalogRows: CatalogRow[], webRows: CatalogRow[]): { records: PlannedRecord[]; errors: PlanError[] }`
  - `type CatalogRow = Record<string, string>`
  - `type PlanError = { kobId: string; code: string }`
  - `type PlannedRecord = { kobId; origin: "family" | "internet"; title; types: ItemTypeValue[]; rightsStatus: "unknown" | "needs_clarification"; publish: boolean; source: { url; publisher; author; publishedText; license } | null; file: { driveFileId; sizeBytes: bigint; mimeType; originalFilename; sha256: string | null } | null; systemCandidate: boolean; tab: "catalog"; row: { catalog: CatalogRow; web: CatalogRow | null } }`

- [ ] **Step 1: Write the failing tests.** `tests/unit/system-files.test.ts`:

```ts
import { expect, it } from "vitest";
import { confirmSystemFile, isSystemFileName } from "../../src/import/system-files";

const appleDouble = Uint8Array.from([0x00, 0x05, 0x16, 0x07, 0, 2, 0, 0]);
const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

it("recognizes candidate names", () => {
	expect(isSystemFileName("._photo.jpg")).toBe(true);
	expect(isSystemFileName("Thumbs.db")).toBe(true);
	expect(isSystemFileName("thumbs.DB")).toBe(true);
	expect(isSystemFileName("~$letter.doc")).toBe(true);
	expect(isSystemFileName("photo.jpg")).toBe(false);
	expect(isSystemFileName("._")).toBe(false);
});
it("confirms only by content", () => {
	expect(confirmSystemFile("._photo.jpg", 4096n, appleDouble)).toBe(true);
	expect(confirmSystemFile("Thumbs.db", 20000n, ole)).toBe(true);
	expect(confirmSystemFile("~$letter.doc", 162n, jpeg)).toBe(true);
});
it("keeps a real file with a system-like name", () => {
	expect(confirmSystemFile("._photo.jpg", 500000n, jpeg)).toBe(false);
	expect(confirmSystemFile("Thumbs.db", 20000n, jpeg)).toBe(false);
	expect(confirmSystemFile("~$letter.doc", 900000n, jpeg)).toBe(false);
	expect(confirmSystemFile("photo.jpg", 4096n, appleDouble)).toBe(false);
});
```

`tests/unit/catalog-plan.test.ts`:

```ts
import { expect, it } from "vitest";
import { catalog as c, web as w } from "../../src/import/catalog-columns";
import { planCatalog } from "../../src/import/catalog-plan";

const family = (id: string, extra = {}) => ({
	[c.id]: id, [c.originalName]: "synthetic.jpg", [c.type]: "קובץ תמונה", [c.sourceKind]: "Drive",
	[c.driveId]: `drive-${id}`, [c.mime]: "image/jpeg", [c.size]: "1.5519895E7", [c.sha256]: "",
	[c.rights]: "לא ידוע", [c.reviewedDescription]: "PRIVATE-NOTE", ...extra,
});
const webCatalog = (id: string, extra = {}) => ({
	[c.id]: id, [c.originalName]: "page", [c.type]: "דף אינטרנט", [c.sourceKind]: "אינטרנט",
	[c.driveId]: "", [c.mime]: "text/html", [c.size]: "", [c.sha256]: "", [c.rights]: "לא ידוע", ...extra,
});
const webRow = (id: string, extra = {}) => ({
	[w.id]: id, [w.type]: "כתבה", [w.title]: "Synthetic title", [w.publisher]: "Press", [w.author]: "Writer",
	[w.publishedText]: "1979", [w.url]: "https://example.test/a", [w.identityBasis]: "שם מפורש והקשר ביוגרפי",
	[w.saved]: "קישור ותקציר בלבד", [w.licenseSource]: "", ...extra,
});

it("plans a private family record titled by its filename", () => {
	const { records, errors } = planCatalog([family("KOB-000001")], []);
	expect(errors).toEqual([]);
	expect(records[0]).toMatchObject({
		kobId: "KOB-000001", origin: "family", title: "synthetic.jpg", types: ["picture"], publish: false,
		source: null, systemCandidate: false, rightsStatus: "unknown",
	});
	expect(records[0].file?.sizeBytes).toBe(15519895n);
});

it("publishes an explicitly identified internet record as a link card", () => {
	const { records } = planCatalog([webCatalog("KOB-000002")], [webRow("KOB-000002")]);
	expect(records[0]).toMatchObject({
		origin: "internet", title: "Synthetic title", types: ["article"], publish: true,
		source: { url: "https://example.test/a", publisher: "Press", author: "Writer", publishedText: "1979", license: "" },
		file: null,
	});
});

it("holds a search-match internet record private", () => {
	const { records } = planCatalog(
		[webCatalog("KOB-000003")],
		[webRow("KOB-000003", { [w.identityBasis]: "התאמת שם והקשר מתוצאת חיפוש" })],
	);
	expect(records[0].publish).toBe(false);
});

it("keeps a saved internet copy as a file while still publishing the card", () => {
	const { records } = planCatalog(
		[webCatalog("KOB-000004", { [c.driveId]: "drive-4", [c.mime]: "image/jpeg", [c.size]: "10" })],
		[webRow("KOB-000004", { [w.saved]: "קובץ מקורי נשמר" })],
	);
	expect(records[0].publish).toBe(true);
	expect(records[0].file?.driveFileId).toBe("drive-4");
});

it("marks system-file candidates without deciding them", () => {
	const { records } = planCatalog([family("KOB-000005", { [c.originalName]: "._a.jpg" })], []);
	expect(records[0].systemCandidate).toBe(true);
});

it("never auto-clears rights, even with a documented license", () => {
	const { records } = planCatalog(
		[webCatalog("KOB-000006", { [c.rights]: "אישור מתועד — CC BY-SA 3.0" })],
		[webRow("KOB-000006")],
	);
	expect(records[0].rightsStatus).toBe("unknown");
	const { records: other } = planCatalog([family("KOB-000007", { [c.rights]: "נדרש בירור" })], []);
	expect(other[0].rightsStatus).toBe("needs_clarification");
});

it("reports invalid rows and continues", () => {
	const { records, errors } = planCatalog(
		[
			family("KOB-000008"), family("KOB-000008"), family("BAD"),
			family("KOB-000009", { [c.size]: "abc" }), family("KOB-000010", { [c.driveId]: "" }),
			family("KOB-000011", { [c.type]: "unmapped" }), family("KOB-000012", { [c.originalName]: "x".repeat(201) }),
			webCatalog("KOB-000013"), webCatalog("KOB-000014"),
		],
		[webRow("KOB-000014", { [w.url]: "javascript:alert(1)" })],
	);
	expect(records.map((record) => record.kobId)).toEqual(["KOB-000008"]);
	expect(errors).toEqual([
		{ kobId: "KOB-000008", code: "DUPLICATE_ID" },
		{ kobId: "BAD", code: "INVALID_ID" },
		{ kobId: "KOB-000009", code: "INVALID_SIZE" },
		{ kobId: "KOB-000010", code: "MISSING_DRIVE_ID" },
		{ kobId: "KOB-000011", code: "UNKNOWN_TYPE" },
		{ kobId: "KOB-000012", code: "TITLE_TOO_LONG" },
		{ kobId: "KOB-000013", code: "MISSING_WEB_ROW" },
		{ kobId: "KOB-000014", code: "UNSAFE_URL" },
	]);
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/unit/system-files.test.ts tests/unit/catalog-plan.test.ts`. Expected: FAIL, modules not found.

- [ ] **Step 3: Create `src/import/catalog-columns.ts`:**

```ts
import type { ItemTypeValue } from "../services/item-input";

// Exact headers and values of the private catalog export. These are source
// data, so they stay in their original Hebrew.
export const catalog = {
	id: "מזהה",
	originalName: "שם מקורי",
	type: "סוג",
	reviewedDescription: "תיאור בדוק",
	driveId: "מזהה Drive",
	mime: "MIME",
	size: "גודל בבתים",
	sha256: "SHA256",
	rights: "זכויות",
	sourceKind: "סוג מקור",
} as const;

export const web = {
	id: "מזהה בקטלוג",
	type: "סוג מקור",
	title: "כותרת",
	publisher: "מפרסם",
	author: "יוצר או כתב",
	publishedText: "תאריך פרסום לפי מקור",
	url: "כתובת מקור",
	identityBasis: "בסיס קישור לאב",
	saved: "שמירה בפועל",
	licenseSource: "מקור רישיון",
} as const;

export const internetSourceKind = "אינטרנט";
export const explicitIdentityPrefix = "שם מפורש";
export const needsClarificationPrefix = "נדרש בירור";

export const catalogTypes: Record<string, ItemTypeValue> = {
	"קובץ תמונה": "picture",
	PDF: "document",
	מסמך: "document",
	מצגת: "document",
	גיליון: "document",
	"קובץ אחר": "other",
	"קובץ מערכת": "other",
	סרטון: "video",
	הקלטה: "audio",
};

export const webTypes: Record<string, ItemTypeValue> = {
	"דף אינטרנט": "other",
	"סרטון (קישור)": "video",
	"מסמך PDF": "document",
	"הסכת (קישור)": "audio",
	"הקלטה (קישור)": "audio",
	כתבה: "article",
	ראיון: "interview",
	איור: "drawing",
	"קובץ תמונה": "picture",
};

// Labels shown to the family, in display order, read verbatim from the row.
export const familyVisibleColumns = [
	"תיקייה",
	"תורם",
	"יוצר או צלם",
	"זכויות",
	"מצב זיהוי",
	"אבא מופיע",
	"מאשר הופעה",
	"טווח הופעה",
	"בחירה לאתר",
	"הערות יורם",
	"תיאור בדוק",
	"מצב בדיקה",
	"כיסוי בדיקה",
	"קבוצת כפילות",
	"תאריך אירוע",
	"דיוק תאריך",
	"ראיה לתאריך",
] as const;
```

- [ ] **Step 4: Create `src/import/system-files.ts`:**

```ts
const APPLE_DOUBLE = [0x00, 0x05, 0x16, 0x07];
const OLE = [0xd0, 0xcf, 0x11, 0xe0];
// Word lock files are a few hundred bytes with no fixed header.
const LOCK_FILE_MAX_BYTES = 4096n;

const startsWith = (head: Uint8Array, magic: number[]) =>
	magic.every((byte, index) => head[index] === byte);

export function isSystemFileName(name: string): boolean {
	const lower = name.toLowerCase();
	return (name.startsWith("._") && name.length > 2) || lower === "thumbs.db" || name.startsWith("~$");
}

// A name alone is not proof: anything unconfirmed stays an item.
export function confirmSystemFile(name: string, sizeBytes: bigint, head: Uint8Array): boolean {
	if (name.startsWith("._")) return startsWith(head, APPLE_DOUBLE);
	if (name.toLowerCase() === "thumbs.db") return startsWith(head, OLE);
	if (name.startsWith("~$")) return sizeBytes <= LOCK_FILE_MAX_BYTES;
	return false;
}
```

- [ ] **Step 5: Create `src/import/catalog-plan.ts`:**

```ts
import { isSafeSourceUrl } from "../lib/source-url";
import type { ItemTypeValue } from "../services/item-input";
import {
	catalog as c,
	catalogTypes,
	explicitIdentityPrefix,
	internetSourceKind,
	needsClarificationPrefix,
	web as w,
	webTypes,
} from "./catalog-columns";
import { isSystemFileName } from "./system-files";

export type CatalogRow = Record<string, string>;
export type PlanError = { kobId: string; code: string };
export type PlannedRecord = {
	kobId: string;
	origin: "family" | "internet";
	title: string;
	types: ItemTypeValue[];
	rightsStatus: "unknown" | "needs_clarification";
	publish: boolean;
	source: { url: string; publisher: string; author: string; publishedText: string; license: string } | null;
	file: { driveFileId: string; sizeBytes: bigint; mimeType: string; originalFilename: string; sha256: string | null } | null;
	systemCandidate: boolean;
	tab: "catalog";
	row: { catalog: CatalogRow; web: CatalogRow | null };
};

const KOB_ID = /^KOB-\d{6}$/;
const MAX_TITLE = 200; // matches itemInputSchema, so the record stays editable

function parseSize(value: string): bigint | null {
	const number = Number(value);
	// Exports can write sizes in exponent form.
	return value.trim() !== "" && Number.isSafeInteger(number) && number >= 0 ? BigInt(number) : null;
}

function planRow(row: CatalogRow, webRow: CatalogRow | null): PlannedRecord | string {
	const name = row[c.originalName] ?? "";
	const internet = row[c.sourceKind] === internetSourceKind;
	if (internet && !webRow) return "MISSING_WEB_ROW";
	const type = internet ? webTypes[webRow?.[w.type] ?? ""] : catalogTypes[row[c.type] ?? ""];
	if (!type) return "UNKNOWN_TYPE";
	const title = ((internet ? webRow?.[w.title] : name) ?? "").trim();
	if (!title) return "MISSING_TITLE";
	if (title.length > MAX_TITLE) return "TITLE_TOO_LONG";
	const driveFileId = row[c.driveId]?.trim() ?? "";
	if (!internet && !driveFileId) return "MISSING_DRIVE_ID";
	let file: PlannedRecord["file"] = null;
	if (driveFileId) {
		const sizeBytes = parseSize(row[c.size] ?? "");
		if (sizeBytes === null) return "INVALID_SIZE";
		file = {
			driveFileId,
			sizeBytes,
			mimeType: row[c.mime] ?? "application/octet-stream",
			originalFilename: name,
			sha256: row[c.sha256]?.trim() || null,
		};
	}
	let source: PlannedRecord["source"] = null;
	if (internet && webRow) {
		const url = webRow[w.url] ?? "";
		if (!isSafeSourceUrl(url)) return "UNSAFE_URL";
		source = {
			url,
			publisher: webRow[w.publisher] ?? "",
			author: webRow[w.author] ?? "",
			publishedText: webRow[w.publishedText] ?? "",
			license: webRow[w.licenseSource] ?? "",
		};
	}
	return {
		kobId: row[c.id],
		origin: internet ? "internet" : "family",
		title,
		types: [type],
		// Clearing rights stays a family decision, even with a documented license.
		rightsStatus: (row[c.rights] ?? "").startsWith(needsClarificationPrefix) ? "needs_clarification" : "unknown",
		publish: internet && (webRow?.[w.identityBasis] ?? "").startsWith(explicitIdentityPrefix),
		source,
		file,
		systemCandidate: !internet && isSystemFileName(name),
		tab: "catalog",
		row: { catalog: row, web: webRow },
	};
}

export function planCatalog(catalogRows: CatalogRow[], webRows: CatalogRow[]) {
	const records: PlannedRecord[] = [];
	const errors: PlanError[] = [];
	const webById = new Map(webRows.map((row) => [row[w.id], row]));
	const seen = new Set<string>();
	for (const row of catalogRows) {
		const kobId = row[c.id] ?? "";
		if (!KOB_ID.test(kobId)) {
			errors.push({ kobId, code: "INVALID_ID" });
			continue;
		}
		if (seen.has(kobId)) {
			errors.push({ kobId, code: "DUPLICATE_ID" });
			continue;
		}
		seen.add(kobId);
		const planned = planRow(row, webById.get(kobId) ?? null);
		if (typeof planned === "string") errors.push({ kobId, code: planned });
		else records.push(planned);
	}
	return { records, errors };
}
```

- [ ] **Step 6: Run the tests.** Same command. Expected: PASS.

- [ ] **Step 7: Commit.** `git commit -m "feat: plan catalog import from rows"`, with the listed files staged.

### Task 5: Apply the plan, operator script and docs

**Files:**
- Create: `src/import/apply-catalog.ts`, `src/import/drive.ts`, `scripts/import-catalog.ts`
- Modify: `package.json`, `package-lock.json`, `AGENTS.md`, `docs/ROADMAP.md`, `docs/DATA-MIGRATION.md`, `docs/DEVELOPMENT.md`, `docs/SESSION-HANDOFF.md`, `docs/README.md`
- Test: `tests/integration/catalog-import.test.ts`

**Interfaces:**
- Consumes: `planCatalog`, `PlannedRecord`, `confirmSystemFile`.
- Produces:
  - `resolveSystemFiles(records, readHead: (driveFileId: string) => Promise<Uint8Array>): Promise<{ records: PlannedRecord[]; excluded: PlannedRecord[]; unreadable: string[] }>`
  - `applyCatalog(db, records, snapshotHash, { apply: boolean }): Promise<CatalogReport>`
  - `type CatalogReport = { created: number; published: number; existing: number; changed: string[]; conflicts: string[]; files: number }`
  - `createDriveClient(keyFilePath: string): DriveClient`; `type DriveClient = { readHead(id: string): Promise<Uint8Array>; readStream(id: string): Promise<ReadableStream<Uint8Array>> }`
  - `SYSTEM_ACTOR = "system:import"`

- [ ] **Step 1: Write the failing test.** `tests/integration/catalog-import.test.ts`:

```ts
import { afterAll, beforeEach, expect, it } from "vitest";
import { applyCatalog, resolveSystemFiles, SYSTEM_ACTOR } from "../../src/import/apply-catalog";
import type { PlannedRecord } from "../../src/import/catalog-plan";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import { createDatabase } from "../../src/lib/database";
import { createArchiveReader } from "../../src/services/archive";

const db = createDatabase(requireTestDatabaseUrl(process.env));
const reader = createArchiveReader(db);
async function clean() {
	await db.editorialAudit.deleteMany();
	await db.importRun.deleteMany();
	await db.item.deleteMany();
}
beforeEach(clean);
afterAll(async () => {
	await clean();
	await db.$disconnect();
});

const record = (kobId: string, extra: Partial<PlannedRecord> = {}): PlannedRecord => ({
	kobId,
	origin: "family",
	title: "synthetic.jpg",
	types: ["picture"],
	rightsStatus: "unknown",
	publish: false,
	source: null,
	file: { driveFileId: `d-${kobId}`, sizeBytes: 10n, mimeType: "image/jpeg", originalFilename: "synthetic.jpg", sha256: null },
	systemCandidate: false,
	tab: "catalog",
	row: { catalog: { note: "PRIVATE-NOTE" }, web: null },
	...extra,
});
const card = (kobId: string) =>
	record(kobId, {
		origin: "internet",
		title: "Public card",
		publish: true,
		file: null,
		source: { url: "https://example.test/a", publisher: "Press", author: "", publishedText: "", license: "" },
	});

it("writes nothing on a dry run but reports what it would do", async () => {
	const report = await applyCatalog(db, [record("KOB-000001"), card("KOB-000002")], "h1", { apply: false });
	expect(report).toMatchObject({ created: 2, published: 1, files: 1 });
	expect(await db.item.count()).toBe(0);
	expect(await db.importRun.count()).toBe(0);
});

it("creates a private family item needing review, with an empty description", async () => {
	await applyCatalog(db, [record("KOB-000001")], "h1", { apply: true });
	const item = await db.item.findUniqueOrThrow({
		where: { kobId: "KOB-000001" },
		include: { workingRevision: true, files: true, catalogRecord: true },
	});
	expect(item).toMatchObject({ visibility: "private", publishedRevisionId: null, reviewStatus: "needs_review", origin: "family" });
	expect(item.workingRevision).toMatchObject({ title: "synthetic.jpg", description: "", authorId: SYSTEM_ACTOR });
	expect(item.files[0]).toMatchObject({ role: "original", status: "pending", storageKey: `originals/${item.id}` });
	expect(item.catalogRecord?.row).toEqual({ catalog: { note: "PRIVATE-NOTE" }, web: null });
});

it("publishes a card readable by visitors, with nothing private", async () => {
	await applyCatalog(db, [card("KOB-000002")], "h1", { apply: true });
	const item = await db.item.findUniqueOrThrow({ where: { kobId: "KOB-000002" } });
	const view = await reader.getPublicItem(item.id);
	expect(view?.title).toBe("Public card");
	expect(JSON.stringify(view)).not.toContain("PRIVATE-NOTE");
});

it("keeps a search-match internet record away from visitors", async () => {
	await applyCatalog(db, [{ ...card("KOB-000009"), publish: false }], "h1", { apply: true });
	const item = await db.item.findUniqueOrThrow({ where: { kobId: "KOB-000009" } });
	expect(item).toMatchObject({ origin: "internet", visibility: "private", publishedRevisionId: null });
	expect(await reader.getPublicItem(item.id)).toBeNull();
	expect(await reader.searchPublicItems("Public card")).toEqual([]);
});

it("reruns without duplicates or changes to website edits", async () => {
	await applyCatalog(db, [record("KOB-000001")], "h1", { apply: true });
	const report = await applyCatalog(db, [record("KOB-000001")], "h1", { apply: true });
	expect(report).toMatchObject({ created: 0, existing: 1, changed: [], conflicts: [] });
	expect(await db.item.count()).toBe(1);
});

it("does not republish a card a family member made private", async () => {
	await applyCatalog(db, [card("KOB-000002")], "h1", { apply: true });
	await db.item.update({
		where: { kobId: "KOB-000002" },
		data: { visibility: "private", publishedRevisionId: null, publishedAt: null, version: 2 },
	});
	await applyCatalog(db, [card("KOB-000002")], "h2", { apply: true });
	expect((await db.item.findUniqueOrThrow({ where: { kobId: "KOB-000002" } })).visibility).toBe("private");
});

it("refreshes a changed row on an untouched item and flags a conflict on an edited one", async () => {
	await applyCatalog(db, [record("KOB-000001"), record("KOB-000003")], "h1", { apply: true });
	await db.item.update({ where: { kobId: "KOB-000003" }, data: { version: 2 } });
	const changed = { catalog: { note: "CHANGED" }, web: null };
	const report = await applyCatalog(
		db,
		[record("KOB-000001", { row: changed }), record("KOB-000003", { row: changed })],
		"h2",
		{ apply: true },
	);
	expect(report.changed).toEqual(["KOB-000001"]);
	expect(report.conflicts).toEqual(["KOB-000003"]);
	const edited = await db.item.findUniqueOrThrow({ where: { kobId: "KOB-000003" }, include: { catalogRecord: true } });
	expect(edited.catalogRecord?.row).toEqual({ catalog: { note: "PRIVATE-NOTE" }, web: null });
});

it("records counts only on the import run", async () => {
	await applyCatalog(db, [record("KOB-000001")], "h1", { apply: true });
	const run = await db.importRun.findFirstOrThrow();
	expect(run).toMatchObject({ kind: "catalog", snapshotHash: "h1" });
	expect(JSON.stringify(run.counts)).not.toContain("KOB-");
	expect(run.finishedAt).not.toBeNull();
});

it("excludes only system files confirmed by content, keeping readable failures as items", async () => {
	const candidate = (kobId: string, name: string) =>
		record(kobId, {
			systemCandidate: true,
			file: { driveFileId: kobId, sizeBytes: 4096n, mimeType: "image/jpeg", originalFilename: name, sha256: null },
		});
	const appleDouble = Uint8Array.from([0x00, 0x05, 0x16, 0x07]);
	const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
	const result = await resolveSystemFiles(
		[candidate("KOB-000001", "._a.jpg"), candidate("KOB-000002", "._b.jpg"), candidate("KOB-000003", "._c.jpg"), record("KOB-000004")],
		async (id) => {
			if (id === "KOB-000003") throw new Error("unreadable");
			return id === "KOB-000001" ? appleDouble : jpeg;
		},
	);
	expect(result.excluded.map((r) => r.kobId)).toEqual(["KOB-000001"]);
	expect(result.records.map((r) => r.kobId)).toEqual(["KOB-000002", "KOB-000003", "KOB-000004"]);
	expect(result.unreadable).toEqual(["KOB-000003"]);
});
```

- [ ] **Step 2: Run it.** `TEST_DATABASE_URL='...' npx vitest run tests/integration/catalog-import.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Create `src/import/apply-catalog.ts`:**

```ts
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "../generated/prisma/client";
import type { Database } from "../lib/database";
import type { PlannedRecord } from "./catalog-plan";
import { confirmSystemFile } from "./system-files";

export const SYSTEM_ACTOR = "system:import";

export type CatalogReport = {
	created: number;
	published: number;
	existing: number;
	changed: string[];
	conflicts: string[];
	files: number;
};

export async function resolveSystemFiles(
	records: PlannedRecord[],
	readHead: (driveFileId: string) => Promise<Uint8Array>,
) {
	const kept: PlannedRecord[] = [];
	const excluded: PlannedRecord[] = [];
	const unreadable: string[] = [];
	for (const record of records) {
		if (!record.systemCandidate || !record.file) {
			kept.push(record);
			continue;
		}
		try {
			const head = await readHead(record.file.driveFileId);
			(confirmSystemFile(record.file.originalFilename, record.file.sizeBytes, head) ? excluded : kept).push(record);
		} catch {
			unreadable.push(record.kobId);
			kept.push(record);
		}
	}
	return { records: kept, excluded, unreadable };
}

async function createRecord(tx: Prisma.TransactionClient, record: PlannedRecord, snapshotHash: string) {
	const item = await tx.item.create({
		data: {
			kobId: record.kobId,
			origin: record.origin,
			rightsStatus: record.rightsStatus,
			reviewStatus: "needs_review",
		},
	});
	// Catalog descriptions stay in the catalog record: some hold review wording.
	const revision = await tx.itemRevision.create({
		data: { itemId: item.id, title: record.title, types: record.types, authorId: SYSTEM_ACTOR },
	});
	await tx.item.update({
		where: { id: item.id },
		data: {
			workingRevisionId: revision.id,
			...(record.publish
				? { visibility: "public", publishedRevisionId: revision.id, publishedAt: new Date() }
				: {}),
		},
	});
	await tx.itemCatalogRecord.create({
		data: { itemId: item.id, tab: record.tab, row: record.row as unknown as Prisma.InputJsonObject, snapshotHash },
	});
	if (record.source) await tx.externalSource.create({ data: { itemId: item.id, ...record.source } });
	if (record.file)
		await tx.mediaFile.create({
			data: {
				itemId: item.id,
				role: "original",
				storageKey: `originals/${item.id}`,
				mimeType: record.file.mimeType,
				sizeBytes: record.file.sizeBytes,
				sha256: record.file.sha256,
				originalFilename: record.file.originalFilename,
			},
		});
	await tx.editorialAudit.create({
		data: { actorId: SYSTEM_ACTOR, targetType: "item", targetId: item.id, action: record.publish ? "import-publish" : "import" },
	});
}

// Keyed on kobId. A rerun never touches revisions, status or visibility.
export async function applyCatalog(
	db: Database,
	records: PlannedRecord[],
	snapshotHash: string,
	{ apply }: { apply: boolean },
): Promise<CatalogReport> {
	const report: CatalogReport = { created: 0, published: 0, existing: 0, changed: [], conflicts: [], files: 0 };
	const startedAt = new Date();
	for (const record of records) {
		const existing = await db.item.findUnique({ where: { kobId: record.kobId }, include: { catalogRecord: true } });
		if (!existing) {
			report.created++;
			if (record.publish) report.published++;
			if (record.file) report.files++;
			if (apply) await db.$transaction((tx) => createRecord(tx, record, snapshotHash));
			continue;
		}
		report.existing++;
		if (isDeepStrictEqual(existing.catalogRecord?.row, record.row)) continue;
		if (existing.version > 1) {
			report.conflicts.push(record.kobId);
			continue;
		}
		report.changed.push(record.kobId);
		if (apply && existing.catalogRecord)
			await db.itemCatalogRecord.update({
				where: { id: existing.catalogRecord.id },
				data: { row: record.row as unknown as Prisma.InputJsonObject, snapshotHash },
			});
	}
	if (apply)
		await db.importRun.create({
			data: {
				kind: "catalog",
				snapshotHash,
				startedAt,
				finishedAt: new Date(),
				counts: {
					created: report.created,
					published: report.published,
					existing: report.existing,
					changed: report.changed.length,
					conflicts: report.conflicts.length,
					files: report.files,
				},
			},
		});
	return report;
}
```

- [ ] **Step 4: Run the test.** Same command. Expected: PASS.

- [ ] **Step 5: Add dependencies:** `npm install --save-dev --save-exact csv-parse@7.0.3 google-auth-library@11.3.3`.

- [ ] **Step 6: Create `src/import/drive.ts`:**

```ts
import { JWT } from "google-auth-library";

export type DriveClient = {
	readHead(id: string): Promise<Uint8Array>;
	readStream(id: string): Promise<ReadableStream<Uint8Array>>;
};

const HEAD_BYTES = 16;

// Read-only scope. The service account sees only the folder shared with it.
export function createDriveClient(keyFilePath: string): DriveClient {
	const auth = new JWT({ keyFile: keyFilePath, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
	async function get(id: string, range?: string) {
		const { token } = await auth.getAccessToken();
		const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, {
			headers: { authorization: `Bearer ${token}`, ...(range ? { range } : {}) },
		});
		if (!response.ok || !response.body) throw new Error(`DRIVE_READ_FAILED_${response.status}`);
		return response;
	}
	return {
		readHead: async (id) => new Uint8Array(await (await get(id, `bytes=0-${HEAD_BYTES - 1}`)).arrayBuffer()),
		readStream: async (id) => (await get(id)).body as ReadableStream<Uint8Array>,
	};
}
```

- [ ] **Step 7: Create `scripts/import-catalog.ts`:**

```ts
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "csv-parse/sync";
import { applyCatalog, resolveSystemFiles } from "../src/import/apply-catalog";
import { planCatalog, type CatalogRow } from "../src/import/catalog-plan";
import { createDriveClient } from "../src/import/drive";
import { createDatabase } from "../src/lib/database";

// Operator command. Dry run unless --apply and --confirm-host match. Prints
// counts only; row detail goes to the report outside the repository.
const { values } = parseArgs({
	options: {
		catalog: { type: "string" },
		web: { type: "string" },
		report: { type: "string" },
		"drive-key": { type: "string" },
		apply: { type: "boolean", default: false },
		"confirm-host": { type: "string" },
	},
});
const { catalog, web, report: reportPath, "drive-key": driveKey } = values;
const databaseUrl = process.env.DATABASE_URL;
if (!catalog || !web || !reportPath || !driveKey || !databaseUrl) {
	console.error("Needs --catalog --web --report --drive-key and DATABASE_URL");
	process.exit(2);
}
if (!relative(process.cwd(), resolve(reportPath)).startsWith("..")) {
	console.error("--report must be outside the repository");
	process.exit(2);
}
const host = new URL(databaseUrl).host;
if (values.apply && values["confirm-host"] !== host) {
	console.error(`--apply needs --confirm-host=${host}`);
	process.exit(2);
}
console.log(`Database host: ${host}. Mode: ${values.apply ? "APPLY" : "dry run"}`);

const read = (path: string) => readFileSync(path);
const rows = (path: string): CatalogRow[] =>
	parse(read(path), { columns: true, bom: true, relax_column_count: true, skip_empty_lines: true });
const snapshotHash = createHash("sha256").update(read(catalog)).update(read(web)).digest("hex");
const plan = planCatalog(rows(catalog), rows(web));
const drive = createDriveClient(driveKey);
const resolved = await resolveSystemFiles(plan.records, drive.readHead);
const db = createDatabase(databaseUrl);
try {
	const report = await applyCatalog(db, resolved.records, snapshotHash, { apply: Boolean(values.apply) });
	const detail = {
		snapshotHash,
		report,
		errors: plan.errors,
		excluded: resolved.excluded.map((record) => ({ kobId: record.kobId, name: record.file?.originalFilename })),
		unreadableSystemCandidates: resolved.unreadable,
		heldInternet: resolved.records.filter((r) => r.origin === "internet" && !r.publish).map((r) => r.kobId),
		// Exactly what visitors will see, so Yoram can read it before it goes live.
		publicCards: resolved.records.filter((r) => r.publish).map((r) => ({ kobId: r.kobId, title: r.title, ...r.source })),
	};
	writeFileSync(reportPath, JSON.stringify(detail, (_key, value) => (typeof value === "bigint" ? String(value) : value), 2));
	console.log({
		items: resolved.records.length,
		excluded: resolved.excluded.length,
		errors: plan.errors.length,
		unreadable: resolved.unreadable.length,
		created: report.created,
		published: report.published,
		files: report.files,
		existing: report.existing,
		changed: report.changed.length,
		conflicts: report.conflicts.length,
	});
} finally {
	await db.$disconnect();
}
```

Add to `package.json` scripts: `"import:catalog": "node --conditions=react-server --import tsx scripts/import-catalog.ts"`.

Verify the wiring without real data. Run `npm run typecheck`; expected: PASS. Run `npm run import:catalog`; expected: `Needs --catalog --web --report --drive-key and DATABASE_URL`, exit code 2.

- [ ] **Step 8: Check the system actor assumption.** Run: `grep -rn "authorId\|actorId" src --include=*.ts --include=*.tsx`, excluding `src/generated`. Expected: nothing joins these to `User`. If something does, stop and report.

- [ ] **Step 9: Update docs.**
  - `AGENTS.md` invariant 7: after "New/imported/restored items are private." add "Exception (Yoram, 2026-11-05): imported internet records that explicitly name their subject publish as link cards without family review; their summaries and saved copies stay family-only." Update the scope paragraph to name this work.
  - `docs/ROADMAP.md`: set phase 2 to "Slice 1 released (v0.4.0, 2026-11-05); slices 2–5 follow media and import", link this spec in phases 3 and 4, mark them in progress, and amend the rules list with the same exception.
  - `docs/DATA-MIGRATION.md`: 1,379 records; five records carry a site selection; system-file exclusion; internet exception; hashes computed at copy; duplicate column is not duplicates; snapshot before dry run.
  - `docs/DEVELOPMENT.md`: new models, rights rule, importer commands and report rule. List the new settings for Yoram to add to `.env.example`, which agents cannot edit.
  - `docs/README.md`: add this spec and plan. `docs/SESSION-HANDOFF.md`: next work.

- [ ] **Step 10: Full check and commit.** `TEST_DATABASE_URL='...' npm run check`. Expected: PASS. Then stage only the listed files and `git commit -m "feat: import the catalog idempotently with a dry run"`.

### Gate A: stop for Yoram

- [ ] Open the PR into `dev`. Yoram runs the Codex review. Reply to each point; merge on CI green plus the reply, on Yoram's word.
- [ ] Before the release, count public items in production by query, because the rights rule applies to their next publish.
- [ ] Yoram approves the Hebrew strings; then a release to `main` on Yoram's go, because production needs the migration. Follow OPERATIONS.md.
- [ ] Yoram creates a Google Cloud service account and shares the collection folder with it as Viewer. The key file stays outside the repository.
- Note: each dry run and each apply needs its own new `--report` path; the importer refuses to overwrite an existing report.
- [ ] Yoram exports the "catalog" and "web sources" tabs as CSV into a dated folder outside the repository, and runs the dry run against the local development database:

```sh
DATABASE_URL='postgresql://kobob_dev:synthetic-local-dev-only@127.0.0.1:55440/kobob_dev' npm run import:catalog -- --catalog <catalog.csv> --web <web.csv> --drive-key <key.json> --report <outside-repo>/catalog-dry-run.json
```

Expected, if nothing changed: 0 errors, 165 excluded, 1,214 items, 81 published, 1,129 files. Differences go to Yoram with the report; they are not "fixed" silently. Yoram reads the report's `publicCards` list, which is exactly what visitors will see, and decides the two cataloged dates listed in the spec.

- [ ] Before the production apply, run a production dry run and have Yoram read its report. Yoram resolves `selectedAndPublishing` (site-selected records that would publish) first.
- [ ] On Yoram's explicit go, apply to the local database, then to production using `KOBOB_DIRECT_URL` through Bitwarden as in the OPERATIONS.md bootstrap command, with `--apply --confirm-host=<host> --confirm-snapshot=<hash from the reviewed dry run>`. Verify counts by query, then check a card on the public site and search as an anonymous visitor.

---

# Stage 2: storage and delivery

Branch: `feat/private-media`.

### Task 6: Storage settings and client

**Files:**
- Modify: `src/lib/config.ts`, `src/app/api/health/route.ts`, `playwright.config.ts`, `tests/e2e/health.spec.ts`, `package.json`, `package-lock.json`
- Create: `src/lib/storage.ts`
- Test: `tests/unit/config.test.ts`

**Interfaces:**
- Produces:
  - `readStorageConfig(env): { endpoint; bucket; accessKeyId; secretAccessKey }`; `storageConfigValidity(env): { storage: boolean }`
  - `createR2Storage(config): ObjectStorage`
  - `type ObjectStorage = { read(key: string, range?: { start: number; end: number }): Promise<ReadableStream<Uint8Array>>; write(key: string, body: ReadableStream<Uint8Array> | Uint8Array, contentType: string): Promise<void> }`

- [ ] **Step 1: Write the failing tests.** Append to `tests/unit/config.test.ts`, adding `readStorageConfig` and `storageConfigValidity` to its import:

```ts
describe("storage settings", () => {
	const valid = {
		R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
		R2_BUCKET: "synthetic-bucket",
		R2_ACCESS_KEY_ID: "synthetic-id",
		R2_SECRET_ACCESS_KEY: "synthetic-secret",
	};
	it("accepts complete https settings", () => {
		expect(readStorageConfig(valid).bucket).toBe("synthetic-bucket");
		expect(storageConfigValidity(valid)).toEqual({ storage: true });
	});
	it.each(Object.keys(valid))("rejects a missing %s and names only the setting", (name) => {
		const env = { ...valid, [name]: "" };
		expect(() => readStorageConfig(env)).toThrow(`Missing or invalid ${name}`);
		expect(storageConfigValidity(env)).toEqual({ storage: false });
	});
	it("rejects a non-https endpoint", () => {
		expect(() => readStorageConfig({ ...valid, R2_ENDPOINT: "http://a.test" })).toThrow("Missing or invalid R2_ENDPOINT");
	});
	it("never includes a secret in an error", () => {
		try {
			readStorageConfig({ ...valid, R2_ENDPOINT: "bad" });
		} catch (error) {
			expect(String(error)).not.toContain("synthetic-secret");
		}
	});
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/unit/config.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement in `src/lib/config.ts`,** at the end:

```ts
// Validated apart from readServerConfig so missing storage never blocks pages.
export function readStorageConfig(env: Environment) {
	const endpoint = setting(env, "R2_ENDPOINT");
	if (parseUrl(endpoint, "R2_ENDPOINT").protocol !== "https:")
		throw new Error("Missing or invalid R2_ENDPOINT");
	return Object.freeze({
		endpoint,
		bucket: setting(env, "R2_BUCKET"),
		accessKeyId: setting(env, "R2_ACCESS_KEY_ID"),
		secretAccessKey: setting(env, "R2_SECRET_ACCESS_KEY"),
	});
}
export function storageConfigValidity(env: Environment) {
	try {
		readStorageConfig(env);
		return { storage: true };
	} catch {
		return { storage: false };
	}
}
```

In `src/app/api/health/route.ts`, import `storageConfigValidity` and add `...storageConfigValidity(process.env)` to `configValidity()`, noting in the comment that storage validity never affects status. In `tests/e2e/health.spec.ts` add `expect(body.config.storage).toBe(false);`. In `playwright.config.ts`, add to `env`, beside the blank email settings: `R2_ENDPOINT: "", R2_BUCKET: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "",`.

- [ ] **Step 4: Add dependencies:** `npm install --save-exact @aws-sdk/client-s3@3.1162.0 @aws-sdk/lib-storage@3.1162.0`.

- [ ] **Step 5: Create `src/lib/storage.ts`:**

```ts
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

export type ObjectStorage = {
	read(key: string, range?: { start: number; end: number }): Promise<ReadableStream<Uint8Array>>;
	write(key: string, body: ReadableStream<Uint8Array> | Uint8Array, contentType: string): Promise<void>;
};

// No signed-link method on purpose: every read goes through the media service
// so access is checked on every request (spec 2026-11-05).
export function createR2Storage(config: {
	endpoint: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
}): ObjectStorage {
	const client = new S3Client({
		region: "auto",
		endpoint: config.endpoint,
		credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
		requestChecksumCalculation: "WHEN_REQUIRED",
		responseChecksumValidation: "WHEN_REQUIRED",
	});
	return {
		async read(key, range) {
			const { Body } = await client.send(
				new GetObjectCommand({
					Bucket: config.bucket,
					Key: key,
					...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
				}),
			);
			if (!Body) throw new Error("STORAGE_EMPTY");
			return Body.transformToWebStream() as ReadableStream<Uint8Array>;
		},
		async write(key, body, contentType) {
			await new Upload({
				client,
				params: { Bucket: config.bucket, Key: key, Body: body, ContentType: contentType },
			}).done();
		},
	};
}
```

- [ ] **Step 6: Run tests.** `npx vitest run tests/unit/config.test.ts`, then `npm run typecheck`, then `TEST_DATABASE_URL='...' npm run test:e2e -- tests/e2e/health.spec.ts`. Expected: PASS.

- [ ] **Step 7: Commit.** `git commit -m "feat: add private storage settings and client"`, with the listed files staged.

### Task 7: Access-checked media route

**Files:**
- Create: `src/lib/byte-range.ts`, `src/services/media.ts`, `src/services/media-runtime.ts`, `src/app/api/media/[id]/route.ts`
- Test: `tests/unit/byte-range.test.ts`, `tests/integration/media.test.ts`

**Interfaces:**
- Consumes: `ObjectStorage`, `readStorageConfig`, `createR2Storage`, `requireMember`.
- Produces:
  - `parseRange(header: string | null, size: number): { kind: "full" } | { kind: "partial"; start: number; end: number } | { kind: "invalid" }`
  - `MAX_RANGE_BYTES = 8 * 1024 * 1024`
  - `createMediaReader(db, requireMember, storage: () => ObjectStorage).read(id: string, range: string | null): Promise<Response>`

- [ ] **Step 1: Write the failing tests.** `tests/unit/byte-range.test.ts`:

```ts
import { expect, it } from "vitest";
import { MAX_RANGE_BYTES, parseRange } from "../../src/lib/byte-range";

const size = 100 * 1024 * 1024;
it("treats a missing header as the full file", () => {
	expect(parseRange(null, size)).toEqual({ kind: "full" });
});
it("caps an open-ended range", () => {
	expect(parseRange("bytes=0-", size)).toEqual({ kind: "partial", start: 0, end: MAX_RANGE_BYTES - 1 });
});
it("keeps a small explicit range", () => {
	expect(parseRange("bytes=10-19", size)).toEqual({ kind: "partial", start: 10, end: 19 });
});
it("clamps to the end of the file", () => {
	expect(parseRange("bytes=5-999", 10)).toEqual({ kind: "partial", start: 5, end: 9 });
});
it("supports a suffix range", () => {
	expect(parseRange("bytes=-4", 10)).toEqual({ kind: "partial", start: 6, end: 9 });
});
it.each(["bytes=20-", "bytes=9-3", "bytes=abc", "items=0-1", "bytes=0-1,3-4", "bytes=-0", "bytes=-"])(
	"rejects %s",
	(header) => {
		expect(parseRange(header, 10)).toEqual({ kind: "invalid" });
	},
);
```

`tests/integration/media.test.ts`:

```ts
import { afterAll, beforeEach, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import { createDatabase } from "../../src/lib/database";
import type { ObjectStorage } from "../../src/lib/storage";
import { createMediaReader } from "../../src/services/media";

const db = createDatabase(requireTestDatabaseUrl(process.env));
beforeEach(async () => {
	await db.item.deleteMany();
});
afterAll(async () => {
	await db.item.deleteMany();
	await db.$disconnect();
});

const bytes = new TextEncoder().encode("0123456789");
const reads: Array<{ key: string; range?: { start: number; end: number } }> = [];
const storage: ObjectStorage = {
	read: async (key, range) => {
		reads.push({ key, range });
		const part = range ? bytes.slice(range.start, range.end + 1) : bytes;
		return new Blob([part]).stream();
	},
	write: async () => {},
};
const member = async () => ({ id: "m", role: "member" as const, accessVersion: 1 });
const reader = (auth: typeof member = member, store: () => ObjectStorage = () => storage) =>
	createMediaReader(db, auth, store);

async function file(extra: { mimeType?: string; status?: "pending" | "verified" | "failed"; originalFilename?: string } = {}) {
	const item = await db.item.create({ data: {} });
	return db.mediaFile.create({
		data: {
			itemId: item.id, role: "original", storageKey: `originals/${item.id}`, sizeBytes: 10n,
			mimeType: extra.mimeType ?? "image/jpeg", status: extra.status ?? "verified",
			originalFilename: extra.originalFilename ?? "synthetic.jpg",
		},
	});
}

it("serves a verified file privately with safe headers and no storage key", async () => {
	const { id } = await file();
	const response = await reader().read(id, null);
	expect(response.status).toBe(200);
	expect(response.headers.get("cache-control")).toBe("private, no-store");
	expect(response.headers.get("x-content-type-options")).toBe("nosniff");
	expect(response.headers.get("content-type")).toBe("image/jpeg");
	expect(response.headers.get("content-disposition")).toMatch(/^inline/);
	expect(response.headers.get("content-length")).toBe("10");
	expect(response.headers.get("accept-ranges")).toBe("bytes");
	expect(response.headers.get("content-security-policy")).toContain("sandbox");
	expect(JSON.stringify([...response.headers])).not.toContain("originals/");
	expect(await response.text()).toBe("0123456789");
});

it.each(["UNAUTHORIZED", "FORBIDDEN"])("gives %s the same 404 as an unknown id, with or without a range", async (message) => {
	const { id } = await file();
	const denied = reader(async () => {
		throw new Error(message);
	});
	const before = reads.length;
	const responses = [await denied.read(id, null), await denied.read(id, "bytes=0-1"), await denied.read("missing", null)];
	expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
	expect(reads.length).toBe(before);
});

it("checks access again on every range request", async () => {
	const { id } = await file();
	let allowed = true;
	const reading = reader(async () => {
		if (!allowed) throw new Error("FORBIDDEN");
		return { id: "m", role: "member" as const, accessVersion: 1 };
	});
	expect((await reading.read(id, "bytes=0-1")).status).toBe(206);
	allowed = false;
	expect((await reading.read(id, "bytes=2-3")).status).toBe(404);
});

it.each(["pending", "failed"] as const)("does not serve a %s file", async (status) => {
	const { id } = await file({ status });
	expect((await reader().read(id, null)).status).toBe(404);
});

it("returns 206 with a content range", async () => {
	const { id } = await file();
	const response = await reader().read(id, "bytes=2-5");
	expect(response.status).toBe(206);
	expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
	expect(response.headers.get("content-length")).toBe("4");
	expect(await response.text()).toBe("2345");
});

it("returns 416 for an unsatisfiable range", async () => {
	const { id } = await file();
	const response = await reader().read(id, "bytes=50-");
	expect(response.status).toBe(416);
	expect(response.headers.get("content-range")).toBe("bytes */10");
});

it.each(["text/html", "image/svg+xml", "multipart/related", "application/msword", "image/tiff"])(
	"sends %s as an attachment with a neutral type",
	async (mimeType) => {
		const { id } = await file({ mimeType, originalFilename: "שם קובץ.bin" });
		const response = await reader().read(id, null);
		expect(response.headers.get("content-type")).toBe("application/octet-stream");
		expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename\*=UTF-8''/);
	},
);

it.each(["image/jpeg", "image/png", "image/gif", "application/pdf", "audio/mpeg"])("sends %s inline", async (mimeType) => {
	const { id } = await file({ mimeType });
	const response = await reader().read(id, null);
	expect(response.headers.get("content-type")).toBe(mimeType);
	expect(response.headers.get("content-disposition")).toMatch(/^inline/);
});

it("answers 503 without detail when storage is not configured", async () => {
	const { id } = await file();
	const response = await reader(member, () => {
		throw new Error("Missing or invalid R2_BUCKET");
	}).read(id, null);
	expect(response.status).toBe(503);
	expect(await response.text()).toBe("");
});

it("answers 503 when an access check fails for another reason", async () => {
	const { id } = await file();
	const response = await reader(async () => {
		throw new Error("database down");
	}).read(id, null);
	expect(response.status).toBe(503);
});
```

- [ ] **Step 2: Run them.** `TEST_DATABASE_URL='...' npx vitest run tests/unit/byte-range.test.ts tests/integration/media.test.ts`. Expected: FAIL, modules not found.

- [ ] **Step 3: Create `src/lib/byte-range.ts`:**

```ts
// Chunks stay short enough for one function invocation; players ask for the next.
export const MAX_RANGE_BYTES = 8 * 1024 * 1024;

export type ParsedRange =
	| { kind: "full" }
	| { kind: "partial"; start: number; end: number }
	| { kind: "invalid" };

export function parseRange(header: string | null, size: number): ParsedRange {
	if (header === null) return { kind: "full" };
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match || (match[1] === "" && match[2] === "")) return { kind: "invalid" };
	let start: number;
	let end: number;
	if (match[1] === "") {
		const suffix = Number(match[2]);
		if (suffix === 0) return { kind: "invalid" };
		start = Math.max(size - suffix, 0);
		end = size - 1;
	} else {
		start = Number(match[1]);
		end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
	}
	if (start >= size || end < start) return { kind: "invalid" };
	return { kind: "partial", start, end: Math.min(end, start + MAX_RANGE_BYTES - 1) };
}
```

- [ ] **Step 4: Create `src/services/media.ts`:**

```ts
import "server-only";
import type { Database } from "../lib/database";
import type { MemberContext } from "../lib/auth-system";
import { parseRange } from "../lib/byte-range";
import type { ObjectStorage } from "../lib/storage";

// Anything else downloads with a neutral type, including active formats.
const INLINE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "application/pdf", "audio/mpeg"]);
const SANDBOX = "default-src 'none'; sandbox";
// Chrome's PDF viewer does not load under a sandbox policy.
const PDF_POLICY = "default-src 'none'; style-src 'unsafe-inline'; object-src 'self'";

const isAccessError = (error: unknown) =>
	error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message);
const empty = (status: number, headers: Record<string, string> = {}) =>
	new Response(null, { status, headers: { "Cache-Control": "private, no-store", ...headers } });

function disposition(inline: boolean, filename: string) {
	return `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function createMediaReader(
	db: Database,
	requireMember: () => Promise<MemberContext>,
	storage: () => ObjectStorage,
) {
	return {
		async read(id: string, rangeHeader: string | null): Promise<Response> {
			try {
				await requireMember();
			} catch (error) {
				return empty(isAccessError(error) ? 404 : 503);
			}
			try {
				const file = await db.mediaFile.findUnique({ where: { id } });
				if (file?.status !== "verified") return empty(404);
				const size = Number(file.sizeBytes);
				const range = parseRange(rangeHeader, size);
				if (range.kind === "invalid") return empty(416, { "Content-Range": `bytes */${size}` });
				const inline = INLINE_TYPES.has(file.mimeType);
				const headers: Record<string, string> = {
					"Cache-Control": "private, no-store",
					"X-Content-Type-Options": "nosniff",
					"Accept-Ranges": "bytes",
					"Content-Type": inline ? file.mimeType : "application/octet-stream",
					"Content-Disposition": disposition(inline, file.originalFilename),
					"Content-Security-Policy": file.mimeType === "application/pdf" ? PDF_POLICY : SANDBOX,
				};
				const objects = storage();
				if (range.kind === "partial") {
					const body = await objects.read(file.storageKey, { start: range.start, end: range.end });
					return new Response(body, {
						status: 206,
						headers: {
							...headers,
							"Content-Length": String(range.end - range.start + 1),
							"Content-Range": `bytes ${range.start}-${range.end}/${size}`,
						},
					});
				}
				const body = await objects.read(file.storageKey);
				return new Response(body, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
			} catch {
				return empty(503);
			}
		},
	};
}
```

Create `src/services/media-runtime.ts`:

```ts
import "server-only";
import { readStorageConfig } from "../lib/config";
import { database } from "../lib/runtime";
import { createR2Storage, type ObjectStorage } from "../lib/storage";
import { requireMember } from "./access";
import { createMediaReader } from "./media";

let storage: ObjectStorage | undefined;
let reader: ReturnType<typeof createMediaReader> | undefined;
export function mediaReader() {
	reader ??= createMediaReader(database(), requireMember, () => {
		storage ??= createR2Storage(readStorageConfig(process.env));
		return storage;
	});
	return reader;
}
```

Create `src/app/api/media/[id]/route.ts`, after reading `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`:

```ts
import { mediaReader } from "@/services/media-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return mediaReader().read(id, request.headers.get("range"));
}
```

- [ ] **Step 5: Run the tests.** Same command. Expected: PASS.

- [ ] **Step 6: Browser boundary test.** Append to `tests/e2e/sign-in.spec.ts`, using the file's fixtures:

```ts
test("the media route gives visitors the same 404 for any id", async ({ request }) => {
	const response = await request.get("/api/media/missing-id");
	expect(response.status()).toBe(404);
	expect(response.headers()["cache-control"]).toContain("no-store");
});
```

Run: `TEST_DATABASE_URL='...' npm run test:e2e -- tests/e2e/sign-in.spec.ts`. Expected: PASS.

- [ ] **Step 7: Commit.** `git commit -m "feat: stream private media with access checks on every request"`, with the listed files staged.

### Task 8: Measurement tool and docs

**Files:**
- Create: `scripts/media-measure.ts`
- Modify: `package.json`, `docs/OPERATIONS.md`, `docs/DEVELOPMENT.md`, `docs/HOSTING.md`
- Test: manual on Vercel (Gate B); a script typecheck here.

**Interfaces:**
- Consumes: `createR2Storage`, `readStorageConfig`, `createDatabase`.
- Produces: `npm run media:measure -- add|remove`.

- [ ] **Step 1: Create `scripts/media-measure.ts`:**

```ts
import { randomBytes } from "node:crypto";
import { createDatabase } from "../src/lib/database";
import { readStorageConfig } from "../src/lib/config";
import { createR2Storage } from "../src/lib/storage";

// Operator command for stage 2. Creates one private synthetic item with an
// audio and an image file of the collection's largest sizes, to measure real
// delivery on Vercel behind sign-in. `remove` deletes the database rows; delete
// the synthetic objects in the Cloudflare dashboard (the app key cannot).
const KOB_ID = "KOB-MEASURE";
const AUDIO_BYTES = 220 * 1024 * 1024;
const IMAGE_BYTES = 64 * 1024 * 1024;
// A silent MPEG-1 Layer III frame at 128 kbit/s, 44.1 kHz, repeated: valid MP3.
const FRAME = Buffer.alloc(417);
FRAME.set([0xff, 0xfb, 0x90, 0x00]);

const command = process.argv[2];
const url = process.env.DATABASE_URL;
if (!url || !["add", "remove"].includes(command ?? "")) {
	console.error("Usage: media:measure add|remove, with DATABASE_URL and R2 settings");
	process.exit(2);
}
const db = createDatabase(url);
try {
	if (command === "remove") {
		await db.item.deleteMany({ where: { kobId: KOB_ID } });
		console.log("Rows removed. Delete measure/* objects in the Cloudflare dashboard.");
	} else {
		const storage = createR2Storage(readStorageConfig(process.env));
		const audio = Buffer.alloc(AUDIO_BYTES - (AUDIO_BYTES % FRAME.length));
		for (let at = 0; at < audio.length; at += FRAME.length) FRAME.copy(audio, at);
		const image = randomBytes(IMAGE_BYTES);
		await storage.write("measure/audio", audio, "audio/mpeg");
		await storage.write("measure/image", image, "application/octet-stream");
		const item = await db.item.create({ data: { kobId: KOB_ID, reviewStatus: "needs_review" } });
		const revision = await db.itemRevision.create({
			data: { itemId: item.id, title: "Synthetic measurement item", types: ["other"], authorId: "system:import" },
		});
		await db.item.update({ where: { id: item.id }, data: { workingRevisionId: revision.id } });
		const add = (role: "original" | "display", storageKey: string, mimeType: string, size: number, name: string) =>
			db.mediaFile.create({
				data: {
					itemId: item.id, role, storageKey, mimeType, sizeBytes: BigInt(size), status: "verified", originalFilename: name,
				},
			});
		const a = await add("original", "measure/audio", "audio/mpeg", audio.length, "synthetic-audio.mp3");
		const b = await add("display", "measure/image", "application/octet-stream", image.length, "synthetic-image.bin");
		console.log(`Open while signed in: /api/media/${a.id} (play and seek), /api/media/${b.id} (download)`);
	}
} finally {
	await db.$disconnect();
}
```

Add to `package.json`: `"media:measure": "node --conditions=react-server --import tsx scripts/media-measure.ts"`.

- [ ] **Step 2: Update docs.** `docs/OPERATIONS.md`: map the settings in the secrets table (`KOBOB_R2_READ_ACCESS_KEY_ID`, `KOBOB_R2_READ_SECRET_ACCESS_KEY`, plus the write key and development key held only by the operator), and steps to create two private buckets with no public access or CORS, and three bucket-scoped keys. `docs/DEVELOPMENT.md`: media route rules. `docs/HOSTING.md`: mark R2 as provisioning, with the 2026-11-05 usage from the spec.

- [ ] **Step 3: Check and commit.** `TEST_DATABASE_URL='...' npm run check`. Expected: PASS. Then `git commit -m "chore: add a media delivery measurement tool"`, with the listed files staged.

### Gate B: stop for Yoram

- [ ] PR into `dev`, Codex review, reply, merge on Yoram's word, then a release on Yoram's go.
- [ ] Yoram provisions buckets and keys, adds the read-only production settings to Vercel via ops, and confirms health shows `storage: true`.
- [ ] Yoram runs `media:measure add` against production using the write key. While signed in, Yoram plays and seeks the audio, and downloads the image. Record in `docs/HOSTING.md`: time to complete, whether seeking worked, any failure, and Vercel usage. Run `media:measure remove`.
- [ ] **Stop condition:** if the 220 MB audio cannot play and seek, or the download fails within the 300 s limit on a normal connection, stop and bring options, costs and the access trade-off to Yoram before Task 9.

---

# Stage 3: file copy

Branch: `feat/media-copy`.

### Task 9: Formats and derivatives

**Files:**
- Create: `src/import/file-formats.ts`, `src/import/derive.ts`
- Modify: `package.json`, `package-lock.json`
- Test: `tests/unit/file-formats.test.ts`, `tests/unit/derive.test.ts`

**Interfaces:**
- Produces:
  - `verifiedMimeType(claimed: string, head: Uint8Array): string`
  - `needsThumbnail(mime: string): boolean`; `needsDisplayCopy(mime: string): boolean`
  - `makeThumbnail(input: Uint8Array): Promise<Derived>`; `makeDisplayCopy(input: Uint8Array): Promise<Derived>`; `type Derived = { bytes: Uint8Array; width: number; height: number; mimeType: "image/jpeg" }`

- [ ] **Step 1: Add `sharp` and write the failing tests.** Run `npm install --save-dev --save-exact sharp@0.35.5`. Then `tests/unit/file-formats.test.ts`:

```ts
import { expect, it } from "vitest";
import { needsDisplayCopy, needsThumbnail, verifiedMimeType } from "../../src/import/file-formats";

const magic: Record<string, number[]> = {
	"image/jpeg": [0xff, 0xd8, 0xff, 0xe0],
	"image/png": [0x89, 0x50, 0x4e, 0x47],
	"image/gif": [0x47, 0x49, 0x46, 0x38],
	"application/pdf": [0x25, 0x50, 0x44, 0x46],
	"image/tiff": [0x49, 0x49, 0x2a, 0x00],
};
it.each(Object.entries(magic))("keeps %s when the bytes agree", (mime, bytes) => {
	expect(verifiedMimeType(mime, Uint8Array.from(bytes))).toBe(mime);
});
it("accepts both MP3 openings", () => {
	expect(verifiedMimeType("audio/mpeg", Uint8Array.from([0x49, 0x44, 0x33, 0x04]))).toBe("audio/mpeg");
	expect(verifiedMimeType("audio/mpeg", Uint8Array.from([0xff, 0xfb, 0x90, 0x00]))).toBe("audio/mpeg");
});
it("accepts big-endian TIFF", () => {
	expect(verifiedMimeType("image/tiff", Uint8Array.from([0x4d, 0x4d, 0x00, 0x2a]))).toBe("image/tiff");
});
it.each(Object.keys(magic))("downgrades a spoofed %s", (mime) => {
	expect(verifiedMimeType(mime, Uint8Array.from([0x3c, 0x68, 0x74, 0x6d]))).toBe("application/octet-stream");
});
it("leaves formats it cannot verify unchanged, since they download anyway", () => {
	expect(verifiedMimeType("application/msword", Uint8Array.from([0, 0, 0, 0]))).toBe("application/msword");
});
it("derives from raster images except BMP", () => {
	for (const mime of ["image/jpeg", "image/png", "image/gif", "image/tiff"]) expect(needsThumbnail(mime)).toBe(true);
	expect(needsThumbnail("image/bmp")).toBe(false);
	expect(needsThumbnail("application/pdf")).toBe(false);
	expect(needsDisplayCopy("image/tiff")).toBe(true);
	expect(needsDisplayCopy("image/jpeg")).toBe(false);
});
```

`tests/unit/derive.test.ts`:

```ts
import sharp from "sharp";
import { expect, it } from "vitest";
import { makeDisplayCopy, makeThumbnail } from "../../src/import/derive";

const source = (format: "jpeg" | "tiff") =>
	sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#336699" } })
		.withExif({ IFD3: { GPSLatitude: "32/1 0/1 0/1" } })
		[format]()
		.toBuffer();

it("makes a small JPEG thumbnail without metadata", async () => {
	const result = await makeThumbnail(await source("jpeg"));
	expect(result).toMatchObject({ width: 400, height: 133, mimeType: "image/jpeg" });
	const meta = await sharp(result.bytes).metadata();
	expect(meta.format).toBe("jpeg");
	expect(meta.exif).toBeUndefined();
});

it("makes a display JPEG from a TIFF without enlarging or metadata", async () => {
	const result = await makeDisplayCopy(await source("tiff"));
	expect(result).toMatchObject({ width: 2400, height: 800, mimeType: "image/jpeg" });
	expect((await sharp(result.bytes).metadata()).exif).toBeUndefined();
	const small = await sharp({ create: { width: 100, height: 50, channels: 3, background: "#000" } }).tiff().toBuffer();
	expect(await makeDisplayCopy(small)).toMatchObject({ width: 100, height: 50 });
});

it("rejects corrupt input", async () => {
	await expect(makeThumbnail(Uint8Array.from([1, 2, 3]))).rejects.toThrow();
});
```

- [ ] **Step 2: Run them.** `npx vitest run tests/unit/file-formats.test.ts tests/unit/derive.test.ts`. Expected: FAIL.

- [ ] **Step 3: Create `src/import/file-formats.ts`:**

```ts
type Check = (head: Uint8Array) => boolean;
const opens = (...bytes: number[]): Check => (head) => bytes.every((byte, index) => head[index] === byte);
const verifiers: Record<string, Check[]> = {
	"image/jpeg": [opens(0xff, 0xd8, 0xff)],
	"image/png": [opens(0x89, 0x50, 0x4e, 0x47)],
	"image/gif": [opens(0x47, 0x49, 0x46, 0x38)],
	"application/pdf": [opens(0x25, 0x50, 0x44, 0x46)],
	"image/tiff": [opens(0x49, 0x49, 0x2a, 0x00), opens(0x4d, 0x4d, 0x00, 0x2a)],
	"audio/mpeg": [opens(0x49, 0x44, 0x33), (head) => head[0] === 0xff && (head[1] & 0xe0) === 0xe0],
};

// A claimed type that could display inline must match its bytes; otherwise the
// file is stored as neutral and only ever downloads.
export function verifiedMimeType(claimed: string, head: Uint8Array): string {
	const checks = verifiers[claimed];
	if (!checks) return claimed;
	return checks.some((check) => check(head)) ? claimed : "application/octet-stream";
}

const RASTER = new Set(["image/jpeg", "image/png", "image/gif", "image/tiff"]);
export const needsThumbnail = (mime: string) => RASTER.has(mime);
export const needsDisplayCopy = (mime: string) => mime === "image/tiff";
```

- [ ] **Step 4: Create `src/import/derive.ts`:**

```ts
import sharp from "sharp";

export type Derived = { bytes: Uint8Array; width: number; height: number; mimeType: "image/jpeg" };

// sharp drops embedded metadata such as GPS unless asked to keep it.
async function toJpeg(input: Uint8Array, maxWidth: number, quality: number): Promise<Derived> {
	const { data, info } = await sharp(input, { failOn: "error" })
		.rotate()
		.resize({ width: maxWidth, height: maxWidth, fit: "inside", withoutEnlargement: true })
		.flatten({ background: "#ffffff" })
		.jpeg({ quality })
		.toBuffer({ resolveWithObject: true });
	return { bytes: data, width: info.width, height: info.height, mimeType: "image/jpeg" };
}
export const makeThumbnail = (input: Uint8Array) => toJpeg(input, 400, 75);
export const makeDisplayCopy = (input: Uint8Array) => toJpeg(input, 2400, 85);
```

- [ ] **Step 5: Run them.** Same command. Expected: PASS.

- [ ] **Step 6: Commit.** `git commit -m "feat: verify file types and derive safe images"`, with the listed files staged.

### Task 10: Copy, verify and resume

**Files:**
- Create: `src/import/copy-media.ts`, `scripts/import-media.ts`
- Modify: `package.json`, `docs/DEVELOPMENT.md`
- Test: `tests/integration/copy-media.test.ts`

**Interfaces:**
- Consumes: `DriveClient`, `ObjectStorage`, `verifiedMimeType`, `needsThumbnail`, `needsDisplayCopy`, `makeThumbnail`, `makeDisplayCopy`, `catalog` columns.
- Produces: `copyMedia(db, drive, storage, { limit?: number, apply: boolean }): Promise<CopyReport>`; `type CopyReport = { considered: number; verified: number; failed: { kobId: string; code: string }[]; derivativesFailed: { kobId: string; code: string }[]; bytes: bigint }`.

- [ ] **Step 1: Write the failing test.** `tests/integration/copy-media.test.ts`:

```ts
import { createHash } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeEach, expect, it } from "vitest";
import { catalog as c } from "../../src/import/catalog-columns";
import { copyMedia } from "../../src/import/copy-media";
import type { DriveClient } from "../../src/import/drive";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import { createDatabase } from "../../src/lib/database";
import type { ObjectStorage } from "../../src/lib/storage";

const db = createDatabase(requireTestDatabaseUrl(process.env));
const clean = async () => {
	await db.importRun.deleteMany();
	await db.item.deleteMany();
};
beforeEach(clean);
afterAll(async () => {
	await clean();
	await db.$disconnect();
});

const toStream = (bytes: Uint8Array) => new Blob([bytes]).stream();
const collect = async (body: ReadableStream<Uint8Array> | Uint8Array) =>
	body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
function fakeStorage(tamper?: (key: string, bytes: Uint8Array) => Uint8Array) {
	const objects = new Map<string, Uint8Array>();
	const storage: ObjectStorage = {
		read: async (key) => toStream(objects.get(key) as Uint8Array),
		write: async (key, body) => {
			const bytes = await collect(body);
			objects.set(key, tamper ? tamper(key, bytes) : bytes);
		},
	};
	return { objects, storage };
}
const fakeDrive = (files: Record<string, Uint8Array>): DriveClient => ({
	readHead: async (id) => files[id].slice(0, 16),
	readStream: async (id) => {
		if (!files[id]) throw new Error("DRIVE_READ_FAILED_404");
		return toStream(files[id]);
	},
});
async function pending(kobId: string, bytes: Uint8Array, mimeType: string, extra: { sha256?: string; size?: bigint } = {}) {
	const item = await db.item.create({ data: { kobId } });
	await db.itemCatalogRecord.create({
		data: { itemId: item.id, tab: "catalog", snapshotHash: "h", row: { catalog: { [c.driveId]: kobId }, web: null } },
	});
	return db.mediaFile.create({
		data: {
			itemId: item.id, role: "original", storageKey: `originals/${item.id}`, mimeType,
			sizeBytes: extra.size ?? BigInt(bytes.length), sha256: extra.sha256, originalFilename: "synthetic",
		},
	});
}
const jpeg = () => sharp({ create: { width: 800, height: 400, channels: 3, background: "#123" } }).jpeg().toBuffer();
const tiff = () => sharp({ create: { width: 800, height: 400, channels: 3, background: "#123" } }).tiff().toBuffer();

it("does nothing on a dry run", async () => {
	const bytes = await jpeg();
	await pending("KOB-000001", bytes, "image/jpeg");
	const { objects, storage } = fakeStorage();
	const report = await copyMedia(db, fakeDrive({ "KOB-000001": bytes }), storage, { apply: false });
	expect(report.considered).toBe(1);
	expect(objects.size).toBe(0);
	expect((await db.mediaFile.findFirstOrThrow()).status).toBe("pending");
});

it("copies, hashes and verifies an original and creates a thumbnail", async () => {
	const bytes = await jpeg();
	const original = await pending("KOB-000001", bytes, "image/jpeg");
	const { objects, storage } = fakeStorage();
	const report = await copyMedia(db, fakeDrive({ "KOB-000001": bytes }), storage, { apply: true });
	expect(report.verified).toBe(1);
	const stored = await db.mediaFile.findUniqueOrThrow({ where: { id: original.id } });
	expect(stored.status).toBe("verified");
	expect(stored.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
	const thumbnail = await db.mediaFile.findFirstOrThrow({ where: { itemId: original.itemId, role: "thumbnail" } });
	expect(thumbnail).toMatchObject({ status: "verified", mimeType: "image/jpeg", width: 400 });
	expect(objects.has(thumbnail.storageKey)).toBe(true);
	expect(await db.mediaFile.count({ where: { itemId: original.itemId, role: "display" } })).toBe(0);
});

it("creates a display copy for a TIFF", async () => {
	const bytes = await tiff();
	const original = await pending("KOB-000002", bytes, "image/tiff");
	const { storage } = fakeStorage();
	await copyMedia(db, fakeDrive({ "KOB-000002": bytes }), storage, { apply: true });
	expect(await db.mediaFile.count({ where: { itemId: original.itemId, role: "display", status: "verified" } })).toBe(1);
});

it("records a size mismatch as failed", async () => {
	const bytes = await jpeg();
	await pending("KOB-000003", bytes, "image/jpeg", { size: 1n });
	const { storage } = fakeStorage();
	const report = await copyMedia(db, fakeDrive({ "KOB-000003": bytes }), storage, { apply: true });
	expect(report.failed).toEqual([{ kobId: "KOB-000003", code: "SIZE_MISMATCH" }]);
	expect(await db.mediaFile.findFirstOrThrow()).toMatchObject({ status: "failed", failureCode: "SIZE_MISMATCH" });
});

it("records a mismatch against a cataloged hash", async () => {
	const bytes = await jpeg();
	await pending("KOB-000004", bytes, "image/jpeg", { sha256: "0".repeat(64) });
	const { storage } = fakeStorage();
	const report = await copyMedia(db, fakeDrive({ "KOB-000004": bytes }), storage, { apply: true });
	expect(report.failed[0].code).toBe("HASH_MISMATCH");
});

it("fails when the stored bytes differ on read-back", async () => {
	const bytes = await jpeg();
	await pending("KOB-000005", bytes, "image/jpeg");
	const { storage } = fakeStorage((key, written) => (key.startsWith("originals/") ? written.slice(1) : written));
	const report = await copyMedia(db, fakeDrive({ "KOB-000005": bytes }), storage, { apply: true });
	expect(report.failed[0].code).toBe("VERIFY_MISMATCH");
});

it("keeps a failed Drive read explicit and retries it on the next run", async () => {
	const bytes = await jpeg();
	await pending("KOB-000006", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	expect((await copyMedia(db, fakeDrive({}), storage, { apply: true })).failed[0].code).toBe("DRIVE_READ_FAILED");
	const retry = await copyMedia(db, fakeDrive({ "KOB-000006": bytes }), storage, { apply: true });
	expect(retry.verified).toBe(1);
	expect(await db.mediaFile.findFirstOrThrow({ where: { role: "original" } })).toMatchObject({ status: "verified", failureCode: null });
});

it("skips verified files on a rerun", async () => {
	const bytes = await jpeg();
	await pending("KOB-000007", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	const drive = fakeDrive({ "KOB-000007": bytes });
	await copyMedia(db, drive, storage, { apply: true });
	expect((await copyMedia(db, drive, storage, { apply: true })).considered).toBe(0);
});

it("stores a spoofed inline type as neutral", async () => {
	const bytes = new TextEncoder().encode("<html><script>x</script>");
	await pending("KOB-000008", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	await copyMedia(db, fakeDrive({ "KOB-000008": bytes }), storage, { apply: true });
	expect((await db.mediaFile.findFirstOrThrow()).mimeType).toBe("application/octet-stream");
});

it("keeps a verified original when its derivative fails", async () => {
	const bytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
	await pending("KOB-000009", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	const report = await copyMedia(db, fakeDrive({ "KOB-000009": bytes }), storage, { apply: true });
	expect(report.verified).toBe(1);
	expect(report.derivativesFailed).toEqual([{ kobId: "KOB-000009", code: "DERIVATIVE_FAILED" }]);
});

it("honors a limit for a sample run and records counts only", async () => {
	const bytes = await jpeg();
	await pending("KOB-000010", bytes, "image/jpeg");
	await pending("KOB-000011", bytes, "image/jpeg");
	const { storage } = fakeStorage();
	const report = await copyMedia(db, fakeDrive({ "KOB-000010": bytes, "KOB-000011": bytes }), storage, { apply: true, limit: 1 });
	expect(report.considered).toBe(1);
	const run = await db.importRun.findFirstOrThrow({ where: { kind: "media" } });
	expect(JSON.stringify(run.counts)).not.toContain("KOB-");
});
```

- [ ] **Step 2: Run it.** `TEST_DATABASE_URL='...' npx vitest run tests/integration/copy-media.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Create `src/import/copy-media.ts`:**

```ts
import { createHash } from "node:crypto";
import type { Database } from "../lib/database";
import type { ObjectStorage } from "../lib/storage";
import { catalog as c } from "./catalog-columns";
import type { CatalogRow } from "./catalog-plan";
import { makeDisplayCopy, makeThumbnail, type Derived } from "./derive";
import type { DriveClient } from "./drive";
import { needsDisplayCopy, needsThumbnail, verifiedMimeType } from "./file-formats";

export type CopyReport = {
	considered: number;
	verified: number;
	failed: { kobId: string; code: string }[];
	derivativesFailed: { kobId: string; code: string }[];
	bytes: bigint;
};

class CopyError extends Error {}

async function readAll(stream: ReadableStream<Uint8Array>) {
	return new Uint8Array(await new Response(stream).arrayBuffer());
}
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function writeDerived(
	db: Database,
	storage: ObjectStorage,
	itemId: string,
	role: "thumbnail" | "display",
	filename: string,
	derived: Derived,
) {
	const storageKey = `${role}s/${itemId}.jpg`;
	await storage.write(storageKey, derived.bytes, derived.mimeType);
	const data = {
		storageKey,
		mimeType: derived.mimeType,
		sizeBytes: BigInt(derived.bytes.length),
		sha256: sha256(derived.bytes),
		width: derived.width,
		height: derived.height,
		status: "verified" as const,
		originalFilename: filename,
	};
	await db.mediaFile.upsert({
		where: { itemId_role: { itemId, role } },
		create: { itemId, role, ...data },
		update: data,
	});
}

export async function copyMedia(
	db: Database,
	drive: DriveClient,
	storage: ObjectStorage,
	{ apply, limit }: { apply: boolean; limit?: number },
): Promise<CopyReport> {
	const files = await db.mediaFile.findMany({
		where: { role: "original", status: { not: "verified" } },
		include: { item: { select: { kobId: true, catalogRecord: { select: { row: true } } } } },
		orderBy: { sizeBytes: "asc" },
		...(limit ? { take: limit } : {}),
	});
	const report: CopyReport = { considered: files.length, verified: 0, failed: [], derivativesFailed: [], bytes: 0n };
	if (!apply) return report;
	const startedAt = new Date();
	for (const file of files) {
		const kobId = file.item.kobId ?? file.itemId;
		try {
			const row = file.item.catalogRecord?.row as { catalog?: CatalogRow } | null;
			const driveId = row?.catalog?.[c.driveId];
			if (!driveId) throw new CopyError("MISSING_DRIVE_ID");
			let bytes: Uint8Array;
			try {
				bytes = await readAll(await drive.readStream(driveId));
			} catch {
				throw new CopyError("DRIVE_READ_FAILED");
			}
			if (BigInt(bytes.length) !== file.sizeBytes) throw new CopyError("SIZE_MISMATCH");
			const hash = sha256(bytes);
			if (file.sha256 && file.sha256.toLowerCase() !== hash) throw new CopyError("HASH_MISMATCH");
			const mimeType = verifiedMimeType(file.mimeType, bytes.subarray(0, 16));
			try {
				await storage.write(file.storageKey, bytes, mimeType);
			} catch {
				throw new CopyError("STORAGE_WRITE_FAILED");
			}
			let stored: Uint8Array;
			try {
				stored = await readAll(await storage.read(file.storageKey));
			} catch {
				throw new CopyError("STORAGE_READ_FAILED");
			}
			if (stored.length !== bytes.length || sha256(stored) !== hash) throw new CopyError("VERIFY_MISMATCH");
			await db.mediaFile.update({
				where: { id: file.id },
				data: { status: "verified", failureCode: null, sha256: hash, mimeType },
			});
			report.verified++;
			report.bytes += file.sizeBytes;
			try {
				if (needsThumbnail(mimeType))
					await writeDerived(db, storage, file.itemId, "thumbnail", file.originalFilename, await makeThumbnail(stored));
				if (needsDisplayCopy(mimeType))
					await writeDerived(db, storage, file.itemId, "display", file.originalFilename, await makeDisplayCopy(stored));
			} catch {
				report.derivativesFailed.push({ kobId, code: "DERIVATIVE_FAILED" });
			}
		} catch (error) {
			const code = error instanceof CopyError ? error.message : "COPY_FAILED";
			report.failed.push({ kobId, code });
			await db.mediaFile.update({ where: { id: file.id }, data: { status: "failed", failureCode: code } });
		}
	}
	await db.importRun.create({
		data: {
			kind: "media",
			snapshotHash: "",
			startedAt,
			finishedAt: new Date(),
			counts: {
				considered: report.considered,
				verified: report.verified,
				failed: report.failed.length,
				derivativesFailed: report.derivativesFailed.length,
				bytes: String(report.bytes),
			},
		},
	});
	return report;
}
```

Memory note: the largest file is about 220 MB and the script runs on Yoram's Mac, so buffering one file at a time is acceptable and keeps verification simple.

- [ ] **Step 4: Run it.** Same command. Expected: PASS.

- [ ] **Step 5: Create `scripts/import-media.ts`:**

```ts
import { writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { copyMedia } from "../src/import/copy-media";
import { createDriveClient } from "../src/import/drive";
import { readStorageConfig } from "../src/lib/config";
import { createDatabase } from "../src/lib/database";
import { createR2Storage } from "../src/lib/storage";

// Operator command. Dry run unless --apply and --confirm-host match. Drive is
// only read. Prints counts; row detail goes to the report outside the repository.
const { values } = parseArgs({
	options: {
		report: { type: "string" },
		"drive-key": { type: "string" },
		limit: { type: "string" },
		apply: { type: "boolean", default: false },
		"confirm-host": { type: "string" },
	},
});
const { report: reportPath, "drive-key": driveKey } = values;
const databaseUrl = process.env.DATABASE_URL;
if (!reportPath || !driveKey || !databaseUrl) {
	console.error("Needs --report --drive-key, DATABASE_URL and R2 settings");
	process.exit(2);
}
if (!relative(process.cwd(), resolve(reportPath)).startsWith("..")) {
	console.error("--report must be outside the repository");
	process.exit(2);
}
const host = new URL(databaseUrl).host;
if (values.apply && values["confirm-host"] !== host) {
	console.error(`--apply needs --confirm-host=${host}`);
	process.exit(2);
}
const config = readStorageConfig(process.env);
console.log(`Database host: ${host}. Bucket: ${config.bucket}. Mode: ${values.apply ? "APPLY" : "dry run"}`);
const db = createDatabase(databaseUrl);
try {
	const report = await copyMedia(db, createDriveClient(driveKey), createR2Storage(config), {
		apply: Boolean(values.apply),
		...(values.limit ? { limit: Number(values.limit) } : {}),
	});
	writeFileSync(reportPath, JSON.stringify({ ...report, bytes: String(report.bytes) }, null, 2));
	console.log({
		considered: report.considered,
		verified: report.verified,
		failed: report.failed.length,
		derivativesFailed: report.derivativesFailed.length,
		bytes: String(report.bytes),
	});
} finally {
	await db.$disconnect();
}
```

Add to `package.json`: `"import:media": "node --conditions=react-server --import tsx scripts/import-media.ts"`. Add the command and its report rule to `docs/DEVELOPMENT.md`.

- [ ] **Step 6: Check and commit.** `TEST_DATABASE_URL='...' npm run check`. Expected: PASS. Then `git commit -m "feat: copy and verify media with resumable runs"`, with the listed files staged.

### Gate C: stop for Yoram

- [ ] PR into `dev`, Codex review, reply, merge on Yoram's word. No release is needed for the script.
- [ ] On Yoram's go, run on a sample against production with the write key: `--limit 20 --apply --confirm-host=<host>`. Check by query that those rows are `verified`. Confirm one thumbnail and one original through `/api/media/<id>` signed in.
- [ ] On Yoram's go, run everything. Rerun until only genuine failures remain; they stay `failed` and go to Yoram.
- [ ] Reconcile and record in `docs/HOSTING.md` and the migration doc, counts only: files verified against 1,129, bytes against metadata, failures, derivative bytes, and the R2 total against the 10 GB allowance. Duplicate name-and-size candidates are reported, never merged.

---

# Stage 4: review pages

Branch: `feat/review-pages`.

### Task 11: Paged family list

**Files:**
- Modify: `src/services/editorial.ts`, `src/app/family/page.tsx`, `src/locales/he.ts`
- Test: `tests/integration/editorial.test.ts`, `tests/e2e/editorial.spec.ts`

**Interfaces:**
- Produces: `editorialService().listItemsPage({ page: number; needsReview: boolean }): Promise<ItemPage>`; `type ItemPage = { items: (ItemSummary & { reviewStatus: "needs_review" | "reviewed"; thumbnailId: string | null })[]; page: number; pageCount: number; total: number }`; `ITEMS_PER_PAGE = 50`.

- [ ] **Step 1: Write the failing test.** Append to `tests/integration/editorial.test.ts`:

```ts
it("pages active items and filters by needing review, with stable order", async () => {
	const service = await serviceFor("pages@example.test");
	for (let index = 0; index < 52; index++) await rawCreate(service);
	const needing = await db.item.findMany({ take: 3, orderBy: { id: "asc" } });
	await db.item.updateMany({ where: { id: { in: needing.map((i) => i.id) } }, data: { reviewStatus: "needs_review" } });

	const first = await service.listItemsPage({ page: 1, needsReview: false });
	const second = await service.listItemsPage({ page: 2, needsReview: false });
	expect(first.items).toHaveLength(50);
	expect(second.items).toHaveLength(2);
	expect(first).toMatchObject({ page: 1, pageCount: 2, total: 52 });
	expect(new Set([...first.items, ...second.items].map((i) => i.id)).size).toBe(52);

	const filtered = await service.listItemsPage({ page: 1, needsReview: true });
	expect(filtered.total).toBe(3);
	expect(filtered.items.every((item) => item.reviewStatus === "needs_review")).toBe(true);
});

it("clamps a page out of range and returns only a verified thumbnail", async () => {
	const service = await serviceFor("thumbs@example.test");
	const { id } = await rawCreate(service);
	const thumbnail = await db.mediaFile.create({
		data: { itemId: id, role: "thumbnail", storageKey: `t/${id}`, mimeType: "image/jpeg", sizeBytes: 1n, originalFilename: "t", status: "verified" },
	});
	const result = await service.listItemsPage({ page: 99, needsReview: false });
	expect(result.page).toBe(1);
	expect(result.items[0].thumbnailId).toBe(thumbnail.id);
	await db.mediaFile.update({ where: { id: thumbnail.id }, data: { status: "failed" } });
	expect((await service.listItemsPage({ page: 1, needsReview: false })).items[0].thumbnailId).toBeNull();
});
```

- [ ] **Step 2: Run it.** `TEST_DATABASE_URL='...' npx vitest run tests/integration/editorial.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** In `src/services/editorial.ts` add:

```ts
export const ITEMS_PER_PAGE = 50;
export type ItemPage = {
	items: (ItemSummary & { reviewStatus: ReviewValue; thumbnailId: string | null })[];
	page: number;
	pageCount: number;
	total: number;
};
```

and to the returned service:

```ts
		listItemsPage: ({ page, needsReview }: { page: number; needsReview: boolean }) =>
			run(async (tx): Promise<ItemPage> => {
				const where = {
					state: "active" as const,
					...(needsReview ? { reviewStatus: "needs_review" as const } : {}),
				};
				const total = await tx.item.count({ where });
				const pageCount = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
				const current = Number.isInteger(page) && page >= 1 && page <= pageCount ? page : 1;
				const items = await tx.item.findMany({
					where,
					include: {
						workingRevision: { select: { title: true } },
						files: { where: { role: "thumbnail", status: "verified" }, select: { id: true } },
					},
					orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
					skip: (current - 1) * ITEMS_PER_PAGE,
					take: ITEMS_PER_PAGE,
				});
				return {
					page: current,
					pageCount,
					total,
					items: items.map((item) => ({
						id: item.id,
						title: item.workingRevision?.title ?? "",
						visibility: item.visibility,
						hasUnpublishedEdits: unpublishedEdits(item),
						reviewStatus: item.reviewStatus,
						thumbnailId: item.files[0]?.id ?? null,
					})),
				};
			}),
```

Note: `unpublishedEdits` reads `workingRevisionId` and `publishedRevisionId` from the row; `include` keeps both. `listItems` stays in use by tests and is removed only if nothing references it after this task (`grep -rn "listItems()" src tests`).

- [ ] **Step 4: Run it.** Same command. Expected: PASS.

- [ ] **Step 5: Add Hebrew strings** to `items` in `src/locales/he.ts`:

```ts
		// Pending Yoram's approval (media import, stage 4).
		showNeedsReview: "הצגת פריטים לבדיקה",
		showAll: "הצגת כל הפריטים",
		previousPage: "הקודם",
		nextPage: "הבא",
		pageOf: (page: number, count: number) => `עמוד ${page} מתוך ${count}`,
		noPreview: "אין תצוגה מקדימה עדיין.",
		download: "הורדת הקובץ",
		openFile: "פתיחת הקובץ",
		fileNotCopied: "הקובץ עדיין לא הועתק.",
		fileFailed: "העתקת הקובץ נכשלה.",
		catalog: "מהקטלוג",
```

- [ ] **Step 6: Update `src/app/family/page.tsx`.** Change the signature and data loading:

```tsx
export default async function Family({
	searchParams,
}: {
	searchParams: Promise<{ page?: string; review?: string }>;
}) {
	const query = await searchParams;
	const needsReview = query.review === "1";
	let member: Awaited<ReturnType<typeof requireMember>>;
	let list: Awaited<ReturnType<ReturnType<typeof editorialService>["listItemsPage"]>>;
	try {
		member = await requireMember();
		list = await editorialService().listItemsPage({ page: Number(query.page ?? "1"), needsReview });
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		throw new Error(copy.error);
	}
	const href = (page: number, review = needsReview) =>
		`/family?${new URLSearchParams({ ...(page > 1 ? { page: String(page) } : {}), ...(review ? { review: "1" } : {}) })}`;
```

Replace the list section with:

```tsx
						<h2>{copy.items.list}</h2>
						<p>
							<Link href={href(1, !needsReview)}>
								{needsReview ? copy.items.showAll : copy.items.showNeedsReview}
							</Link>
						</p>
						{list.items.length === 0 ? (
							<p>{copy.items.none}</p>
						) : (
							<ul>
								{list.items.map((item) => (
									<li key={item.id}>
										{item.thumbnailId && (
											// Private bytes behind an authenticated route, so not next/image.
											<img src={`/api/media/${item.thumbnailId}`} alt="" width={80} loading="lazy" />
										)}{" "}
										<Link href={`/family/items/${item.id}/edit`}>{item.title}</Link>{" "}
										· {item.visibility === "public" ? copy.items.public : copy.items.private}
										{item.reviewStatus === "needs_review" && ` · ${copy.items.reviewNames.needs_review}`}
										{item.hasUnpublishedEdits && ` · ${copy.items.unpublishedEdits}`}
									</li>
								))}
							</ul>
						)}
						{list.pageCount > 1 && (
							<nav aria-label={copy.items.list}>
								{list.page > 1 && <Link href={href(list.page - 1)}>{copy.items.previousPage}</Link>}{" "}
								{copy.items.pageOf(list.page, list.pageCount)}{" "}
								{list.page < list.pageCount && <Link href={href(list.page + 1)}>{copy.items.nextPage}</Link>}
							</nav>
						)}
```

The empty alt is deliberate: the title link beside it names the item. Biome's lint result decides whether a `biome-ignore` is needed for `<img>`; if so, use one with this reason.

- [ ] **Step 7: Browser test.** Append to `tests/e2e/editorial.spec.ts`:

```ts
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
```

Run: `TEST_DATABASE_URL='...' npm run test:e2e -- tests/e2e/editorial.spec.ts`. Expected: PASS.

- [ ] **Step 8: Commit.** `git commit -m "feat: page the family list and filter items needing review"`, with the listed files staged.

### Task 12: File, source and catalog on the item page

**Files:**
- Modify: `src/services/editorial.ts`, `src/app/family/items/[id]/edit/page.tsx`, `docs/DEVELOPMENT.md`, `docs/SESSION-HANDOFF.md`, `docs/ROADMAP.md`, `docs/DATA-MIGRATION.md`
- Create: `src/components/item-media.tsx`, `src/components/item-catalog.tsx`
- Test: `tests/integration/editorial.test.ts`, `tests/e2e/editorial.spec.ts`

**Interfaces:**
- Consumes: `familyVisibleColumns`, `copy.items.*`, `isSafeSourceUrl`.
- Produces: `FamilyItem.files: FamilyFile[]`, `FamilyItem.sources: FamilySource[]`, `FamilyItem.catalog: { label: string; value: string }[]`; `type FamilyFile = { id: string; role: "original" | "thumbnail" | "display"; mimeType: string; status: "pending" | "verified" | "failed"; originalFilename: string }`; `type FamilySource = { url: string; publisher: string; author: string; publishedText: string; license: string }`.

- [ ] **Step 1: Write the failing test.** Append to `tests/integration/editorial.test.ts`:

```ts
it("gives the family an item's files, sources and chosen catalog columns only", async () => {
	const service = await serviceFor("details@example.test");
	const { id } = await rawCreate(service);
	await db.mediaFile.create({
		data: { itemId: id, role: "original", storageKey: `originals/${id}`, mimeType: "image/jpeg", sizeBytes: 1n, originalFilename: "synthetic.jpg", status: "verified" },
	});
	await db.externalSource.create({ data: { itemId: id, url: "https://example.test/a", publisher: "Press" } });
	await db.itemCatalogRecord.create({
		data: { itemId: id, tab: "catalog", snapshotHash: "h", row: { catalog: { "תיקייה": "synthetic-folder", "מזהה Drive": "SECRET-ID", "זכויות": "" }, web: null } },
	});
	const item = await service.getItem(id);
	expect(item.files).toEqual([
		{ id: expect.any(String), role: "original", mimeType: "image/jpeg", status: "verified", originalFilename: "synthetic.jpg" },
	]);
	expect(item.sources[0]).toMatchObject({ url: "https://example.test/a", publisher: "Press" });
	expect(item.catalog).toEqual([{ label: "תיקייה", value: "synthetic-folder" }]);
	expect(JSON.stringify(item)).not.toContain("originals/");
	expect(JSON.stringify(item)).not.toContain("SECRET-ID");
});

it("falls back to the web summary for an internet record's catalog view", async () => {
	const service = await serviceFor("web@example.test");
	const { id } = await rawCreate(service);
	await db.itemCatalogRecord.create({
		data: { itemId: id, tab: "catalog", snapshotHash: "h", row: { catalog: {}, web: { "תקציר והערות אימות": "Synthetic summary" } } },
	});
	expect((await service.getItem(id)).catalog).toEqual([{ label: "תקציר והערות אימות", value: "Synthetic summary" }]);
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement.** Add `"תקציר והערות אימות"` handling in `src/import/catalog-columns.ts`:

```ts
export const familyVisibleWebColumns = ["תקציר והערות אימות", "השלמה נדרשת"] as const;
```

In `src/services/editorial.ts`, add the `FamilyFile` and `FamilySource` types, add `files`, `sources` and `catalog` to `FamilyItem`, and change `getItem`'s `include`:

```ts
					include: {
						workingRevision: { include: revisionInclude },
						files: {
							select: { id: true, role: true, mimeType: true, status: true, originalFilename: true },
							orderBy: { role: "asc" },
						},
						sources: {
							select: { url: true, publisher: true, author: true, publishedText: true, license: true },
							orderBy: { id: "asc" },
						},
						catalogRecord: { select: { row: true } },
					},
```

and add these fields to its return value:

```ts
						files: item.files,
						sources: item.sources,
						catalog: catalogView(item.catalogRecord?.row),
```

with this helper above `createEditorialService`, importing the two column lists from `../import/catalog-columns`:

```ts
// Verbatim values only, from an explicit column list: ids and links stay out.
function catalogView(row: unknown) {
	const { catalog = {}, web = {} } = (row ?? {}) as {
		catalog?: Record<string, string>;
		web?: Record<string, string> | null;
	};
	const pick = (source: Record<string, string> | null, labels: readonly string[]) =>
		labels.flatMap((label) => {
			const value = source?.[label]?.trim();
			return value ? [{ label, value }] : [];
		});
	return [...pick(catalog, familyVisibleColumns), ...pick(web, familyVisibleWebColumns)];
}
```

- [ ] **Step 4: Run it.** Expected: PASS.

- [ ] **Step 5: Create `src/components/item-media.tsx`:**

```tsx
import type { FamilyFile } from "@/services/editorial";
import { copy } from "@/locales/he";

const url = (file: FamilyFile) => `/api/media/${file.id}`;
const BROWSER_IMAGES = new Set(["image/jpeg", "image/png", "image/gif"]);

// Family-only. The route checks membership again on every read.
export function ItemMedia({ files }: { files: FamilyFile[] }) {
	const original = files.find((file) => file.role === "original");
	if (!original) return null;
	if (original.status === "pending") return <p>{copy.items.fileNotCopied}</p>;
	if (original.status === "failed") return <p>{copy.items.fileFailed}</p>;
	const display = files.find((file) => file.role === "display" && file.status === "verified");
	const download = <a href={url(original)}>{copy.items.download}: {original.originalFilename}</a>;
	if (display || BROWSER_IMAGES.has(original.mimeType))
		return (
			<figure>
				<img src={url(display ?? original)} alt={original.originalFilename} style={{ maxWidth: "100%" }} />
				<figcaption>{download}</figcaption>
			</figure>
		);
	if (original.mimeType === "audio/mpeg")
		return (
			<figure>
				{/* biome-ignore lint/a11y/useMediaCaption: unheard family recordings have no captions yet */}
				<audio controls preload="metadata" src={url(original)} />
				<figcaption>{download}</figcaption>
			</figure>
		);
	if (original.mimeType === "application/pdf")
		return (
			<p>
				<a href={url(original)} target="_blank" rel="noopener">
					{copy.items.openFile}: {original.originalFilename}
				</a>
			</p>
		);
	return (
		<p>
			{copy.items.noPreview} {download}
		</p>
	);
}
```

Create `src/components/item-catalog.tsx`:

```tsx
import type { FamilyItem } from "@/services/editorial";
import { isSafeSourceUrl } from "@/lib/source-url";
import { copy } from "@/locales/he";

// Labels and values are the catalog's own Hebrew text, shown verbatim.
export function ItemCatalog({ item }: { item: FamilyItem }) {
	return (
		<section>
			{item.sources.filter((source) => isSafeSourceUrl(source.url)).map((source) => (
				<p key={source.url}>
					{source.publisher && `${copy.items.publisher}: ${source.publisher} · `}
					{source.author && `${copy.items.author}: ${source.author} · `}
					<a href={source.url} rel="noopener noreferrer" target="_blank">
						{copy.items.sourceLink}
					</a>
				</p>
			))}
			{item.catalog.length > 0 && (
				<>
					<h2>{copy.items.catalog}</h2>
					<dl>
						{item.catalog.map(({ label, value }) => (
							<div key={label}>
								<dt>{label}</dt>
								<dd style={{ whiteSpace: "pre-line" }}>{value}</dd>
							</div>
						))}
					</dl>
				</>
			)}
		</section>
	);
}
```

In the edit page, render `<ItemMedia files={item.files} />` directly under the visibility paragraph, and `<ItemCatalog item={item} />` directly above `ItemStatusActions`.

- [ ] **Step 6: Browser test.** Append to `tests/e2e/editorial.spec.ts`:

```ts
test("the item page reports file state honestly and shows catalog values", async ({ page }) => {
	await signIn(page, "item-page@example.test");
	const id = await createItem(page, "Synthetic item page");
	await db.mediaFile.create({
		data: { itemId: id, role: "original", storageKey: `originals/${id}`, mimeType: "image/jpeg", sizeBytes: 1n, originalFilename: "synthetic.jpg" },
	});
	await db.itemCatalogRecord.create({
		data: { itemId: id, tab: "catalog", snapshotHash: "h", row: { catalog: { "תיקייה": "synthetic-folder" }, web: null } },
	});
	await page.reload();
	await expect(page.getByText(copy.items.fileNotCopied)).toBeVisible();
	await expect(page.getByText("synthetic-folder")).toBeVisible();
	await db.mediaFile.updateMany({ where: { itemId: id }, data: { status: "verified", mimeType: "application/msword" } });
	await page.reload();
	await expect(page.getByText(copy.items.noPreview)).toBeVisible();
	await db.mediaFile.updateMany({ where: { itemId: id }, data: { mimeType: "image/jpeg" } });
	await page.reload();
	await expect(page.getByRole("img", { name: "synthetic.jpg" })).toHaveAttribute("src", /^\/api\/media\//);
	expect(await page.content()).not.toContain("originals/");
});

test("a visitor sees nothing from the catalog on a public card", async ({ page, browser }) => {
	const member = await newMemberPage(browser, "card@example.test");
	const id = await createItem(member, "Synthetic public card");
	await db.itemCatalogRecord.create({
		data: { itemId: id, tab: "catalog", snapshotHash: "h", row: { catalog: { "תיקייה": "PRIVATE-FOLDER" }, web: null } },
	});
	await db.externalSource.create({ data: { itemId: id, url: "https://example.test/a", publisher: "Synthetic Press" } });
	await member.reload();
	await member.getByRole("button", { name: copy.items.publish }).click();
	await expect(member.getByText(copy.items.public).first()).toBeVisible();
	await page.goto(`/items/${id}`);
	await expect(page.getByRole("link", { name: copy.items.sourceLink })).toHaveAttribute("rel", "noopener noreferrer");
	expect(await page.content()).not.toContain("PRIVATE-FOLDER");
});
```

Run: `TEST_DATABASE_URL='...' npm run test:e2e -- tests/e2e/editorial.spec.ts`. Expected: PASS.

- [ ] **Step 7: Update docs.** `docs/DEVELOPMENT.md`: implemented scope and checks with actual counts. `docs/ROADMAP.md`: phases 3 and 4 status. `docs/DATA-MIGRATION.md`: which stages ran, with evidence. `docs/SESSION-HANDOFF.md`: next work, which is the timeline after family review begins.

- [ ] **Step 8: Full check and commit.** `TEST_DATABASE_URL='...' npm run check`. Expected: PASS. Then `git commit -m "feat: show files, sources and catalog on the family item page"`, with the listed files staged.

### Gate D: stop for Yoram

- [ ] PR into `dev`, Codex review, reply, merge on Yoram's word.
- [ ] Yoram approves the Hebrew strings, and gives the go for a release.
- [ ] After release, verify as a signed-in member: list pages, thumbnails, a JPEG, a TIFF display copy, an MP3 with seeking, a PDF, a download-only document. Verify as an anonymous visitor: `/api/media/<id>` gives 404. Revoke a synthetic member and confirm the next file request gives 404. Record results in OPERATIONS.md.
