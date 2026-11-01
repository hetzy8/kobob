# Yaki Hetz Family Memorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development if delegation is explicitly selected. Track checked steps only with actual evidence.

**Goal:** Deliver a public Hebrew RTL memorial with a unified archive, private-by-default family content and shared family editing.

**Architecture:** One Next.js application with server services enforcing public
visibility, verified active membership, editorial revisions and Yoram-only
administration. PostgreSQL holds structured data; private object storage holds
originals and validated derivatives. Sources and playback representations remain
separate from item identities.

**Tech stack:** Accepted direction: Vercel, Neon PostgreSQL, private R2 and
Resend. Proposed implementation: TypeScript/React/Next.js, Tailwind, Prisma,
maintained email auth, focused unit/integration tests and Playwright. Exact
compatible versions and auth library remain to select and prove.

**Spec:** [Product rules](../specs/2026-11-01-family-memorial-design.md).
**Page proposal:** [Sitemap](../specs/2026-11-01-site-structure-design.md).
**Status:** revised planning draft; development authorized; Task 0 in progress.
No app, dependencies, infrastructure or real-data import exists. This replaces
the earlier fully private/read-only implementation tasks.

## Global constraints

- English GitHub work; Hebrew product with root `lang="he"` and `dir="rtl"`.
- Public reads expose only explicitly public items and permitted representations.
- All active verified family members read all private items and edit everyone's items.
- Family members publish, return to private, archive and restore any item.
  New/imported/restored items are private. Only Yoram manages users/permanently deletes.
- Revision checks are atomic; stale edits/transitions preserve input and require review.
- No public signup, automatic first admin, real content/secrets in Git or production test data.
- Audio/video plays within item pages; external providers are explicitly supported,
  with attribution/fallbacks. Articles support flexible representations.
- Private originals/derivatives never enter public storage or shared caches.
- Configurable validated origin, relative links, stable domain-independent IDs.
- Proposed verification expiry: **15 minutes**; absolute session maximum: **7 days**.
- Proposed recovery targets: **RPO 24 hours, RTO 1 working day**.
- Keep one small app, focused dependencies and bounded CI. Costs/capacity are unknown;
  paid services, provisioning, imports, DNS changes and launch have separate gates.

## Review focus

1. Private titles, counts, relationships and thumbnails must not leak through public search/achievements (Task 4).
2. Unpublishing/archiving during media playback blocks the next request, including ranges and alternate hosts (Task 5).
3. Concurrent edits, publication and restoration cannot reverse newer decisions or lose unsaved input (Task 3).
4. Email scanners, replay, revocation and configured-origin changes cannot create unauthorized sessions (Task 1).
5. Broken/restricted sources and import retries cannot invent success, publish content or overwrite later edits (Tasks 5–6).

## Task 0: Resolve design gates and record evidence

**Files:** product spec, page proposal, `docs/ARCHITECTURE.md`, this plan.

- [x] Record agreed public/private roles, shared editing, archive/restore,
  conflicts, external sources, unified archive, achievements and domain flexibility.
  Evidence: consolidated product spec; these are decisions, not implemented tests.
- [x] Record Yoram's choice: public-item edits remain private working revisions
  until explicit publication; the existing published revision stays public.
- [ ] Review proposed page structure and finalize schema/transition details.
- [ ] Choose email link versus code. Review compatible maintained auth/Prisma/
  Next.js versions and engines using primary docs and package metadata; pin the
  selected set during Task 1. Record alternatives and any deviations.
- [ ] Define permanent-deletion/retention semantics before enabling that action.
  It can remain disabled while the recoverable archive is built.
- [ ] Commit the reviewed design/plan update on a focused branch; no release tag.

**Done when:** first implementation slice has an unambiguous approved design and
a supported candidate integration. Task 1 proves that integration using isolated
synthetic data before building family flows on it. Provider budget/real content
are later gates, not grounds to use production data for development.

