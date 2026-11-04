# Item Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Family members create, edit, publish, make private, archive and restore archive items with dates, people, places, types and tags; visitors see only the published version, per [the design](../specs/2026-11-03-item-editing-design.md).

**Architecture:** Prisma models `Item` → `ItemRevision` (working and published pointers), shared `Person` and `Place` lists linked per revision, and `EditorialAudit`. `src/services/editorial.ts` holds every family read and mutation behind `requireMember` plus an in-transaction membership recheck and an expected-`version` guard; `src/services/archive.ts` is the only public reader and selects published-revision fields only. Next.js server pages and thin server actions sit on top; client components keep form input in React state so a failed save never loses it.

**Tech Stack:** Next.js 16.4.3 App Router (webpack), React 19.3.1, Prisma 7.10.1 with `@prisma/adapter-pg`, PostgreSQL 17, zod 4.6.7, Vitest 4, Playwright 1.64, Biome 2.6.4. Node 24.

## Global Constraints

- English code, comments and docs; Hebrew interface. Every new user-facing string goes in `src/locales/he.ts` under `copy.items` and is **proposed** wording: the PR must list it for Yoram's approval.
- No real names, places, addresses or family content anywhere in tests or fixtures; use synthetic values (e.g. `Synthetic Person`, `Synthetic Place`, `@example.test`).
- Limits, verbatim from the spec: title 1–200 characters; description up to 20,000; 1–8 types; up to 30 tags of up to 50 characters; up to 50 people and 50 places per item. A `range` needs `dateEnd` ≥ `dateStart`; `unknown` has no date values; precision applies to both ends. Latitude and longitude are both set or both empty.
- Item types, verbatim: `picture`, `video`, `audio`, `drawing`, `article`, `interview`, `document`, `other`.
- An item is public only when `visibility = public`, `state = active` and `publishedRevisionId` is set. Public reads use only the published revision, places, and people with `familyOnly = false`.
- Make private and archive set `publishedRevisionId = null`. Restore leaves the item private.
- Every item, person and place mutation names an expected `version`; a mismatch changes nothing and fails with `CONFLICT`.
- Every editorial service call checks membership (active, verified, same `accessVersion`) inside its transaction.
- Audit rows carry ids and action names only, never titles, descriptions or names.
- Dependencies are pinned exactly; this plan adds none.
- Follow the existing patterns: `src/services/members.ts` (service factory + in-transaction recheck), `src/services/member-runtime.ts` (runtime wiring), `src/components/member-form.tsx` (`useActionState`).

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | New enums and models |
| `prisma/migrations/20261103000000_item_editing/migration.sql` (create) | Generated SQL for the new models |
| `src/services/item-input.ts` (create) | zod schemas and input types for items, people, places |
| `src/services/item-view.ts` (create) | Shared revision include and row → view mapping |
| `src/services/editorial.ts` (create) | Family service: items, lifecycle, people, places, audit |
| `src/services/archive.ts` (create) | Public reader |
| `src/services/editorial-runtime.ts` (create) | Runtime wiring for both services |
| `src/lib/format-date.ts` (create) | Hebrew display of a stored date |
| `src/app/family/items/actions.ts` (create) | Server actions for items, people and places |
| `src/components/item-form.tsx` (create) | Item form with conflict panel |
| `src/components/record-picker.tsx` (create) | Search-and-add picker for people and places |
| `src/components/item-actions.tsx` (create) | Lifecycle buttons |
| `src/components/person-form.tsx`, `src/components/place-form.tsx` (create) | Edit forms for the lists |
| `src/app/family/page.tsx` (modify) | Item list and links |
| `src/app/family/items/new/page.tsx`, `src/app/family/items/[id]/edit/page.tsx`, `src/app/family/archived/page.tsx`, `src/app/family/people/page.tsx`, `src/app/family/places/page.tsx` (create) | Family screens |
| `src/app/archive/page.tsx` (modify), `src/app/archive/[id]/page.tsx` (create) | Public screens |
| `src/locales/he.ts` (modify) | Proposed Hebrew strings |
| `tests/unit/item-input.test.ts`, `tests/unit/format-date.test.ts` | Unit tests |
| `tests/integration/editorial.test.ts`, `tests/integration/archive.test.ts` | PostgreSQL tests |
| `tests/e2e/editorial.spec.ts` | Browser flows |

One addition beyond the spec's table: `Item.publishedAt` (set on publish, cleared on make-private/archive) so the public list is ordered by publication, not by private edit activity, which would otherwise leak that someone is editing.

## Local test environment

Integration and browser tests need the test database:

```bash
nvm use 24   # or select Node 24 another way; the machine default may be 20
npm run db:test:up
export TEST_DATABASE_URL='postgresql://kobob_test:synthetic-local-test-only@127.0.0.1:55439/kobob_test'
npm run db:test:migrate
```

This is the synthetic local URL from `docs/DEVELOPMENT.md` → Isolated test database; `requireTestDatabaseUrl` refuses anything that is not a loopback `kobob_test` database. Never point tests at a production URL.

---

### Task 1: Schema, migration and input validation

**Files:**
- Modify: `prisma/schema.prisma` (append after `MembershipAudit`)
- Create: `prisma/migrations/20261103000000_item_editing/migration.sql`
- Create: `src/services/item-input.ts`
- Test: `tests/unit/item-input.test.ts`

**Interfaces:**
- Produces: Prisma models `Item`, `ItemRevision`, `Person`, `Place`, `ItemRevisionPerson`, `ItemRevisionPlace`, `EditorialAudit`; enums `ItemState`, `ItemVisibility`, `ItemType`, `DateKind`, `DatePrecision`.
- Produces from `src/services/item-input.ts`: `itemTypes` (readonly tuple), `ItemTypeValue`, `itemInputSchema`, `ItemInput` (`z.input`), `ParsedItem` (`z.output`), `DateValue` (`ParsedItem["date"]`), `personInputSchema`, `PersonInput`, `placeInputSchema`, `PlaceInput`.

- [ ] **Step 1: Add the models to `prisma/schema.prisma`**

Append:

```prisma
enum ItemState {
  active
  archived
}
enum ItemVisibility {
  private
  public
}
enum ItemType {
  picture
  video
  audio
  drawing
  article
  interview
  document
  other
}
enum DateKind {
  unknown
  single
  range
}
enum DatePrecision {
  day
  month
  year
  decade
}
// workingRevisionId is nullable only because the item row must exist before
// its first revision; the editorial service always sets it in the same transaction.
model Item {
  id                  String         @id @default(cuid())
  kobId               String?        @unique
  state               ItemState      @default(active)
  visibility          ItemVisibility @default(private)
  version             Int            @default(1)
  workingRevisionId   String?        @unique
  publishedRevisionId String?        @unique
  publishedAt         DateTime?
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt
  revisions           ItemRevision[] @relation("ItemRevisions")
  workingRevision     ItemRevision?  @relation("WorkingRevision", fields: [workingRevisionId], references: [id])
  publishedRevision   ItemRevision?  @relation("PublishedRevision", fields: [publishedRevisionId], references: [id])
  @@index([state, visibility])
}
model ItemRevision {
  id              String               @id @default(cuid())
  itemId          String
  item            Item                 @relation("ItemRevisions", fields: [itemId], references: [id], onDelete: Cascade)
  title           String
  description     String               @default("")
  types           ItemType[]
  dateKind        DateKind             @default(unknown)
  dateStart       DateTime?            @db.Date
  dateEnd         DateTime?            @db.Date
  datePrecision   DatePrecision?
  dateApproximate Boolean              @default(false)
  tags            String[]
  authorId        String
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  people          ItemRevisionPerson[]
  places          ItemRevisionPlace[]
  workingFor      Item?                @relation("WorkingRevision")
  publishedFor    Item?                @relation("PublishedRevision")
  @@index([itemId])
}
model Person {
  id         String               @id @default(cuid())
  name       String
  otherNames String[]
  familyOnly Boolean              @default(false)
  version    Int                  @default(1)
  createdAt  DateTime             @default(now())
  updatedAt  DateTime             @updatedAt
  revisions  ItemRevisionPerson[]
}
model Place {
  id         String              @id @default(cuid())
  name       String
  otherNames String[]
  latitude   Float?
  longitude  Float?
  version    Int                 @default(1)
  createdAt  DateTime            @default(now())
  updatedAt  DateTime            @updatedAt
  revisions  ItemRevisionPlace[]
}
model ItemRevisionPerson {
  revisionId String
  personId   String
  revision   ItemRevision @relation(fields: [revisionId], references: [id], onDelete: Cascade)
  person     Person       @relation(fields: [personId], references: [id], onDelete: Restrict)
  @@id([revisionId, personId])
  @@index([personId])
}
model ItemRevisionPlace {
  revisionId String
  placeId    String
  revision   ItemRevision @relation(fields: [revisionId], references: [id], onDelete: Cascade)
  place      Place        @relation(fields: [placeId], references: [id], onDelete: Restrict)
  @@id([revisionId, placeId])
  @@index([placeId])
}
// Ids and action names only: never titles, descriptions or names.
model EditorialAudit {
  id         String   @id @default(cuid())
  actorId    String
  targetType String
  targetId   String
  action     String
  createdAt  DateTime @default(now())
  @@index([targetId])
}
```

- [ ] **Step 2: Generate the migration SQL**

```bash
mkdir -p prisma/migrations/20261103000000_item_editing
git show origin/dev:prisma/schema.prisma > "$TMPDIR/kobob-old-schema.prisma"
npx prisma migrate diff --from-schema "$TMPDIR/kobob-old-schema.prisma" --to-schema prisma/schema.prisma --script > prisma/migrations/20261103000000_item_editing/migration.sql
```

Expected: the file starts with `-- CreateEnum` and contains `CREATE TABLE "Item"`, `"ItemRevision"`, `"Person"`, `"Place"`, `"ItemRevisionPerson"`, `"ItemRevisionPlace"`, `"EditorialAudit"` and the foreign keys. It must not drop or alter any existing table. If your Prisma CLI names the flags differently, run `npx prisma migrate diff --help` and use the schema-to-schema form.

- [ ] **Step 3: Apply it to the test database and confirm no drift**

```bash
npm run db:test:migrate
npm run typecheck
```

Expected: `migrate deploy` applies `20261103000000_item_editing`; typecheck passes (it runs `prisma generate`).