## Task 1: Foundation and verified membership boundary

**Files:** `package.json`, lockfile, `tsconfig.json`, lint/test config,
`src/app/layout.tsx`, `src/app/globals.css`, `src/lib/config.ts`,
`src/lib/database.ts`, `src/lib/auth.ts`, `src/services/access.ts`,
`src/services/sign-in.ts`, `prisma/schema.prisma`, `prisma/migrations/`,
`.env.example`, `.gitignore`, bounded `.github/workflows/ci.yml`,
`tests/unit/config.test.ts`, `tests/integration/sign-in.test.ts`,
`tests/integration/database.test.ts`, `tests/e2e/sign-in.spec.ts`.

**Interfaces:** `requireMember(): Promise<MemberContext>` returns
`{id, role, accessVersion}` only after fresh session, verified email and active
membership checks. `requireAdmin(): Promise<MemberContext>` adds role enforcement.
`requestSignIn(email: string): Promise<void>` has a generic public result.
Config is server-only; test config must reject production database targets.

- [ ] Write failing config/auth contract tests with synthetic members and mocked
  email: uninvited/unverified users, expiry, atomic concurrent replay, revocation,
  malicious redirects, failed delivery and seven-day absolute session expiry.
  For links, GET/prefetch cannot consume; for codes, test selected attempt limits.
  Direct library endpoints must not create membership or bypass the service
  checks. Prove issuance throttles work across independent request instances.
- [ ] Pin the reviewed compatible dependencies and implement the minimal auth
  integration. Disable signup/stale auth caches; bind outstanding credentials
  to membership version; use durable issuance throttles. Reject the candidate
  if these contract tests cannot pass without weakening the spec.
- [ ] Add Hebrew RTL root, safe empty shell, secure cookies, no-store protected
  responses, callback no-referrer, generic request states and logout retry behavior.
  No invented Hebrew/family copy: use privately approved copy or clearly labelled
  synthetic development fixtures until approval.
- [ ] Exercise schema migration round trip on an isolated test database and
  prove production targets are rejected before connections/mutations.
- [ ] Establish `npm run lint`, `npm run typecheck`, `npm run test:unit`,
  `npm run test:integration`, `npm run test:e2e` and `npm run build`.
  Run applicable checks, auth browser flows, RTL root and config-secret assertions.
- [ ] Add bounded PR CI with isolated data and mocked delivery; document actual
  setup commands and limitations in README. Commit only after successful checks.

## Task 2: Yoram-only membership administration

**Files:** `scripts/bootstrap-admin.ts`, `src/services/members.ts`,
`src/app/(admin)/admin/members/page.tsx`, validated actions,
`tests/integration/members.test.ts`, `tests/e2e/members.spec.ts`.

**Interfaces:** `addMember(email: string): Promise<string>`,
`revokeMember(id: string): Promise<void>` and verified email-change operations
require `requireAdmin()`. Bootstrap is an explicit operator command with no
address default; the member list never enters public Git.

- [ ] Write failing tests for family/anonymous management calls, unique normalized
  email, concurrent last-admin protection, revoked session/pending credential,
  verified email change and re-invitation without revival of old access.
- [ ] Implement transactional status/access-version changes, session/credential
  invalidation and minimal audit. Preserve public reading after revocation.
- [ ] Add direct role checks on every endpoint and clear admin failure states.
  Verify bootstrap, membership integration/browser flows with mocked delivery.
- [ ] Run relevant checks and commit with evidence.

## Task 3: Shared editing, lifecycle and conflict handling

**Files:** archive/page/achievement models in `prisma/schema.prisma` and migrations,
`src/services/editorial.ts`, `src/services/audit.ts`,
`src/app/(family)/family/page.tsx`, `src/app/(family)/family/items/new/page.tsx`,
`src/app/(family)/family/items/[id]/edit/page.tsx`,
`src/app/(family)/family/archived/page.tsx`, page/achievement editing adapters,
`tests/integration/editorial.test.ts`, `tests/e2e/editorial.spec.ts`.

**Interfaces:** `createItem(input: ItemInput): Promise<ItemId>`,
`updateItem(id: string, expectedRevision: number, input: ItemInput): Promise<ItemRevision>`,
`transitionItem(id: string, expectedRevision: number, action: EditorialAction): Promise<ItemRevision>`.
`EditorialAction` is publish, make-private, archive or restore. These require
`requireMember()`; validated input never supplies authority. Permanent deletion
is a distinct admin-only operation, enabled only after its retention policy exists.

- [ ] Write failing tests: one member edits another's item; all family users read
  private items; new/imported items private; public-to-private; archive; restoration
  private; member permanent deletion denied; invalid/unsafe publication rejected.
- [ ] Test that saving edits to a public item leaves published fields, sources
  and media unchanged publicly; drafts are family-only. Explicit publication
  switches revisions atomically. Unpublish/archive blocks old public revisions
  too, and restoration never republishes them.
- [ ] Add concurrency tests using the same expected revision: only one mutation
  succeeds, including save-versus-publish and archive-versus-restore. Failed stale
  requests leave data unchanged and preserve browser input for review.
- [ ] Implement revision-checked transactions, validated/sanitized fields, source
  and delivery associations, audit and approved public-edit semantics from Task 0.
- [ ] Build shared forms and recovery view, with explicit visibility controls and
  no silent publication. Apply the same rules to achievements and editable pages.
- [ ] Run service/direct endpoint tests and conflict/recovery browser flows;
  update docs and commit after checks pass.

## Task 4: Public memorial, achievements and unified archive

**Files:** `src/services/archive.ts`, `src/services/memorial.ts`,
`src/services/achievements.ts`, `src/app/(site)/page.tsx`,
`src/app/(site)/about/page.tsx`, `src/app/(site)/achievements/page.tsx`,
`src/app/(site)/archive/page.tsx`, `src/app/(site)/archive/[id]/page.tsx`,
`src/locales/he.ts`, `tests/integration/visibility.test.ts`,
`tests/e2e/memorial.spec.ts`.

**Interfaces:** `readPublicItem(id: string): Promise<PublicItem | null>` returns
an explicit public field projection only for non-archived public records.
`readFamilyItem(id: string): Promise<FamilyItem | null>` enforces `requireMember()`.
`searchPublicArchive(query: ArchiveQuery): Promise<PublicResults>` filters before
counts/snippets; `searchFamilyArchive(query: ArchiveQuery): Promise<FamilyResults>`
enforces membership. Achievement/page services follow the same visibility rules.

- [ ] Write failing public success/private denial tests for items, search,
  mixed-media filters, Hebrew search, counts, related records, achievements and
  metadata. Check anonymous, active, revoked and alternate-host requests.
- [ ] Implement the reviewed page proposal using minimal field projections,
  synthetic content, accessible navigation and honest empty/error states.
  Use one archive rather than separate media sections. Known date ordering must
  not fabricate dates for undated achievements.
- [ ] Keep audience-specific responses out of shared caches. Test unpublish/archive
  and lack of private snippets/social cards, including linked private records.
- [ ] Run RTL/mobile/keyboard, mixed-direction, reduced-motion and contrast flows;
  verify all routes against the page proposal. Record limitations and commit.

## Task 5: Safe media, sources and embedded playback

**Files:** `src/services/media.ts`, `src/services/sources.ts`,
`src/lib/embed-providers.ts`, `src/app/api/media/[id]/route.ts`,
family upload/finalization adapters, accessible player/source components,
`tests/integration/media.test.ts`, `tests/integration/sources.test.ts`,
`tests/e2e/media.spec.ts`.