- [ ] **Step 4: Write the failing unit tests** in `tests/unit/item-input.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
	itemInputSchema,
	personInputSchema,
	placeInputSchema,
} from "../../src/services/item-input";

const valid = {
	title: " Synthetic title ",
	description: "",
	types: ["picture"],
	date: { kind: "unknown" },
	tags: [],
	personIds: [],
	placeIds: [],
};

describe("itemInputSchema", () => {
	it("trims the title and accepts an unknown date", () => {
		const parsed = itemInputSchema.parse(valid);
		expect(parsed.title).toBe("Synthetic title");
		expect(parsed.date).toEqual({ kind: "unknown" });
	});
	it("rejects an empty or too long title", () => {
		expect(itemInputSchema.safeParse({ ...valid, title: "  " }).success).toBe(false);
		expect(
			itemInputSchema.safeParse({ ...valid, title: "x".repeat(201) }).success,
		).toBe(false);
	});
	it("limits description, types, tags, people and places", () => {
		const tooMany = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`);
		expect(
			itemInputSchema.safeParse({ ...valid, description: "x".repeat(20001) }).success,
		).toBe(false);
		expect(itemInputSchema.safeParse({ ...valid, types: [] }).success).toBe(false);
		expect(itemInputSchema.safeParse({ ...valid, types: ["film"] }).success).toBe(false);
		expect(itemInputSchema.safeParse({ ...valid, tags: tooMany(31) }).success).toBe(false);
		expect(
			itemInputSchema.safeParse({ ...valid, tags: ["x".repeat(51)] }).success,
		).toBe(false);
		expect(itemInputSchema.safeParse({ ...valid, personIds: tooMany(51) }).success).toBe(false);
		expect(itemInputSchema.safeParse({ ...valid, placeIds: tooMany(51) }).success).toBe(false);
	});
	it("removes duplicate types, tags and links", () => {
		const parsed = itemInputSchema.parse({
			...valid,
			types: ["picture", "picture", "video"],
			tags: ["a", " a ", "b"],
			personIds: ["p1", "p1"],
			placeIds: ["l1", "l1"],
		});
		expect(parsed.types).toEqual(["picture", "video"]);
		expect(parsed.tags).toEqual(["a", "b"]);
		expect(parsed.personIds).toEqual(["p1"]);
		expect(parsed.placeIds).toEqual(["l1"]);
	});
	it("accepts single dates that start their period", () => {
		for (const [start, precision] of [
			["1975-03-12", "day"],
			["1975-03-01", "month"],
			["1975-01-01", "year"],
			["1970-01-01", "decade"],
		] as const)
			expect(
				itemInputSchema.safeParse({
					...valid,
					date: { kind: "single", start, precision, approximate: false },
				}).success,
			).toBe(true);
	});
	it("rejects dates that do not start their period or do not exist", () => {
		for (const [start, precision] of [
			["1975-03-12", "month"],
			["1975-03-01", "year"],
			["1975-01-01", "decade"],
			["1975-02-30", "day"],
			["75-01-01", "year"],
		] as const)
			expect(
				itemInputSchema.safeParse({
					...valid,
					date: { kind: "single", start, precision, approximate: false },
				}).success,
			).toBe(false);
	});
	it("requires a range end on or after its start", () => {
		const range = (start: string, end: string) =>
			itemInputSchema.safeParse({
				...valid,
				date: { kind: "range", start, end, precision: "year", approximate: true },
			}).success;
		expect(range("1970-01-01", "1979-01-01")).toBe(true);
		expect(range("1970-01-01", "1970-01-01")).toBe(true);
		expect(range("1979-01-01", "1970-01-01")).toBe(false);
	});
	it("rejects date values on an unknown date", () => {
		expect(
			itemInputSchema.safeParse({
				...valid,
				date: { kind: "unknown", start: "1975-01-01" },
			}).success,
		).toBe(false);
	});
});