**Interfaces:** `readMediaForRequest(id: string, range?: string): Promise<MediaResponse>`
derives current audience on the server, verifies item association/state and safe
representation, and checks membership for private media. Upload/finalize requires
`requireMember()` and ownership of a valid quarantine grant, not original authorship
of the shared item. Source URLs never authorize arbitrary server fetches.

- [ ] Write failing tests for anonymous upload/private reads, spoofed formats,
  unsafe URLs/iframe HTML, oversized/quarantined files, original-key exposure,
  failed processing, unpublished associations and range/cache leaks.
- [ ] Verify current host limits using representative approved test files before
  selecting transport. Use short-lived family-authorized write-only quarantine
  grants when bodies exceed verified app limits; validate before finalization.
- [ ] Implement private originals/derivatives, safe document/image/audio/video
  representations and authorized streaming. Check current visibility on each
  new range/read request; archived media is family-only through recovery.
- [ ] Select supported external providers from actual sources. Add embedded audio/
  video with attribution/source links and tested privacy/failure behavior.
  Test removed/restricted/unsupported sources, referrer isolation and no private
  metadata in third-party requests. Articles retain link-only capability.
- [ ] Run integration/browser playback, visibility-change, failure and RTL flows
  with mocked storage/provider responses. Measure transfer/processing limits;
  document constraints and commit. Extra services require demonstrated need.

## Task 6: Private migration and website authority

**Files:** `src/services/imports.ts`, private import tooling,
family/admin import-status and processing-retry pages, synthetic importer tests,
`docs/DATA-MIGRATION.md`.

- [ ] Write failing idempotence, conflict-preservation, hash-mismatch, missing-file,
  duplicate-preservation and failed-retry tests; assert zero automatic publication.
- [ ] Implement source/KOB/rights/review preservation and reconciliation using
  synthetic fixtures. Retry must never overwrite newer website edits.
- [ ] After separate import authorization, snapshot/reconcile privately, dry-run,
  import catalog and copy/verify originals without moving/deleting Drive sources.
- [ ] Rehearse restore, freeze source catalog briefly, reconcile final delta and
  obtain cutover approval. Make website edits authoritative; no silent sync.
- [ ] Verify counts/hashes/states and family processing/retry controls; record
  evidence outside public Git where private data is involved, then commit code/docs.

## Task 7: Costs, recovery, domain portability and release

**Files:** `src/lib/config.ts` domain tests, deployment configuration,
`docs/OPERATIONS.md`, selected backup/restore runbooks. Ops integration is a
separate authorized PR, not an implicit change to another repository.

- [ ] Confirm numeric cap, provider capacity/regions and backup retention/destination
  before provisioning. Use names-only Bitwarden mappings and isolated credentials.
- [ ] Prove origin changes preserve IDs/relative links while rejecting malicious
  hosts/redirects. Document callbacks/cookies, pending links, sender, DNS/TLS and
  old-domain redirects without assuming continued control of an abandoned domain.
- [ ] Test encrypted database/media backup restoration in an isolated environment:
  verify private/public/archive states, revisions, media, order and revoked access.
- [ ] Verify actual daily ops reporting coverage and current development status;
  no invented production health checks. Add real workflow/health signals when available.
- [ ] Run lint/type/unit/integration/e2e/build and the spec acceptance matrix.
  Verify every deployed hostname and approved mailbox with separate release authority.
- [ ] Obtain launch authorization, deploy reviewed main SHA, verify recovery and
  rollback, then tag that verified deployed commit with annotated `vX.Y.Z`.
  Record actual costs, checks, SHA and limitations. No docs-only production tag.

## Plan review

Interfaces distinguish public field projections, family access and administrator
operations. Tasks cover all product acceptance criteria; the page proposal maps
to Tasks 3–5, and domain/cost/restore work maps to Task 7. Remaining decisions
are explicit in Task 0 rather than replaced with old read-only assumptions.
This is planning work for review, not a claim that any test or service exists.