describe("person and place input", () => {
	it("validates names and the family-only switch", () => {
		expect(
			personInputSchema.parse({ name: " Synthetic Person ", otherNames: [], familyOnly: true }),
		).toEqual({ name: "Synthetic Person", otherNames: [], familyOnly: true });
		expect(
			personInputSchema.safeParse({ name: "", otherNames: [], familyOnly: false }).success,
		).toBe(false);
	});
	it("requires both coordinates or neither, within range", () => {
		const place = (latitude: number | null, longitude: number | null) =>
			placeInputSchema.safeParse({
				name: "Synthetic Place",
				otherNames: [],
				latitude,
				longitude,
			}).success;
		expect(place(null, null)).toBe(true);
		expect(place(32.5, 35.1)).toBe(true);
		expect(place(32.5, null)).toBe(false);
		expect(place(null, 35.1)).toBe(false);
		expect(place(91, 35.1)).toBe(false);
		expect(place(32.5, 181)).toBe(false);
	});
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `npx vitest run tests/unit/item-input.test.ts`
Expected: FAIL — cannot resolve `../../src/services/item-input`.

- [ ] **Step 6: Implement `src/services/item-input.ts`**

```ts
import { z } from "zod";

export const itemTypes = [
	"picture",
	"video",
	"audio",
	"drawing",
	"article",
	"interview",
	"document",
	"other",
] as const;
export type ItemTypeValue = (typeof itemTypes)[number];
export const datePrecisions = ["day", "month", "year", "decade"] as const;

const unique = <T>(values: T[]) => [...new Set(values)];
const id = z.string().min(1).max(64);

// A stored date is the first day of its period: 1975-03-01 for March 1975,
// 1970-01-01 for the 1970s. Unknown stays unknown; nothing is guessed.
const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((value) => {
		const date = new Date(`${value}T00:00:00Z`);
		return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
	}, "INVALID_DATE");
function startsPeriod(value: string, precision: (typeof datePrecisions)[number]) {
	const [year, month, day] = value.split("-").map(Number);
	if (precision === "day") return true;
	if (precision === "month") return day === 1;
	if (precision === "year") return month === 1 && day === 1;
	return month === 1 && day === 1 && year % 10 === 0;
}
const precision = z.enum(datePrecisions);
const single = z
	.object({
		kind: z.literal("single"),
		start: isoDate,
		precision,
		approximate: z.boolean(),
	})
	.strict()
	.refine((d) => startsPeriod(d.start, d.precision), {
		path: ["start"],
		message: "PERIOD_START",
	});
const range = z
	.object({
		kind: z.literal("range"),
		start: isoDate,
		end: isoDate,
		precision,
		approximate: z.boolean(),
	})
	.strict()
	.refine((d) => startsPeriod(d.start, d.precision), {
		path: ["start"],
		message: "PERIOD_START",
	})
	.refine((d) => startsPeriod(d.end, d.precision), {
		path: ["end"],
		message: "PERIOD_START",
	})
	.refine((d) => d.end >= d.start, { path: ["end"], message: "RANGE_ORDER" });
const unknown = z.object({ kind: z.literal("unknown") }).strict();

export const itemInputSchema = z
	.object({
		title: z.string().trim().min(1).max(200),
		description: z.string().max(20000),
		types: z.array(z.enum(itemTypes)).min(1).max(8).transform(unique),
		date: z.union([unknown, single, range]),
		tags: z
			.array(z.string().trim().min(1).max(50))
			.max(30)
			.transform(unique),
		personIds: z.array(id).max(50).transform(unique),
		placeIds: z.array(id).max(50).transform(unique),
	})
	.strict();
export type ItemInput = z.input<typeof itemInputSchema>;
export type ParsedItem = z.output<typeof itemInputSchema>;
export type DateValue = ParsedItem["date"];

const name = z.string().trim().min(1).max(120);
const otherNames = z.array(name).max(20).transform(unique);
export const personInputSchema = z
	.object({ name, otherNames, familyOnly: z.boolean() })
	.strict();
export type PersonInput = z.input<typeof personInputSchema>;
export const placeInputSchema = z
	.object({
		name,
		otherNames,
		latitude: z.number().min(-90).max(90).nullable(),
		longitude: z.number().min(-180).max(180).nullable(),
	})
	.strict()
	.refine((p) => (p.latitude === null) === (p.longitude === null), {
		path: ["latitude"],
		message: "COORDINATES_PAIR",
	});
export type PlaceInput = z.input<typeof placeInputSchema>;
```

- [ ] **Step 7: Run to verify they pass**

Run: `npx vitest run tests/unit/item-input.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 8: Lint and commit**

```bash
npx biome lint prisma src/services/item-input.ts tests/unit/item-input.test.ts
git add prisma/schema.prisma prisma/migrations/20261103000000_item_editing src/services/item-input.ts tests/unit/item-input.test.ts
git commit -m "feat: item, revision, person and place models with input validation"
```

---

### Task 2: Editorial service — items, lifecycle and conflicts

**Files:**
- Create: `src/services/item-view.ts`
- Create: `src/services/editorial.ts`
- Test: `tests/integration/editorial.test.ts`

**Interfaces:**
- Consumes: `itemInputSchema`, `ItemInput`, `ParsedItem`, `DateValue` (Task 1); `Database` from `src/lib/database.ts`; `MemberContext` from `src/lib/auth-system.ts`.
- Produces from `item-view.ts`: `revisionInclude`, `type RevisionView = { title: string; description: string; types: ItemTypeValue[]; date: DateValue; tags: string[]; people: { id: string; name: string }[]; places: { id: string; name: string }[] }`, `toRevisionView(revision, { publicOnly: boolean }): RevisionView`, `dateFromRow(revision): DateValue`.
- Produces from `editorial.ts`: `createEditorialService(db: Database, requireMember: () => Promise<MemberContext>)` returning
  - `createItem(input: ItemInput): Promise<{ id: string; version: number }>`
  - `updateItem(id: string, expectedVersion: number, input: ItemInput): Promise<{ id: string; version: number }>`
  - `transitionItem(id: string, expectedVersion: number, action: EditorialAction): Promise<{ id: string; version: number }>`
  - `getItem(id: string): Promise<FamilyItem>` where `FamilyItem = { id: string; state: "active" | "archived"; visibility: "private" | "public"; version: number; hasUnpublishedEdits: boolean; working: RevisionView }`
  - `listItems(): Promise<ItemSummary[]>` and `listArchived(): Promise<ItemSummary[]>` where `ItemSummary = { id: string; title: string; visibility: "private" | "public"; hasUnpublishedEdits: boolean }`
  - (Task 3 adds people and places.)
- `export type EditorialAction = "publish" | "make-private" | "archive" | "restore"`.
- Errors are `Error` with message `UNAUTHORIZED` (from `requireMember`), `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_REFERENCE`, or a `ZodError` for invalid input.

- [ ] **Step 1: Write the failing integration tests** in `tests/integration/editorial.test.ts`

```ts
import { afterAll, beforeEach, expect, it } from "vitest";
import { createDatabase } from "../../src/lib/database";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import { createEditorialService } from "../../src/services/editorial";
import type { ItemInput } from "../../src/services/item-input";

const db = createDatabase(requireTestDatabaseUrl(process.env));
async function clean() {
	await db.editorialAudit.deleteMany();
	await db.item.deleteMany();
	await db.person.deleteMany();
	await db.place.deleteMany();
	await db.session.deleteMany();
	await db.user.deleteMany();
}
beforeEach(clean);
afterAll(async () => {
	await clean();
	await db.$disconnect();
});

const input = (title = "Synthetic title"): ItemInput => ({
	title,
	description: "Synthetic description",
	types: ["picture"],
	date: { kind: "single", start: "1975-01-01", precision: "year", approximate: false },
	tags: ["synthetic"],
	personIds: [],
	placeIds: [],
});

async function member(email: string) {
	const user = await db.user.create({
		data: { email, emailVerified: true },
	});
	return createEditorialService(db, async () => ({
		id: user.id,
		role: "member",
		accessVersion: user.accessVersion,
	}));
}

it("creates items as private and lets another member edit them", async () => {
	const a = await member("a@example.test");
	const b = await member("b@example.test");
	const { id, version } = await a.createItem(input());
	expect(version).toBe(1);
	const created = await b.getItem(id);
	expect(created.state).toBe("active");
	expect(created.visibility).toBe("private");
	expect(created.working.title).toBe("Synthetic title");
	const saved = await b.updateItem(id, 1, input("Edited by b"));
	expect(saved.version).toBe(2);
	expect((await a.getItem(id)).working.title).toBe("Edited by b");
});

it("keeps the published revision unchanged while a public item is edited", async () => {
	const a = await member("a@example.test");
	const { id } = await a.createItem(input("First"));
	await a.transitionItem(id, 1, "publish");
	const before = await db.item.findUniqueOrThrow({ where: { id } });
	expect(before.visibility).toBe("public");
	expect(before.publishedRevisionId).toBe(before.workingRevisionId);
	await a.updateItem(id, 2, input("Second"));
	const after = await db.item.findUniqueOrThrow({
		where: { id },
		include: { publishedRevision: true, workingRevision: true },
	});
	expect(after.publishedRevision?.title).toBe("First");
	expect(after.workingRevision?.title).toBe("Second");
	expect((await a.getItem(id)).hasUnpublishedEdits).toBe(true);
	await a.transitionItem(id, 3, "publish");
	const republished = await db.item.findUniqueOrThrow({
		where: { id },
		include: { publishedRevision: true },
	});
	expect(republished.publishedRevision?.title).toBe("Second");
	expect((await a.getItem(id)).hasUnpublishedEdits).toBe(false);
});

it("make private, archive and restore never bring back an older public version", async () => {
	const a = await member("a@example.test");
	const { id } = await a.createItem(input("Old public"));
	await a.transitionItem(id, 1, "publish");
	await a.transitionItem(id, 2, "make-private");
	let row = await db.item.findUniqueOrThrow({ where: { id } });
	expect(row.visibility).toBe("private");
	expect(row.publishedRevisionId).toBeNull();
	expect(row.publishedAt).toBeNull();
	await a.transitionItem(id, 3, "publish");
	await a.transitionItem(id, 4, "archive");
	row = await db.item.findUniqueOrThrow({ where: { id } });
	expect(row.state).toBe("archived");
	expect(row.visibility).toBe("private");
	expect(row.publishedRevisionId).toBeNull();
	await a.transitionItem(id, 5, "restore");
	row = await db.item.findUniqueOrThrow({ where: { id } });
	expect(row.state).toBe("active");
	expect(row.visibility).toBe("private");
	expect(row.publishedRevisionId).toBeNull();
	await a.updateItem(id, 6, input("New text"));
	await a.transitionItem(id, 7, "publish");
	const published = await db.item.findUniqueOrThrow({
		where: { id },
		include: { publishedRevision: true },
	});
	expect(published.publishedRevision?.title).toBe("New text");
});

it("refuses actions that do not fit the current state, changing nothing", async () => {
	const a = await member("a@example.test");
	const { id } = await a.createItem(input());
	await expect(a.transitionItem(id, 1, "make-private")).rejects.toThrow("CONFLICT");
	await expect(a.transitionItem(id, 1, "restore")).rejects.toThrow("CONFLICT");
	await a.transitionItem(id, 1, "publish");
	await expect(a.transitionItem(id, 2, "publish")).rejects.toThrow("CONFLICT");
	await a.transitionItem(id, 2, "archive");
	await expect(a.updateItem(id, 3, input("x"))).rejects.toThrow("CONFLICT");
	await expect(a.transitionItem(id, 3, "archive")).rejects.toThrow("CONFLICT");
	const row = await db.item.findUniqueOrThrow({ where: { id } });
	expect(row.version).toBe(3);
});

it("fails a stale version without changing anything", async () => {
	const a = await member("a@example.test");
	const b = await member("b@example.test");
	const { id } = await a.createItem(input("Original"));
	await a.updateItem(id, 1, input("A wins"));
	await expect(b.updateItem(id, 1, input("B stale"))).rejects.toThrow("CONFLICT");
	await expect(b.transitionItem(id, 1, "publish")).rejects.toThrow("CONFLICT");
	const row = await db.item.findUniqueOrThrow({
		where: { id },
		include: { workingRevision: true },
	});
	expect(row.version).toBe(2);
	expect(row.visibility).toBe("private");
	expect(row.workingRevision?.title).toBe("A wins");
});

it("lets exactly one of two concurrent actions on the same version succeed", async () => {
	const a = await member("a@example.test");
	const b = await member("b@example.test");
	const pairs: [() => Promise<unknown>, () => Promise<unknown>][] = [];
	const { id: first } = await a.createItem(input());
	pairs.push([
		() => a.updateItem(first, 1, input("Save")),
		() => b.transitionItem(first, 1, "publish"),
	]);
	const { id: second } = await a.createItem(input());
	await a.transitionItem(second, 1, "publish");
	pairs.push([
		() => a.transitionItem(second, 2, "archive"),
		() => b.transitionItem(second, 2, "make-private"),
	]);
	for (const [x, y] of pairs) {
		const results = await Promise.allSettled([x(), y()]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		const failed = results.find((r) => r.status === "rejected");
		expect((failed as PromiseRejectedResult).reason.message).toBe("CONFLICT");
	}
	const firstRow = await db.item.findUniqueOrThrow({ where: { id: first } });
	expect(firstRow.version).toBe(2);
});

it("refuses non-members and revoked members on every function", async () => {
	const a = await member("a@example.test");
	const { id } = await a.createItem(input());
	const anonymous = createEditorialService(db, async () => {
		throw new Error("UNAUTHORIZED");
	});
	const revokedUser = await db.user.create({
		data: { email: "revoked@example.test", emailVerified: true },
	});
	const revoked = createEditorialService(db, async () => ({
		id: revokedUser.id,
		role: "member",
		accessVersion: revokedUser.accessVersion,
	}));
	await db.user.update({
		where: { id: revokedUser.id },
		data: { status: "revoked", accessVersion: { increment: 1 } },
	});
	for (const service of [anonymous, revoked])
		for (const operation of [
			() => service.createItem(input()),
			() => service.updateItem(id, 1, input()),
			() => service.transitionItem(id, 1, "publish"),
			() => service.getItem(id),
			() => service.listItems(),
			() => service.listArchived(),
		])
			await expect(operation()).rejects.toThrow(/UNAUTHORIZED|FORBIDDEN/);
	expect((await db.item.findUniqueOrThrow({ where: { id } })).version).toBe(1);
});

it("offers members no permanent delete", async () => {
	const a = await member("a@example.test");
	expect(Object.keys(a)).not.toContain("deleteItem");
	expect(Object.keys(a).some((key) => /delete|purge|destroy/i.test(key))).toBe(false);
});

it("rejects links to people or places that do not exist", async () => {
	const a = await member("a@example.test");
	await expect(
		a.createItem({ ...input(), personIds: ["missing"] }),
	).rejects.toThrow("INVALID_REFERENCE");
	expect(await db.item.count()).toBe(0);
});

it("lists active and archived items with labels, and audits without content", async () => {
	const a = await member("a@example.test");
	const { id: kept } = await a.createItem(input("Kept"));
	const { id: gone } = await a.createItem(input("Gone"));
	await a.transitionItem(kept, 1, "publish");
	await a.updateItem(kept, 2, input("Kept edited"));
	await a.transitionItem(gone, 1, "archive");
	expect(await a.listItems()).toEqual([
		{ id: kept, title: "Kept edited", visibility: "public", hasUnpublishedEdits: true },
	]);
	expect(await a.listArchived()).toEqual([
		{ id: gone, title: "Gone", visibility: "private", hasUnpublishedEdits: false },
	]);
	const audit = await db.editorialAudit.findMany();
	expect(audit.map((row) => row.action).sort()).toEqual(
		["archive", "create", "create", "publish", "save"],
	);
	const text = JSON.stringify(audit);
	for (const word of ["Kept", "Gone", "Synthetic"]) expect(text).not.toContain(word);
});

it("returns NOT_FOUND for an unknown item", async () => {
	const a = await member("a@example.test");
	await expect(a.getItem("missing")).rejects.toThrow("NOT_FOUND");
	await expect(a.updateItem("missing", 1, input())).rejects.toThrow("NOT_FOUND");
	await expect(a.transitionItem("missing", 1, "publish")).rejects.toThrow("NOT_FOUND");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/integration/editorial.test.ts`
Expected: FAIL — cannot resolve `../../src/services/editorial`.

- [ ] **Step 3: Implement `src/services/item-view.ts`**

```ts
import "server-only";
import type { DateValue, ItemTypeValue } from "./item-input";

export const revisionInclude = {
	people: { include: { person: true } },
	places: { include: { place: true } },
} as const;

type DateRow = {
	dateKind: "unknown" | "single" | "range";
	dateStart: Date | null;
	dateEnd: Date | null;
	datePrecision: "day" | "month" | "year" | "decade" | null;
	dateApproximate: boolean;
};
type RevisionRow = DateRow & {
	title: string;
	description: string;
	types: ItemTypeValue[];
	tags: string[];
	people: { person: { id: string; name: string; familyOnly: boolean } }[];
	places: { place: { id: string; name: string } }[];
};
export type RevisionView = {
	title: string;
	description: string;
	types: ItemTypeValue[];
	date: DateValue;
	tags: string[];
	people: { id: string; name: string }[];
	places: { id: string; name: string }[];
};

const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? "";

export function dateFromRow(row: DateRow): DateValue {
	if (row.dateKind === "unknown" || !row.datePrecision) return { kind: "unknown" };
	if (row.dateKind === "single")
		return {
			kind: "single",
			start: day(row.dateStart),
			precision: row.datePrecision,
			approximate: row.dateApproximate,
		};
	return {
		kind: "range",
		start: day(row.dateStart),
		end: day(row.dateEnd),
		precision: row.datePrecision,
		approximate: row.dateApproximate,
	};
}

export function dateToRow(date: DateValue): DateRow {
	const at = (value: string) => new Date(`${value}T00:00:00Z`);
	if (date.kind === "unknown")
		return {
			dateKind: "unknown",
			dateStart: null,
			dateEnd: null,
			datePrecision: null,
			dateApproximate: false,
		};
	return {
		dateKind: date.kind,
		dateStart: at(date.start),
		dateEnd: date.kind === "range" ? at(date.end) : null,
		datePrecision: date.precision,
		dateApproximate: date.approximate,
	};
}

// publicOnly drops people marked family-only. Callers on public paths must
// pass true; the family editor passes false so members see everyone.
export function toRevisionView(
	row: RevisionRow,
	{ publicOnly }: { publicOnly: boolean },
): RevisionView {
	const byName = <T extends { name: string }>(a: T, b: T) =>
		a.name.localeCompare(b.name, "he");
	return {
		title: row.title,
		description: row.description,
		types: row.types,
		date: dateFromRow(row),
		tags: row.tags,
		people: row.people
			.map((link) => link.person)
			.filter((person) => !publicOnly || !person.familyOnly)
			.map(({ id, name }) => ({ id, name }))
			.sort(byName),
		places: row.places
			.map(({ place }) => ({ id: place.id, name: place.name }))
			.sort(byName),
	};
}
```

- [ ] **Step 4: Implement `src/services/editorial.ts`**

```ts
import "server-only";
import type { Prisma } from "../generated/prisma/client";
import type { Database } from "../lib/database";
import type { MemberContext } from "../lib/auth-system";
import { itemInputSchema, type ItemInput, type ParsedItem } from "./item-input";
import { dateToRow, revisionInclude, toRevisionView, type RevisionView } from "./item-view";

export type EditorialAction = "publish" | "make-private" | "archive" | "restore";
export type ItemSummary = {
	id: string;
	title: string;
	visibility: "private" | "public";
	hasUnpublishedEdits: boolean;
};
export type FamilyItem = {
	id: string;
	state: "active" | "archived";
	visibility: "private" | "public";
	version: number;
	hasUnpublishedEdits: boolean;
	working: RevisionView;
};
type Tx = Prisma.TransactionClient;
type ItemRow = {
	id: string;
	state: "active" | "archived";
	visibility: "private" | "public";
	version: number;
	workingRevisionId: string | null;
	publishedRevisionId: string | null;
};

const unpublishedEdits = (item: ItemRow) =>
	item.visibility === "public" && item.workingRevisionId !== item.publishedRevisionId;

// Which actions each state allows, and what they change. Clearing
// publishedRevisionId on make-private and archive is what stops a later
// publish or restore from bringing an older public version back.
function transition(item: ItemRow, action: EditorialAction): Prisma.ItemUpdateManyMutationInput | null {
	if (action === "restore")
		return item.state === "archived" ? { state: "active" } : null;
	if (item.state !== "active") return null;
	if (action === "publish")
		return item.visibility === "private" || unpublishedEdits(item)
			? {
					visibility: "public",
					publishedRevisionId: item.workingRevisionId,
					publishedAt: new Date(),
				}
			: null;
	if (action === "make-private")
		return item.visibility === "public"
			? { visibility: "private", publishedRevisionId: null, publishedAt: null }
			: null;
	return {
		state: "archived",
		visibility: "private",
		publishedRevisionId: null,
		publishedAt: null,
	};
}

function revisionData(parsed: ParsedItem, authorId: string) {
	return {
		title: parsed.title,
		description: parsed.description,
		types: parsed.types,
		tags: parsed.tags,
		authorId,
		...dateToRow(parsed.date),
		people: { create: parsed.personIds.map((personId) => ({ personId })) },
		places: { create: parsed.placeIds.map((placeId) => ({ placeId })) },
	};
}

export function createEditorialService(
	db: Database,
	requireMember: () => Promise<MemberContext>,
) {
	async function run<T>(work: (tx: Tx, actor: MemberContext) => Promise<T>) {
		const actor = await requireMember();
		return db.$transaction(async (tx) => {
			const current = await tx.user.findUnique({ where: { id: actor.id } });
			if (
				!current ||
				current.status !== "active" ||
				!current.emailVerified ||
				current.accessVersion !== actor.accessVersion
			)
				throw new Error("FORBIDDEN");
			return work(tx, actor);
		});
	}
	const audit = (tx: Tx, actorId: string, targetType: string, targetId: string, action: string) =>
		tx.editorialAudit.create({ data: { actorId, targetType, targetId, action } });
	async function checkReferences(tx: Tx, parsed: ParsedItem) {
		const [people, places] = await Promise.all([
			tx.person.count({ where: { id: { in: parsed.personIds } } }),
			tx.place.count({ where: { id: { in: parsed.placeIds } } }),
		]);
		if (people !== parsed.personIds.length || places !== parsed.placeIds.length)
			throw new Error("INVALID_REFERENCE");
	}
	// Loads the item, then claims it with a version-guarded update. Under
	// concurrency the second claimant waits on the row lock, then matches
	// zero rows and fails with CONFLICT; its transaction changes nothing.
	async function claim(
		tx: Tx,
		id: string,
		expectedVersion: number,
		change: (item: ItemRow) => Prisma.ItemUpdateManyMutationInput | null,
	) {
		const item = await tx.item.findUnique({ where: { id } });
		if (!item) throw new Error("NOT_FOUND");
		const data = item.version === expectedVersion ? change(item) : null;
		if (!data) throw new Error("CONFLICT");
		const { count } = await tx.item.updateMany({
			where: { id, version: expectedVersion },
			data: { ...data, version: { increment: 1 } },
		});
		if (count !== 1) throw new Error("CONFLICT");
		return item;
	}
	async function summaries(tx: Tx, state: "active" | "archived") {
		const items = await tx.item.findMany({
			where: { state },
			include: { workingRevision: true },
			orderBy: { updatedAt: "desc" },
		});
		return items.map(
			(item): ItemSummary => ({
				id: item.id,
				title: item.workingRevision?.title ?? "",
				visibility: item.visibility,
				hasUnpublishedEdits: unpublishedEdits(item),
			}),
		);
	}

	return {
		createItem: (input: ItemInput) => {
			const parsed = itemInputSchema.parse(input);
			return run(async (tx, actor) => {
				await checkReferences(tx, parsed);
				const item = await tx.item.create({ data: {} });
				const revision = await tx.itemRevision.create({
					data: { itemId: item.id, ...revisionData(parsed, actor.id) },
				});
				await tx.item.update({
					where: { id: item.id },
					data: { workingRevisionId: revision.id },
				});
				await audit(tx, actor.id, "item", item.id, "create");
				return { id: item.id, version: item.version };
			});
		},
		updateItem: (id: string, expectedVersion: number, input: ItemInput) => {
			const parsed = itemInputSchema.parse(input);
			return run(async (tx, actor) => {
				const item = await claim(tx, id, expectedVersion, (current) =>
					current.state === "active" ? {} : null,
				);
				await checkReferences(tx, parsed);
				const data = revisionData(parsed, actor.id);
				if (!item.workingRevisionId || item.workingRevisionId === item.publishedRevisionId) {
					// The published revision is never edited: start a new working one.
					const revision = await tx.itemRevision.create({ data: { itemId: id, ...data } });
					await tx.item.update({ where: { id }, data: { workingRevisionId: revision.id } });
				} else {
					const revisionId = item.workingRevisionId;
					await tx.itemRevisionPerson.deleteMany({ where: { revisionId } });
					await tx.itemRevisionPlace.deleteMany({ where: { revisionId } });
					await tx.itemRevision.update({ where: { id: revisionId }, data });
				}
				await audit(tx, actor.id, "item", id, "save");
				return { id, version: expectedVersion + 1 };
			});
		},
		transitionItem: (id: string, expectedVersion: number, action: EditorialAction) =>
			run(async (tx, actor) => {
				await claim(tx, id, expectedVersion, (item) => transition(item, action));
				await audit(tx, actor.id, "item", id, action);
				return { id, version: expectedVersion + 1 };
			}),
		getItem: (id: string) =>
			run(async (tx): Promise<FamilyItem> => {
				const item = await tx.item.findUnique({
					where: { id },
					include: { workingRevision: { include: revisionInclude } },
				});
				if (!item?.workingRevision) throw new Error("NOT_FOUND");
				return {
					id: item.id,
					state: item.state,
					visibility: item.visibility,
					version: item.version,
					hasUnpublishedEdits: unpublishedEdits(item),
					working: toRevisionView(item.workingRevision, { publicOnly: false }),
				};
			}),
		listItems: () => run((tx) => summaries(tx, "active")),
		listArchived: () => run((tx) => summaries(tx, "archived")),
	};
}
```

Note: `item.update` in `createItem`/`updateItem` bumps `updatedAt` but not `version`; only `claim` increments `version`, once per mutation.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run tests/integration/editorial.test.ts`
Expected: PASS, 10 tests. If the concurrency test flakes, do not add retries: check that `claim` runs its `updateMany` before any other write in the transaction.

- [ ] **Step 6: Run the whole integration suite** (other files delete users; make sure nothing now fails on foreign keys)

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 7: Lint, typecheck and commit**

```bash
npx biome lint src/services tests/integration/editorial.test.ts && npm run typecheck
git add src/services/item-view.ts src/services/editorial.ts tests/integration/editorial.test.ts
git commit -m "feat: editorial service with revision-checked lifecycle"
```

---

### Task 3: People and places in the editorial service

**Files:**
- Modify: `src/services/editorial.ts` (add four functions to the returned object)
- Test: `tests/integration/editorial.test.ts` (append)

**Interfaces:**
- Consumes: `personInputSchema`, `PersonInput`, `placeInputSchema`, `PlaceInput` (Task 1); `run`, `audit` inside `createEditorialService` (Task 2).
- Produces on the service:
  - `listPeople(): Promise<PersonRecord[]>`, `PersonRecord = { id: string; name: string; otherNames: string[]; familyOnly: boolean; version: number }`
  - `savePerson(input: PersonInput, target?: { id: string; expectedVersion: number }): Promise<{ id: string; version: number }>`
  - `listPlaces(): Promise<PlaceRecord[]>`, `PlaceRecord = { id: string; name: string; otherNames: string[]; latitude: number | null; longitude: number | null; version: number }`
  - `savePlace(input: PlaceInput, target?: { id: string; expectedVersion: number }): Promise<{ id: string; version: number }>`
- Without `target` the call creates; with it, it updates guarded by `expectedVersion` (`CONFLICT` on mismatch, `NOT_FOUND` if missing).

- [ ] **Step 1: Append the failing tests** to `tests/integration/editorial.test.ts`

```ts
it("creates and edits people and places with version checks", async () => {
	const a = await member("a@example.test");
	const b = await member("b@example.test");
	const person = await a.savePerson({
		name: "Synthetic Person",
		otherNames: ["Synthetic Alias"],
		familyOnly: false,
	});
	expect(person.version).toBe(1);
	await b.savePerson(
		{ name: "Synthetic Person B", otherNames: [], familyOnly: true },
		{ id: person.id, expectedVersion: 1 },
	);
	await expect(
		a.savePerson(
			{ name: "Stale", otherNames: [], familyOnly: false },
			{ id: person.id, expectedVersion: 1 },
		),
	).rejects.toThrow("CONFLICT");
	expect(await a.listPeople()).toEqual([
		{
			id: person.id,
			name: "Synthetic Person B",
			otherNames: [],
			familyOnly: true,
			version: 2,
		},
	]);
	const place = await a.savePlace({
		name: "Synthetic Place",
		otherNames: [],
		latitude: 32.5,
		longitude: 35.1,
	});
	await a.savePlace(
		{ name: "Synthetic Place", otherNames: [], latitude: null, longitude: null },
		{ id: place.id, expectedVersion: 1 },
	);
	expect(await a.listPlaces()).toEqual([
		{
			id: place.id,
			name: "Synthetic Place",
			otherNames: [],
			latitude: null,
			longitude: null,
			version: 2,
		},
	]);
	await expect(
		a.savePlace(
			{ name: "x", otherNames: [], latitude: null, longitude: null },
			{ id: "missing", expectedVersion: 1 },
		),
	).rejects.toThrow("NOT_FOUND");
	const actions = (await db.editorialAudit.findMany()).map(
		(row) => `${row.targetType}:${row.action}`,
	);
	expect(actions.sort()).toEqual(
		["person:create", "person:save", "place:create", "place:save"].sort(),
	);
	expect(JSON.stringify(await db.editorialAudit.findMany())).not.toContain("Synthetic");
});

it("links people and places to the working revision only", async () => {
	const a = await member("a@example.test");
	const person = await a.savePerson({ name: "Synthetic Person", otherNames: [], familyOnly: false });
	const place = await a.savePlace({
		name: "Synthetic Place",
		otherNames: [],
		latitude: null,
		longitude: null,
	});
	const { id } = await a.createItem({ ...input(), personIds: [person.id], placeIds: [place.id] });
	await a.transitionItem(id, 1, "publish");
	await a.updateItem(id, 2, { ...input(), personIds: [], placeIds: [] });
	const item = await a.getItem(id);
	expect(item.working.people).toEqual([]);
	const published = await db.item.findUniqueOrThrow({
		where: { id },
		include: { publishedRevision: { include: { people: true, places: true } } },
	});
	expect(published.publishedRevision?.people.map((p) => p.personId)).toEqual([person.id]);
	expect(published.publishedRevision?.places.map((p) => p.placeId)).toEqual([place.id]);
});

it("refuses non-members on people and places", async () => {
	const anonymous = createEditorialService(db, async () => {
		throw new Error("UNAUTHORIZED");
	});
	for (const operation of [
		() => anonymous.listPeople(),
		() => anonymous.listPlaces(),
		() => anonymous.savePerson({ name: "x", otherNames: [], familyOnly: false }),
		() =>
			anonymous.savePlace({ name: "x", otherNames: [], latitude: null, longitude: null }),
	])
		await expect(operation()).rejects.toThrow("UNAUTHORIZED");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/integration/editorial.test.ts`
Expected: FAIL — `a.savePerson is not a function`.

- [ ] **Step 3: Implement.** In `src/services/editorial.ts`, extend the import from `./item-input`:

```ts
import {
	itemInputSchema,
	personInputSchema,
	placeInputSchema,
	type ItemInput,
	type ParsedItem,
	type PersonInput,
	type PlaceInput,
} from "./item-input";
```

Add the exported types after `FamilyItem`:

```ts
export type PersonRecord = {
	id: string;
	name: string;
	otherNames: string[];
	familyOnly: boolean;
	version: number;
};
export type PlaceRecord = {
	id: string;
	name: string;
	otherNames: string[];
	latitude: number | null;
	longitude: number | null;
	version: number;
};
type Target = { id: string; expectedVersion: number };
```

Inside `createEditorialService`, after `summaries`, add a shared guarded save for both lists:

```ts
	// Creates, or updates only if the row still has the expected version.
	async function saveRecord(
		tx: Tx,
		actorId: string,
		kind: "person" | "place",
		data: Record<string, unknown>,
		target?: Target,
	) {
		const table = kind === "person" ? tx.person : tx.place;
		if (!target) {
			// biome-ignore lint/suspicious/noExplicitAny: the two delegates share this call shape
			const created = await (table as any).create({ data });
			await audit(tx, actorId, kind, created.id, "create");
			return { id: created.id as string, version: 1 };
		}
		// biome-ignore lint/suspicious/noExplicitAny: the two delegates share this call shape
		const delegate = table as any;
		const { count } = await delegate.updateMany({
			where: { id: target.id, version: target.expectedVersion },
			data: { ...data, version: { increment: 1 } },
		});
		if (count !== 1) {
			const exists = await delegate.count({ where: { id: target.id } });
			throw new Error(exists ? "CONFLICT" : "NOT_FOUND");
		}
		await audit(tx, actorId, kind, target.id, "save");
		return { id: target.id, version: target.expectedVersion + 1 };
	}
```

If Biome or TypeScript reject the `any` casts, replace `saveRecord` with two explicit copies (`savePersonRecord` using `tx.person`, `savePlaceRecord` using `tx.place`); keep identical behaviour.

Add to the returned object:

```ts
		listPeople: () =>
			run((tx) =>
				tx.person.findMany({
					select: { id: true, name: true, otherNames: true, familyOnly: true, version: true },
					orderBy: { name: "asc" },
				}),
			) as Promise<PersonRecord[]>,
		savePerson: (input: PersonInput, target?: Target) => {
			const parsed = personInputSchema.parse(input);
			return run((tx, actor) => saveRecord(tx, actor.id, "person", parsed, target));
		},
		listPlaces: () =>
			run((tx) =>
				tx.place.findMany({
					select: {
						id: true,
						name: true,
						otherNames: true,
						latitude: true,
						longitude: true,
						version: true,
					},
					orderBy: { name: "asc" },
				}),
			) as Promise<PlaceRecord[]>,
		savePlace: (input: PlaceInput, target?: Target) => {
			const parsed = placeInputSchema.parse(input);
			return run((tx, actor) => saveRecord(tx, actor.id, "place", parsed, target));
		},
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/integration/editorial.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Lint, typecheck and commit**

```bash
npx biome lint src/services tests/integration && npm run typecheck
git add src/services/editorial.ts tests/integration/editorial.test.ts
git commit -m "feat: shared people and places lists with version checks"
```

---

### Task 4: Public archive reader

**Files:**
- Create: `src/services/archive.ts`
- Test: `tests/integration/archive.test.ts`

**Interfaces:**
- Consumes: `revisionInclude`, `toRevisionView`, `dateFromRow`, `RevisionView` (Task 2); `createEditorialService` (Tasks 2–3, test setup only).
- Produces: `createArchiveReader(db: Database)` returning
  - `listPublicItems(): Promise<PublicSummary[]>`, `PublicSummary = { id: string; title: string; types: ItemTypeValue[]; date: DateValue }`, newest publication first.
  - `getPublicItem(id: string): Promise<(RevisionView & { id: string }) | null>`.

- [ ] **Step 1: Write the failing tests** in `tests/integration/archive.test.ts`

```ts
import { afterAll, beforeEach, expect, it } from "vitest";
import { createDatabase } from "../../src/lib/database";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import { createEditorialService } from "../../src/services/editorial";
import { createArchiveReader } from "../../src/services/archive";
import type { ItemInput } from "../../src/services/item-input";

const db = createDatabase(requireTestDatabaseUrl(process.env));
const reader = createArchiveReader(db);
async function clean() {
	await db.editorialAudit.deleteMany();
	await db.item.deleteMany();
	await db.person.deleteMany();
	await db.place.deleteMany();
	await db.user.deleteMany();
}
beforeEach(clean);
afterAll(async () => {
	await clean();
	await db.$disconnect();
});
async function editor() {
	const user = await db.user.create({ data: { email: "a@example.test", emailVerified: true } });
	return createEditorialService(db, async () => ({
		id: user.id,
		role: "member",
		accessVersion: user.accessVersion,
	}));
}
const input = (title: string, extra: Partial<ItemInput> = {}): ItemInput => ({
	title,
	description: `${title} description`,
	types: ["article"],
	date: { kind: "unknown" },
	tags: [],
	personIds: [],
	placeIds: [],
	...extra,
});

it("shows only published items, and only their published version", async () => {
	const a = await editor();
	const { id: shown } = await a.createItem(input("Published text"));
	await a.createItem(input("Private text"));
	await a.transitionItem(shown, 1, "publish");
	await a.updateItem(shown, 2, input("Unpublished draft"));
	expect(await reader.listPublicItems()).toEqual([
		{ id: shown, title: "Published text", types: ["article"], date: { kind: "unknown" } },
	]);
	const item = await reader.getPublicItem(shown);
	expect(item?.title).toBe("Published text");
	expect(item?.description).toBe("Published text description");
	expect(JSON.stringify(await reader.listPublicItems())).not.toContain("Unpublished draft");
	expect(JSON.stringify(await reader.listPublicItems())).not.toContain("Private text");
});

it("hides items on the next read after make private or archive", async () => {
	const a = await editor();
	const { id } = await a.createItem(input("Public then private"));
	await a.transitionItem(id, 1, "publish");
	expect(await reader.getPublicItem(id)).not.toBeNull();
	await a.transitionItem(id, 2, "make-private");
	expect(await reader.getPublicItem(id)).toBeNull();
	await a.transitionItem(id, 3, "publish");
	await a.transitionItem(id, 4, "archive");
	expect(await reader.getPublicItem(id)).toBeNull();
	await a.transitionItem(id, 5, "restore");
	expect(await reader.getPublicItem(id)).toBeNull();
	expect(await reader.listPublicItems()).toEqual([]);
	expect(await reader.getPublicItem("missing")).toBeNull();
});

it("never shows family-only people, and shows places and other people", async () => {
	const a = await editor();
	const hidden = await a.savePerson({ name: "Hidden Person", otherNames: [], familyOnly: true });
	const shown = await a.savePerson({ name: "Shown Person", otherNames: [], familyOnly: false });
	const place = await a.savePlace({
		name: "Synthetic Place",
		otherNames: [],
		latitude: null,
		longitude: null,
	});
	const { id } = await a.createItem(
		input("With people", { personIds: [hidden.id, shown.id], placeIds: [place.id] }),
	);
	await a.transitionItem(id, 1, "publish");
	const item = await reader.getPublicItem(id);
	expect(item?.people).toEqual([{ id: shown.id, name: "Shown Person" }]);
	expect(item?.places).toEqual([{ id: place.id, name: "Synthetic Place" }]);
	expect(JSON.stringify(item)).not.toContain("Hidden Person");
	await a.savePerson(
		{ name: "Shown Person", otherNames: [], familyOnly: true },
		{ id: shown.id, expectedVersion: 1 },
	);
	expect((await reader.getPublicItem(id))?.people).toEqual([]);
});

it("orders the public list by publication, newest first", async () => {
	const a = await editor();
	const { id: older } = await a.createItem(input("Older"));
	const { id: newer } = await a.createItem(input("Newer"));
	await a.transitionItem(older, 1, "publish");
	await new Promise((resolve) => setTimeout(resolve, 10));
	await a.transitionItem(newer, 1, "publish");
	await a.updateItem(older, 2, input("Older draft edit"));
	expect((await reader.listPublicItems()).map((item) => item.id)).toEqual([newer, older]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/integration/archive.test.ts`
Expected: FAIL — cannot resolve `../../src/services/archive`.

- [ ] **Step 3: Implement `src/services/archive.ts`**

```ts
import "server-only";
import type { Database } from "../lib/database";
import type { DateValue, ItemTypeValue } from "./item-input";
import { dateFromRow, revisionInclude, toRevisionView, type RevisionView } from "./item-view";

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
	return {
		async listPublicItems(): Promise<PublicSummary[]> {
			const items = await db.item.findMany({
				where: publicWhere,
				include: { publishedRevision: true },
				orderBy: { publishedAt: "desc" },
			});
			return items.flatMap((item) =>
				item.publishedRevision
					? [
							{
								id: item.id,
								title: item.publishedRevision.title,
								types: item.publishedRevision.types,
								date: dateFromRow(item.publishedRevision),
							},
						]
					: [],
			);
		},
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

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/integration/archive.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Lint, typecheck and commit**

```bash
npx biome lint src/services tests/integration && npm run typecheck
git add src/services/archive.ts tests/integration/archive.test.ts
git commit -m "feat: public archive reader limited to published revisions"
```

---

### Task 5: Date display and proposed Hebrew strings

**Files:**
- Create: `src/lib/format-date.ts`
- Modify: `src/locales/he.ts` (add `items` inside `copy`)
- Test: `tests/unit/format-date.test.ts`

**Interfaces:**
- Consumes: `DateValue` (Task 1).
- Produces: `formatDate(date: DateValue): string`; `copy.items` with the keys below, used by Tasks 6–7.

- [ ] **Step 1: Add the proposed strings to `src/locales/he.ts`.** Insert inside `copy`, after `retry`:

```ts
	// Proposed for Yoram's approval (item editing, 2026-11-03); not yet approved.
	items: {
		list: "פריטים",
		add: "הוספת פריט",
		edit: "עריכת פריט",
		archived: "פריטים בארכיון המוסתר",
		people: "אנשים",
		places: "מקומות",
		none: "עדיין אין פריטים.",
		private: "פרטי",
		public: "ציבורי",
		unpublishedEdits: "נערך מאז הפרסום",
		title: "כותרת",
		description: "תיאור",
		types: "סוג",
		typeNames: {
			picture: "תמונה",
			video: "וידאו",
			audio: "שמע",
			drawing: "ציור",
			article: "כתבה",
			interview: "ראיון",
			document: "מסמך",
			other: "אחר",
		},
		date: "תאריך",
		dateKinds: { unknown: "לא ידוע", single: "תאריך אחד", range: "טווח" },
		dateStart: "מתאריך",
		dateEnd: "עד תאריך",
		precision: "דיוק",
		precisions: { day: "יום", month: "חודש", year: "שנה", decade: "עשור" },
		approximate: "משוער",
		approximatePrefix: "בערך",
		decadePrefix: "שנות ה־",
		unknownDate: "תאריך לא ידוע",
		tags: "תגיות (מופרדות בפסיק)",
		search: "חיפוש",
		addNew: "הוספה",
		save: "שמירה",
		saved: "נשמר.",
		publish: "פרסום",
		republish: "פרסום הגרסה הערוכה",
		makePrivate: "החזרה לפרטי",
		archive: "העברה לארכיון המוסתר",
		restore: "שחזור כפריט פרטי",
		conflict: "הפריט השתנה מאז שנפתח. הקלט שלך נשמר בטופס; הגרסה העדכנית מוצגת לצידו. אפשר לבדוק ולשמור שוב.",
		latest: "הגרסה השמורה העדכנית",
		invalid: "יש לתקן את השדות המסומנים.",
		failed: "לא ניתן לשמור כרגע. הקלט נשמר בטופס; אפשר לנסות שוב.",
		name: "שם",
		otherNames: "שמות נוספים (מופרדים בפסיק)",
		familyOnly: "להצגה למשפחה בלבד",
		latitude: "קו רוחב",
		longitude: "קו אורך",
		backToList: "חזרה לרשימת הפריטים",
	},
```

- [ ] **Step 2: Write the failing test** `tests/unit/format-date.test.ts`

```ts
import { expect, it } from "vitest";
import { formatDate } from "../../src/lib/format-date";
import { copy } from "../../src/locales/he";

it("formats each precision, approximation and ranges", () => {
	expect(formatDate({ kind: "unknown" })).toBe(copy.items.unknownDate);
	expect(
		formatDate({ kind: "single", start: "1975-03-12", precision: "day", approximate: false }),
	).toBe("12.3.1975");
	expect(
		formatDate({ kind: "single", start: "1975-03-01", precision: "month", approximate: false }),
	).toBe("3.1975");
	expect(
		formatDate({ kind: "single", start: "1975-01-01", precision: "year", approximate: true }),
	).toBe(`${copy.items.approximatePrefix} 1975`);
	expect(
		formatDate({ kind: "single", start: "1970-01-01", precision: "decade", approximate: false }),
	).toBe(`${copy.items.decadePrefix}1970`);
	expect(
		formatDate({
			kind: "range",
			start: "1970-01-01",
			end: "1979-01-01",
			precision: "year",
			approximate: false,
		}),
	).toBe("1970–1979");
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/unit/format-date.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/format-date`.

- [ ] **Step 4: Implement `src/lib/format-date.ts`**

```ts
import type { DateValue } from "@/services/item-input";
import { copy } from "@/locales/he";

type Precision = "day" | "month" | "year" | "decade";

// Numeric day.month.year avoids inventing Hebrew month names in copy.
function part(value: string, precision: Precision) {
	const [year, month, day] = value.split("-").map(Number);
	if (precision === "day") return `${day}.${month}.${year}`;
	if (precision === "month") return `${month}.${year}`;
	if (precision === "year") return `${year}`;
	return `${copy.items.decadePrefix}${year}`;
}

export function formatDate(date: DateValue): string {
	if (date.kind === "unknown") return copy.items.unknownDate;
	const text =
		date.kind === "single"
			? part(date.start, date.precision)
			: `${part(date.start, date.precision)}–${part(date.end, date.precision)}`;
	return date.approximate ? `${copy.items.approximatePrefix} ${text}` : text;
}
```

If the unit test cannot resolve `@/` paths, change both imports to relative paths (`../services/item-input`, `../locales/he`).

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/unit`
Expected: PASS, all unit tests.

- [ ] **Step 6: Commit**

```bash
npx biome lint src/lib src/locales tests/unit
git add src/lib/format-date.ts src/locales/he.ts tests/unit/format-date.test.ts
git commit -m "feat: Hebrew date display and proposed item editing copy"
```

---

### Task 6: Family screens and server actions

**Files:**
- Create: `src/services/editorial-runtime.ts`
- Create: `src/app/family/items/actions.ts`
- Create: `src/components/record-picker.tsx`, `src/components/item-form.tsx`, `src/components/item-actions.tsx`, `src/components/person-form.tsx`, `src/components/place-form.tsx`
- Modify: `src/app/family/page.tsx`
- Create: `src/app/family/items/new/page.tsx`, `src/app/family/items/[id]/edit/page.tsx`, `src/app/family/archived/page.tsx`, `src/app/family/people/page.tsx`, `src/app/family/places/page.tsx`

**Interfaces:**
- Consumes: `createEditorialService`, `EditorialAction`, `FamilyItem`, `ItemSummary`, `PersonRecord`, `PlaceRecord` (Tasks 2–3); `createArchiveReader` (Task 4); `formatDate`, `copy.items` (Task 5); `database()` from `src/lib/runtime.ts`; `requireMember` from `src/services/access.ts`; `SessionPanel` from `src/components/session-panel.tsx`.
- Produces: `editorialService()`, `archiveReader()` from `editorial-runtime.ts`; server actions `saveItem`, `changeItemState`, `addPerson`, `addPlace`, `savePersonForm`, `savePlaceForm`; type `ItemFormState`.

This task is UI wiring. Its tests are the browser flows in Task 7; here, verify with `npm run typecheck`, `npm run lint` and `npm run build`.

- [ ] **Step 1: `src/services/editorial-runtime.ts`**

```ts
import "server-only";
import { database } from "../lib/runtime";
import { requireMember } from "./access";
import { createArchiveReader } from "./archive";
import { createEditorialService } from "./editorial";

let editorial: ReturnType<typeof createEditorialService> | undefined;
let archive: ReturnType<typeof createArchiveReader> | undefined;
// One shared database client per server instance (see runtime.ts).
export function editorialService() {
	editorial ??= createEditorialService(database(), requireMember);
	return editorial;
}
export function archiveReader() {
	archive ??= createArchiveReader(database());
	return archive;
}
```

- [ ] **Step 2: `src/app/family/items/actions.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { editorialService } from "@/services/editorial-runtime";
import type { EditorialAction, FamilyItem } from "@/services/editorial";
import type { ItemInput } from "@/services/item-input";

export type ItemFormState = {
	status: "idle" | "saved" | "invalid" | "conflict" | "failed";
	version?: number;
	fields?: string[];
	latest?: FamilyItem;
};

const isAccessError = (error: unknown) =>
	error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message);
const list = (value: FormDataEntryValue | null) =>
	String(value ?? "")
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);

function readItem(data: FormData): ItemInput {
	const kind = String(data.get("dateKind") ?? "unknown");
	const precision = String(data.get("datePrecision") ?? "year");
	const approximate = data.get("dateApproximate") === "on";
	const start = String(data.get("dateStart") ?? "");
	const date =
		kind === "single"
			? { kind, start, precision, approximate }
			: kind === "range"
				? { kind, start, end: String(data.get("dateEnd") ?? ""), precision, approximate }
				: { kind: "unknown" };
	return {
		title: String(data.get("title") ?? ""),
		description: String(data.get("description") ?? ""),
		types: data.getAll("types").map(String),
		date,
		tags: list(data.get("tags")),
		personIds: data.getAll("personIds").map(String),
		placeIds: data.getAll("placeIds").map(String),
	} as ItemInput;
}

export async function saveItem(
	_previous: ItemFormState,
	data: FormData,
): Promise<ItemFormState> {
	const id = String(data.get("id") ?? "");
	const expected = Number(data.get("version"));
	let createdId: string | undefined;
	try {
		const service = editorialService();
		if (!id) createdId = (await service.createItem(readItem(data))).id;
		else {
			const { version } = await service.updateItem(id, expected, readItem(data));
			revalidatePath("/family");
			revalidatePath(`/family/items/${id}/edit`);
			return { status: "saved", version };
		}
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		if (error instanceof ZodError)
			return { status: "invalid", fields: error.issues.map((issue) => String(issue.path[0])) };
		if (error instanceof Error && error.message === "CONFLICT" && id) {
			const latest = await editorialService()
				.getItem(id)
				.catch(() => undefined);
			return { status: "conflict", latest };
		}
		return { status: "failed" };
	}
	revalidatePath("/family");
	redirect(`/family/items/${createdId}/edit`);
}

export async function changeItemState(
	_previous: ItemFormState,
	data: FormData,
): Promise<ItemFormState> {
	const id = String(data.get("id") ?? "");
	try {
		const { version } = await editorialService().transitionItem(
			id,
			Number(data.get("version")),
			String(data.get("action")) as EditorialAction,
		);
		revalidatePath("/family");
		revalidatePath("/family/archived");
		revalidatePath(`/family/items/${id}/edit`);
		revalidatePath("/archive");
		revalidatePath(`/archive/${id}`);
		return { status: "saved", version };
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		if (error instanceof Error && error.message === "CONFLICT")
			return { status: "conflict" };
		return { status: "failed" };
	}
}

export async function addPerson(name: string) {
	try {
		const { id } = await editorialService().savePerson({ name, otherNames: [], familyOnly: false });
		revalidatePath("/family/people");
		return { id, name: name.trim() };
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		return null;
	}
}

export async function addPlace(name: string) {
	try {
		const { id } = await editorialService().savePlace({
			name,
			otherNames: [],
			latitude: null,
			longitude: null,
		});
		revalidatePath("/family/places");
		return { id, name: name.trim() };
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		return null;
	}
}

const number = (value: FormDataEntryValue | null) =>
	value === null || String(value).trim() === "" ? null : Number(value);
function target(data: FormData) {
	const id = String(data.get("id") ?? "");
	return id ? { id, expectedVersion: Number(data.get("version")) } : undefined;
}
async function saveRecord(path: string, work: () => Promise<unknown>): Promise<ItemFormState> {
	try {
		await work();
		revalidatePath(path);
		return { status: "saved" };
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		if (error instanceof ZodError) return { status: "invalid" };
		if (error instanceof Error && error.message === "CONFLICT") return { status: "conflict" };
		return { status: "failed" };
	}
}

export async function savePersonForm(_previous: ItemFormState, data: FormData) {
	return saveRecord("/family/people", () =>
		editorialService().savePerson(
			{
				name: String(data.get("name") ?? ""),
				otherNames: list(data.get("otherNames")),
				familyOnly: data.get("familyOnly") === "on",
			},
			target(data),
		),
	);
}

export async function savePlaceForm(_previous: ItemFormState, data: FormData) {
	return saveRecord("/family/places", () =>
		editorialService().savePlace(
			{
				name: String(data.get("name") ?? ""),
				otherNames: list(data.get("otherNames")),
				latitude: number(data.get("latitude")),
				longitude: number(data.get("longitude")),
			},
			target(data),
		),
	);
}
```

- [ ] **Step 3: `src/components/record-picker.tsx`**

```tsx
"use client";
import { useState } from "react";
import { copy } from "@/locales/he";

type Option = { id: string; name: string };

// Search-and-add picker. Selected ids are submitted as repeated hidden inputs
// named `name`; "add" creates the record through the given server action.
export function RecordPicker({
	label,
	name,
	options: initialOptions,
	selected,
	onSelectedChange,
	create,
}: {
	label: string;
	name: string;
	options: Option[];
	selected: string[];
	onSelectedChange: (ids: string[]) => void;
	create: (name: string) => Promise<Option | null>;
}) {
	const [options, setOptions] = useState(initialOptions);
	const [query, setQuery] = useState("");
	const [busy, setBusy] = useState(false);
	const needle = query.trim();
	const matches = options.filter(
		(option) => !selected.includes(option.id) && option.name.includes(needle),
	);
	async function add() {
		setBusy(true);
		const created = await create(needle);
		setBusy(false);
		if (!created) return;
		setOptions((current) => [...current, created]);
		onSelectedChange([...selected, created.id]);
		setQuery("");
	}
	return (
		<fieldset>
			<legend>{label}</legend>
			{selected.map((id) => (
				<input key={id} type="hidden" name={name} value={id} />
			))}
			<ul>
				{selected.map((id) => (
					<li key={id}>
						{options.find((option) => option.id === id)?.name}{" "}
						<button
							type="button"
							onClick={() => onSelectedChange(selected.filter((value) => value !== id))}
						>
							×
						</button>
					</li>
				))}
			</ul>
			<label>
				{copy.items.search}
				<input value={query} onChange={(event) => setQuery(event.target.value)} />
			</label>
			{needle && (
				<ul>
					{matches.slice(0, 10).map((option) => (
						<li key={option.id}>
							<button
								type="button"
								onClick={() => {
									onSelectedChange([...selected, option.id]);
									setQuery("");
								}}
							>
								{option.name}
							</button>
						</li>
					))}
				</ul>
			)}
			{needle && !options.some((option) => option.name === needle) && (
				<button type="button" onClick={add} disabled={busy}>
					{copy.items.addNew}: {needle}
				</button>
			)}
		</fieldset>
	);
}
```

- [ ] **Step 4: `src/components/item-form.tsx`**

```tsx
"use client";
import { useActionState, useState } from "react";
import { addPerson, addPlace, saveItem, type ItemFormState } from "@/app/family/items/actions";
import type { RevisionView } from "@/services/item-view";
import { itemTypes } from "@/services/item-input";
import { formatDate } from "@/lib/format-date";
import { copy } from "@/locales/he";
import { RecordPicker } from "./record-picker";

type Option = { id: string; name: string };
const empty: RevisionView = {
	title: "",
	description: "",
	types: [],
	date: { kind: "unknown" },
	tags: [],
	people: [],
	places: [],
};

// Every field lives in React state, so a conflict or a failed save never
// clears what the member typed (React resets uncontrolled forms after actions).
export function ItemForm({
	id,
	version,
	initial = empty,
	people,
	places,
}: {
	id?: string;
	version?: number;
	initial?: RevisionView;
	people: Option[];
	places: Option[];
}) {
	const [state, submit, pending] = useActionState(saveItem, {
		status: "idle",
		version,
	} as ItemFormState);
	const [title, setTitle] = useState(initial.title);
	const [description, setDescription] = useState(initial.description);
	const [types, setTypes] = useState<string[]>(initial.types);
	const [dateKind, setDateKind] = useState(initial.date.kind);
	const [dateStart, setDateStart] = useState(initial.date.kind === "unknown" ? "" : initial.date.start);
	const [dateEnd, setDateEnd] = useState(initial.date.kind === "range" ? initial.date.end : "");
	const [precision, setPrecision] = useState(
		initial.date.kind === "unknown" ? "year" : initial.date.precision,
	);
	const [approximate, setApproximate] = useState(
		initial.date.kind === "unknown" ? false : initial.date.approximate,
	);
	const [tags, setTags] = useState(initial.tags.join(", "));
	const [personIds, setPersonIds] = useState(initial.people.map((p) => p.id));
	const [placeIds, setPlaceIds] = useState(initial.places.map((p) => p.id));
	// Versions only grow, so the highest one known is current: the page prop
	// (refreshed after lifecycle actions), the last save, or the conflict's
	// latest version (the next save then deliberately targets it).
	const known = [version, state.version, state.latest?.version].filter(
		(value): value is number => value !== undefined,
	);
	const currentVersion = known.length ? Math.max(...known) : undefined;
	const invalid = (field: string) => state.status === "invalid" && state.fields?.includes(field);
	return (
		<form action={submit}>
			{id && <input type="hidden" name="id" value={id} />}
			{currentVersion !== undefined && (
				<input type="hidden" name="version" value={currentVersion} />
			)}
			<label>
				{copy.items.title}
				<input
					name="title"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					required
					maxLength={200}
					aria-invalid={invalid("title")}
				/>
			</label>
			<label>
				{copy.items.description}
				<textarea
					name="description"
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					maxLength={20000}
					rows={8}
				/>
			</label>
			<fieldset aria-invalid={invalid("types")}>
				<legend>{copy.items.types}</legend>
				{itemTypes.map((type) => (
					<label key={type}>
						<input
							type="checkbox"
							name="types"
							value={type}
							checked={types.includes(type)}
							onChange={(event) =>
								setTypes(
									event.target.checked ? [...types, type] : types.filter((t) => t !== type),
								)
							}
						/>
						{copy.items.typeNames[type]}
					</label>
				))}
			</fieldset>
			<fieldset aria-invalid={invalid("date")}>
				<legend>{copy.items.date}</legend>
				<select
					name="dateKind"
					value={dateKind}
					onChange={(event) => setDateKind(event.target.value as typeof dateKind)}
				>
					{(["unknown", "single", "range"] as const).map((kind) => (
						<option key={kind} value={kind}>
							{copy.items.dateKinds[kind]}
						</option>
					))}
				</select>
				{dateKind !== "unknown" && (
					<>
						<label>
							{copy.items.dateStart}
							<input
								type="date"
								name="dateStart"
								value={dateStart}
								onChange={(event) => setDateStart(event.target.value)}
								required
							/>
						</label>
						{dateKind === "range" && (
							<label>
								{copy.items.dateEnd}
								<input
									type="date"
									name="dateEnd"
									value={dateEnd}
									onChange={(event) => setDateEnd(event.target.value)}
									required
								/>
							</label>
						)}
						<label>
							{copy.items.precision}
							<select
								name="datePrecision"
								value={precision}
								onChange={(event) => setPrecision(event.target.value as typeof precision)}
							>
								{(["day", "month", "year", "decade"] as const).map((value) => (
									<option key={value} value={value}>
										{copy.items.precisions[value]}
									</option>
								))}
							</select>
						</label>
						<label>
							<input
								type="checkbox"
								name="dateApproximate"
								checked={approximate}
								onChange={(event) => setApproximate(event.target.checked)}
							/>
							{copy.items.approximate}
						</label>
					</>
				)}
			</fieldset>
			<label>
				{copy.items.tags}
				<input name="tags" value={tags} onChange={(event) => setTags(event.target.value)} />
			</label>
			<RecordPicker
				label={copy.items.people}
				name="personIds"
				options={people}
				selected={personIds}
				onSelectedChange={setPersonIds}
				create={addPerson}
			/>
			<RecordPicker
				label={copy.items.places}
				name="placeIds"
				options={places}
				selected={placeIds}
				onSelectedChange={setPlaceIds}
				create={addPlace}
			/>
			<button type="submit" disabled={pending}>
				{copy.items.save}
			</button>
			<p role="status">
				{state.status === "saved" && copy.items.saved}
				{state.status === "invalid" && copy.items.invalid}
				{state.status === "conflict" && copy.items.conflict}
				{state.status === "failed" && copy.items.failed}
			</p>
			{state.status === "conflict" && state.latest && (
				<aside aria-label={copy.items.latest}>
					<h2>{copy.items.latest}</h2>
					<p>{state.latest.working.title}</p>
					<p>{formatDate(state.latest.working.date)}</p>
					<p>{state.latest.working.description}</p>
				</aside>
			)}
		</form>
	);
}
```

- [ ] **Step 5: `src/components/item-actions.tsx`**

```tsx
"use client";
import { useActionState } from "react";
import { changeItemState, type ItemFormState } from "@/app/family/items/actions";
import type { EditorialAction, FamilyItem } from "@/services/editorial";
import { copy } from "@/locales/he";

// Shows only the actions the item's state allows.
export function ItemActions({ item }: { item: FamilyItem }) {
	const [state, submit, pending] = useActionState(changeItemState, {
		status: "idle",
	} as ItemFormState);
	const actions: [EditorialAction, string][] =
		item.state === "archived"
			? [["restore", copy.items.restore]]
			: [
					...(item.visibility === "private"
						? ([["publish", copy.items.publish]] as [EditorialAction, string][])
						: []),
					...(item.hasUnpublishedEdits
						? ([["publish", copy.items.republish]] as [EditorialAction, string][])
						: []),
					...(item.visibility === "public"
						? ([["make-private", copy.items.makePrivate]] as [EditorialAction, string][])
						: []),
					["archive", copy.items.archive],
				];
	return (
		<div>
			{actions.map(([action, label]) => (
				<form action={submit} key={action}>
					<input type="hidden" name="id" value={item.id} />
					<input type="hidden" name="version" value={item.version} />
					<input type="hidden" name="action" value={action} />
					<button type="submit" disabled={pending}>
						{label}
					</button>
				</form>
			))}
			<p role="status">
				{state.status === "conflict" && copy.items.conflict}
				{state.status === "failed" && copy.items.failed}
			</p>
		</div>
	);
}
```

Note: after a successful transition `revalidatePath` re-renders the page with the new `item.version`, so the buttons always post the current version.

- [ ] **Step 6: `src/components/person-form.tsx` and `src/components/place-form.tsx`**

```tsx
"use client";
import { useActionState, useState } from "react";
import { savePersonForm, type ItemFormState } from "@/app/family/items/actions";
import type { PersonRecord } from "@/services/editorial";
import { copy } from "@/locales/he";

export function PersonForm({ person }: { person?: PersonRecord }) {
	const [state, submit, pending] = useActionState(savePersonForm, { status: "idle" } as ItemFormState);
	const [name, setName] = useState(person?.name ?? "");
	const [otherNames, setOtherNames] = useState(person?.otherNames.join(", ") ?? "");
	const [familyOnly, setFamilyOnly] = useState(person?.familyOnly ?? false);
	return (
		<form action={submit}>
			{person && <input type="hidden" name="id" value={person.id} />}
			{person && <input type="hidden" name="version" value={person.version} />}
			<label>
				{copy.items.name}
				<input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
			</label>
			<label>
				{copy.items.otherNames}
				<input name="otherNames" value={otherNames} onChange={(e) => setOtherNames(e.target.value)} />
			</label>
			<label>
				<input
					type="checkbox"
					name="familyOnly"
					checked={familyOnly}
					onChange={(e) => setFamilyOnly(e.target.checked)}
				/>
				{copy.items.familyOnly}
			</label>
			<button type="submit" disabled={pending}>
				{person ? copy.items.save : copy.items.addNew}
			</button>
			<p role="status">
				{state.status === "saved" && copy.items.saved}
				{state.status === "invalid" && copy.items.invalid}
				{state.status === "conflict" && copy.items.conflict}
				{state.status === "failed" && copy.items.failed}
			</p>
		</form>
	);
}
```

```tsx
"use client";
import { useActionState, useState } from "react";
import { savePlaceForm, type ItemFormState } from "@/app/family/items/actions";
import type { PlaceRecord } from "@/services/editorial";
import { copy } from "@/locales/he";

export function PlaceForm({ place }: { place?: PlaceRecord }) {
	const [state, submit, pending] = useActionState(savePlaceForm, { status: "idle" } as ItemFormState);
	const [name, setName] = useState(place?.name ?? "");
	const [otherNames, setOtherNames] = useState(place?.otherNames.join(", ") ?? "");
	const [latitude, setLatitude] = useState(place?.latitude?.toString() ?? "");
	const [longitude, setLongitude] = useState(place?.longitude?.toString() ?? "");
	return (
		<form action={submit}>
			{place && <input type="hidden" name="id" value={place.id} />}
			{place && <input type="hidden" name="version" value={place.version} />}
			<label>
				{copy.items.name}
				<input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
			</label>
			<label>
				{copy.items.otherNames}
				<input name="otherNames" value={otherNames} onChange={(e) => setOtherNames(e.target.value)} />
			</label>
			<label>
				{copy.items.latitude}
				<input name="latitude" inputMode="decimal" dir="ltr" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
			</label>
			<label>
				{copy.items.longitude}
				<input name="longitude" inputMode="decimal" dir="ltr" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
			</label>
			<button type="submit" disabled={pending}>
				{place ? copy.items.save : copy.items.addNew}
			</button>
			<p role="status">
				{state.status === "saved" && copy.items.saved}
				{state.status === "invalid" && copy.items.invalid}
				{state.status === "conflict" && copy.items.conflict}
				{state.status === "failed" && copy.items.failed}
			</p>
		</form>
	);
}
```

A saved person or place form re-renders with the new version through `revalidatePath`; the page passes the fresh record as a new `key` (see Step 9) so the form state resets to it.

- [ ] **Step 7: Replace `src/app/family/page.tsx`**

```tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMember } from "@/services/access";
import { editorialService } from "@/services/editorial-runtime";
import { SessionPanel } from "@/components/session-panel";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function Family() {
	let member: Awaited<ReturnType<typeof requireMember>>;
	let items: Awaited<ReturnType<ReturnType<typeof editorialService>["listItems"]>>;
	try {
		member = await requireMember();
		items = await editorialService().listItems();
	} catch (error) {
		if (
			error instanceof Error &&
			["UNAUTHORIZED", "FORBIDDEN"].includes(error.message)
		)
			redirect("/sign-in");
		throw new Error(copy.error);
	}
	const logoutPending =
		(await cookies()).get("kobob_logout_pending")?.value === "1";
	return (
		<SessionPanel logoutPending={logoutPending}>
			{!logoutPending && (
				<>
					<h1>{copy.family}</h1>
					<nav aria-label={copy.items.list}>
						<Link href="/family/items/new">{copy.items.add}</Link>{" "}
						<Link href="/family/archived">{copy.items.archived}</Link>{" "}
						<Link href="/family/people">{copy.items.people}</Link>{" "}
						<Link href="/family/places">{copy.items.places}</Link>
						{member.role === "admin" && (
							<>
								{" "}
								<Link href="/admin/members">{copy.members}</Link>
							</>
						)}
					</nav>
					<h2>{copy.items.list}</h2>
					{items.length === 0 ? (
						<p>{copy.items.none}</p>
					) : (
						<ul>
							{items.map((item) => (
								<li key={item.id}>
									<Link href={`/family/items/${item.id}/edit`}>{item.title}</Link>{" "}
									· {item.visibility === "public" ? copy.items.public : copy.items.private}
									{item.hasUnpublishedEdits && ` · ${copy.items.unpublishedEdits}`}
								</li>
							))}
						</ul>
					)}
				</>
			)}
		</SessionPanel>
	);
}
```

`copy.foundation` is no longer used on this page; leave the string in `he.ts` (Hebrew copy changes need Yoram).

- [ ] **Step 8: Item pages**

`src/app/family/items/new/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { editorialService } from "@/services/editorial-runtime";
import { ItemForm } from "@/components/item-form";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function NewItem() {
	let people: { id: string; name: string }[];
	let places: { id: string; name: string }[];
	try {
		[people, places] = await Promise.all([
			editorialService().listPeople(),
			editorialService().listPlaces(),
		]);
	} catch (error) {
		if (error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message))
			redirect("/sign-in");
		throw new Error(copy.error);
	}
	return (
		<>
			<Link href="/family">{copy.items.backToList}</Link>
			<h1>{copy.items.add}</h1>
			<ItemForm people={people} places={places} />
		</>
	);
}
```

`src/app/family/items/[id]/edit/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { editorialService } from "@/services/editorial-runtime";
import type { FamilyItem } from "@/services/editorial";
import { ItemForm } from "@/components/item-form";
import { ItemActions } from "@/components/item-actions";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function EditItem({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	let item: FamilyItem;
	let people: { id: string; name: string }[];
	let places: { id: string; name: string }[];
	try {
		[item, people, places] = await Promise.all([
			editorialService().getItem(id),
			editorialService().listPeople(),
			editorialService().listPlaces(),
		]);
	} catch (error) {
		if (error instanceof Error && error.message === "NOT_FOUND") notFound();
		if (error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message))
			redirect("/sign-in");
		throw new Error(copy.error);
	}
	return (
		<>
			<Link href="/family">{copy.items.backToList}</Link>
			<h1>{copy.items.edit}</h1>
			<p>
				{item.visibility === "public" ? copy.items.public : copy.items.private}
				{item.hasUnpublishedEdits && ` · ${copy.items.unpublishedEdits}`}
			</p>
			{item.state === "active" && (
				<ItemForm
					id={item.id}
					version={item.version}
					initial={item.working}
					people={people}
					places={places}
				/>
			)}
			{item.state === "archived" && <h2>{item.working.title}</h2>}
			<ItemActions item={item} />
		</>
	);
}
```

The form is not keyed on the version: remounting after a save would clear the "saved" status. Its hidden `version` is the highest version it knows (see `ItemForm`), which covers saves, lifecycle actions and conflicts.

`src/app/family/archived/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { editorialService } from "@/services/editorial-runtime";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function Archived() {
	let items: Awaited<ReturnType<ReturnType<typeof editorialService>["listArchived"]>>;
	try {
		items = await editorialService().listArchived();
	} catch (error) {
		if (error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message))
			redirect("/sign-in");
		throw new Error(copy.error);
	}
	return (
		<>
			<Link href="/family">{copy.items.backToList}</Link>
			<h1>{copy.items.archived}</h1>
			{items.length === 0 ? (
				<p>{copy.items.none}</p>
			) : (
				<ul>
					{items.map((item) => (
						<li key={item.id}>
							<Link href={`/family/items/${item.id}/edit`}>{item.title}</Link>
						</li>
					))}
				</ul>
			)}
		</>
	);
}
```

- [ ] **Step 9: People and places pages**

`src/app/family/people/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { editorialService } from "@/services/editorial-runtime";
import type { PersonRecord } from "@/services/editorial";
import { PersonForm } from "@/components/person-form";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function People() {
	let people: PersonRecord[];
	try {
		people = await editorialService().listPeople();
	} catch (error) {
		if (error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message))
			redirect("/sign-in");
		throw new Error(copy.error);
	}
	return (
		<>
			<Link href="/family">{copy.items.backToList}</Link>
			<h1>{copy.items.people}</h1>
			<PersonForm />
			{people.map((person) => (
				<section className="panel" key={`${person.id}:${person.version}`}>
					<PersonForm person={person} />
				</section>
			))}
		</>
	);
}
```

`src/app/family/places/page.tsx`: the same file with `PlaceRecord`, `listPlaces`, `PlaceForm` and `copy.items.places`.

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { editorialService } from "@/services/editorial-runtime";
import type { PlaceRecord } from "@/services/editorial";
import { PlaceForm } from "@/components/place-form";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function Places() {
	let places: PlaceRecord[];
	try {
		places = await editorialService().listPlaces();
	} catch (error) {
		if (error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message))
			redirect("/sign-in");
		throw new Error(copy.error);
	}
	return (
		<>
			<Link href="/family">{copy.items.backToList}</Link>
			<h1>{copy.items.places}</h1>
			<PlaceForm />
			{places.map((place) => (
				<section className="panel" key={`${place.id}:${place.version}`}>
					<PlaceForm place={place} />
				</section>
			))}
		</>
	);
}
```

- [ ] **Step 10: Verify**

```bash
npm run lint && npm run typecheck && npm run build
```

Expected: all pass. (`npm run build` runs `scripts/migrate-production.mjs`; follow `docs/DEVELOPMENT.md` for running the build locally without a production database — if it refuses without `DATABASE_URL`, run `npx next build --webpack` instead.)

- [ ] **Step 11: Commit**

```bash
git add src/services/editorial-runtime.ts src/app/family src/components
git commit -m "feat: family screens for items, people and places"
```

---

### Task 7: Public pages, browser tests and docs

**Files:**
- Modify: `src/app/archive/page.tsx`
- Create: `src/app/archive/[id]/page.tsx`
- Create: `tests/e2e/editorial.spec.ts`
- Modify: `docs/DEVELOPMENT.md`, `docs/ROADMAP.md`, `docs/superpowers/plans/2026-11-01-family-memorial.md`, `docs/superpowers/specs/2026-11-03-item-editing-design.md`

**Interfaces:**
- Consumes: `archiveReader()` (Task 6), `formatDate`, `copy.items` (Task 5); e2e sign-in helpers copied from `tests/e2e/sign-in.spec.ts`.

- [ ] **Step 1: Public pages**

`src/app/archive/page.tsx`:

```tsx
import Link from "next/link";
import { archiveReader } from "@/services/editorial-runtime";
import { formatDate } from "@/lib/format-date";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function Archive() {
	const items = await archiveReader().listPublicItems();
	return (
		<>
			<h1>{copy.archive}</h1>
			{items.length === 0 ? (
				<p>{copy.empty}</p>
			) : (
				<ul>
					{items.map((item) => (
						<li key={item.id}>
							<Link href={`/archive/${item.id}`}>{item.title}</Link> ·{" "}
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

`src/app/archive/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { archiveReader } from "@/services/editorial-runtime";
import { formatDate } from "@/lib/format-date";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
// Private, archived and unknown ids all get the same not-found page.
export default async function ArchiveItem({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const item = await archiveReader().getPublicItem(id);
	if (!item) notFound();
	return (
		<article>
			<h1>{item.title}</h1>
			<p>{formatDate(item.date)}</p>
			<p>{item.types.map((type) => copy.items.typeNames[type]).join(", ")}</p>
			{item.description && <p style={{ whiteSpace: "pre-line" }}>{item.description}</p>}
			{item.people.length > 0 && (
				<p>
					{copy.items.people}: {item.people.map((person) => person.name).join(", ")}
				</p>
			)}
			{item.places.length > 0 && (
				<p>
					{copy.items.places}: {item.places.map((place) => place.name).join(", ")}
				</p>
			)}
			{item.tags.length > 0 && <p>{item.tags.join(", ")}</p>}
		</article>
	);
}
```

- [ ] **Step 2: Write the browser tests** `tests/e2e/editorial.spec.ts`

```ts
import { test, expect, type Browser, type Page } from "@playwright/test";
import { createDatabase } from "../../src/lib/database";
import { createAuthSystem } from "../../src/lib/auth-system";
import { readServerConfig, requireTestDatabaseUrl } from "../../src/lib/config";
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
	await page.getByLabel(copy.items.title).fill(title);
	await page.getByLabel(copy.items.typeNames.picture).check();
	await page.getByRole("button", { name: copy.items.save }).click();
	await page.waitForURL(/\/family\/items\/[^/]+\/edit$/);
	return page.url().split("/").at(-2) as string;
}

test("publishing shows the published version until the next publish", async ({ page }) => {
	await signIn(page, "editor@example.test");
	const id = await createItem(page, "Synthetic first");
	await page.goto(`/archive/${id}`);
	await expect(page.getByRole("heading", { name: copy.notFound })).toBeVisible();
	await page.goto(`/family/items/${id}/edit`);
	await page.getByRole("button", { name: copy.items.publish }).click();
	await expect(page.getByText(copy.items.public).first()).toBeVisible();
	await page.goto(`/archive/${id}`);
	await expect(page.getByRole("heading", { name: "Synthetic first" })).toBeVisible();
	await page.goto(`/family/items/${id}/edit`);
	await page.getByLabel(copy.items.title).fill("Synthetic second");
	await page.getByRole("button", { name: copy.items.save }).click();
	await expect(page.getByRole("status").first()).toHaveText(copy.items.saved);
	await page.goto(`/archive/${id}`);
	await expect(page.getByRole("heading", { name: "Synthetic first" })).toBeVisible();
	await page.goto(`/family/items/${id}/edit`);
	await page.getByRole("button", { name: copy.items.republish }).click();
	await page.goto(`/archive/${id}`);
	await expect(page.getByRole("heading", { name: "Synthetic second" })).toBeVisible();
	await page.goto("/archive");
	await expect(page.getByRole("link", { name: "Synthetic second" })).toBeVisible();
});

test("a stale save keeps the member's input and shows the latest version", async ({ browser }) => {
	const a = await newMemberPage(browser, "a@example.test");
	const b = await newMemberPage(browser, "b@example.test");
	const id = await createItem(a, "Synthetic original");
	await b.goto(`/family/items/${id}/edit`);
	await a.goto(`/family/items/${id}/edit`);
	await a.getByLabel(copy.items.title).fill("Saved by A");
	await a.getByRole("button", { name: copy.items.save }).click();
	await expect(a.getByRole("status").first()).toHaveText(copy.items.saved);
	await b.getByLabel(copy.items.title).fill("Typed by B");
	await b.getByRole("button", { name: copy.items.save }).click();
	await expect(b.getByRole("status").first()).toHaveText(copy.items.conflict);
	await expect(b.getByLabel(copy.items.title)).toHaveValue("Typed by B");
	await expect(b.getByRole("complementary", { name: copy.items.latest })).toContainText(
		"Saved by A",
	);
	await b.getByRole("button", { name: copy.items.save }).click();
	await expect(b.getByRole("status").first()).toHaveText(copy.items.saved);
	await a.reload();
	await expect(a.getByLabel(copy.items.title)).toHaveValue("Typed by B");
});

test("archive hides an item and restore brings it back as private", async ({ page }) => {
	await signIn(page, "editor@example.test");
	const id = await createItem(page, "Synthetic archived");
	await page.getByRole("button", { name: copy.items.publish }).click();
	await expect(page.getByRole("button", { name: copy.items.makePrivate })).toBeVisible();
	await page.getByRole("button", { name: copy.items.archive }).click();
	await page.goto("/family/archived");
	await expect(page.getByRole("link", { name: "Synthetic archived" })).toBeVisible();
	await page.goto(`/archive/${id}`);
	await expect(page.getByRole("heading", { name: copy.notFound })).toBeVisible();
	await page.goto(`/family/items/${id}/edit`);
	await page.getByRole("button", { name: copy.items.restore }).click();
	await expect(page.getByText(copy.items.private).first()).toBeVisible();
	await page.goto(`/archive/${id}`);
	await expect(page.getByRole("heading", { name: copy.notFound })).toBeVisible();
});

test("family pages are Hebrew RTL and require sign-in", async ({ page }) => {
	for (const path of ["/family/items/new", "/family/archived", "/family/people", "/family/places"]) {
		await page.goto(path);
		await expect(page).toHaveURL(/\/sign-in$/);
	}
	await signIn(page, "editor@example.test");
	for (const path of ["/family/items/new", "/family/archived", "/family/people", "/family/places"]) {
		await page.goto(path);
		await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
		await expect(page.locator("html")).toHaveAttribute("lang", "he");
	}
});
```

If the not-found heading text differs, read `src/app/not-found.tsx` and assert on the heading it renders (`copy.notFound`). If `page.goto(link)` lands on the confirm page with a different button label, copy the exact steps from `confirmSignIn` in `tests/e2e/sign-in.spec.ts`.

- [ ] **Step 3: Run the browser tests**

Run: `npm run test:e2e -- tests/e2e/editorial.spec.ts`
Expected: 4 passed. Then the full suite: `npm run test:e2e` — all pass (11 existing + 4).

- [ ] **Step 4: Run the full check**

Run: `npm run check`
Expected: lint, typecheck, unit, integration, e2e and build all pass. Record the counts.

- [ ] **Step 5: Docs**

- `docs/DEVELOPMENT.md`: add a short "Item editing" paragraph to the implemented-scope section: the routes (`/family`, `/family/items/new`, `/family/items/[id]/edit`, `/family/archived`, `/family/people`, `/family/places`, `/archive`, `/archive/[id]`), the models, that the Hebrew strings under `copy.items` are proposed and await Yoram's approval, and the test counts from Step 4.
- `docs/ROADMAP.md`: phase 1 status → "Implemented on `dev` (PR #…); awaiting release".
- `docs/superpowers/plans/2026-11-01-family-memorial.md`: under Task 3 add a dated note: "2026-11-03: archive items implemented per the item-editing spec and plan; achievements and editable pages remain (roadmap phase 2)." Do not tick Task 3's boxes that cover achievements/pages.
- `docs/superpowers/specs/2026-11-03-item-editing-design.md`: add a dated "Implemented" line under Status, and note the `publishedAt` addition.

- [ ] **Step 6: Commit**

```bash
git add src/app/archive tests/e2e/editorial.spec.ts docs
git commit -m "feat: public archive pages and item editing browser flows"
```
