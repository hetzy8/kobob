# Yaki Hetz Family Memorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans when implementation is authorized. Steps use checkbox (`- [ ]`) syntax for tracking. Do not execute this plan during documentation initialization.

**Goal:** Deliver an accessible Hebrew RTL memorial with verified email access,
Yoram-managed membership, approved content and private photographs.

**Architecture:** A single Next.js application with centralized server-side
authorization and services for members, editorial content and media. A
relational database stores membership and content; a maintained auth library
handles email verification/session primitives; a private object store holds
media. No separate backend or worker is proposed.

**Tech Stack:** Proposed Next.js/TypeScript/React, Tailwind, PostgreSQL/Prisma,
Auth.js-compatible email links, Resend, private S3-compatible storage, Vitest
and Playwright. See the compatibility gate below; exact versions are not pinned
in this docs-only repository.

**Spec:** [Family memorial design](../specs/2026-11-01-family-memorial-design.md).

**Status:** not started; draft for review. The user requested this plan, not
its execution. All filenames below are future files unless already in the
documentation tree.

## Global constraints

- All GitHub work is English; the product is Hebrew with root `lang="he"` and `dir="rtl"`.
- Access requires verified email **and** active membership managed by Yoram.
- No public signup or automatic first-user admin; no real data/assets in Git.
- Proposed email-link expiry: **15 minutes**; maximum session lifetime: **7 days**.
- Proposed accepted uploads: JPEG, PNG, WebP; maximum **20 MiB per image**.
- Private content is never publicly cached or stored in `public/`.
- Proposed recovery targets: **RPO 24 hours, RTO 1 working day**.
- Confirm the spec's open decisions before implementation; do not provision or
  contact anyone during documentation work.

## Review focus

1. Email scanners/prefetch must not consume a link; replay and concurrent confirmation must fail safely (Task 2).
2. Revocation/email changes during a live session must block the next read and pending links (Tasks 2–3).
3. Direct media/thumbnail URLs, draft IDs and deployment aliases must not bypass membership (Tasks 4–5).
4. Mixed Hebrew and Latin emails/URLs must retain readable order and keyboard access on mobile (Tasks 2 and 4).
5. Delivery/storage failures and restoration must not create false success or revive revoked access (Tasks 2, 5 and 6).

## Task 0: Confirm product and implementation decisions

**Files:** the linked spec, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`.

- [ ] Obtain Yoram's decisions on private/public scope, content sections,
  contribution permissions, admin/recovery identity, providers, budget and
  retention. Keep personal addresses and content outside GitHub.
- [ ] Record approved decisions and the implementation instruction in the spec;
  adjust downstream tasks if the read-only member proposal changes.
- [ ] Verify a supported auth-library/Prisma/Next.js combination can enforce
  invite-only membership, confirmation-before-consumption and immediate session
  revocation. If it cannot, record and review an alternative before scaffolding.
- [ ] Commit the reviewed decision update on a feature branch; no production tag.

**Done when:** a builder can identify approved scope and integration choices
without inferring them from an unanswered question. Subsequent tasks are blocked
until this gate is satisfied.

## Task 1: Application foundation and isolated verification

**Create:** `package.json`, lockfile, `src/app/layout.tsx`, `src/app/globals.css`,
`src/lib/config.ts`, `prisma/schema.prisma`, `.env.example`,
`tests/integration/database.test.ts`, `.github/workflows/ci.yml`.

**Produces:** the chosen framework/library versions, migration workflow,
`config` validated only on the server, and isolated database test fixtures.

- [ ] Write a layout test asserting Hebrew language, RTL direction and visible
  keyboard focus; add config tests rejecting missing server secrets without
  printing values. Start with synthetic fixtures only.
- [ ] Scaffold only the approved components; define Member, editorial, Media
  and Audit models alongside the auth library's compatible session/token models.
  Enforce unique normalized member email and valid role/status values.
- [ ] Run the layout/config tests and database migration round trip against an
  ephemeral database. Prove production URLs are refused by the test harness.
- [ ] Establish and run `npm run lint`, `npm run typecheck`, `npm run test:unit`
  and `npm run test:integration`; add bounded PR CI with least permissions.
- [ ] Update setup documentation with commands that actually work; commit.

## Task 2: Verified email access without public signup

**Create:** `src/lib/auth.ts`, `src/services/access.ts`,
`src/services/sign-in.ts`, `src/app/(public)/sign-in/page.tsx`,
`src/app/(public)/verify/page.tsx`, auth-library handlers under
`src/app/api/auth/`, `src/locales/he.ts`, `tests/integration/sign-in.test.ts`.

**Interfaces:** `requireMember(): Promise<MemberContext>` returns
`{id, role, accessVersion}` only after current session, verification and active
membership checks; `requireAdmin(): Promise<MemberContext>` adds role enforcement.
`requestSignIn(email: string): Promise<void>` has a generic public outcome;
internal delivery failures are observable without leaking membership or tokens.

- [ ] Write failing tests for uninvited email, unverified member, atomic token
  replay, 15-minute expiry, access-version mismatch, malicious redirect and
  delivery failure. Assert no session is issued on failure.
- [ ] Test GET/prefetch does not consume the link and explicit confirmation does;
  test throttling shared across requests/instances using a durable store.
- [ ] Integrate the chosen auth library through the membership services; implement
  generic sign-in states, verified confirmation, revocable seven-day sessions,
  private/no-store responses, secure cookies and local-only redirect validation.
- [ ] Test protected pages/actions directly, not only layout redirects. Test
  successful logout revocation/cookie clearing and network-failure UI locking
  with an explicit retry, without claiming offline server revocation.
- [ ] Run targeted unit/integration tests and Playwright Hebrew/Latin email,
  expired-link and keyboard flows with mocked email; commit.

## Task 3: Yoram's membership administration

**Create:** `scripts/bootstrap-admin.ts`, `src/services/members.ts`,
`src/app/(admin)/admin/members/page.tsx`, its validated action module,
`tests/integration/members.test.ts`.

**Interfaces:** `addMember(email: string): Promise<MemberId>`,
`revokeMember(id: string): Promise<void>` and a verified email-change workflow
all require `requireAdmin()` and write minimal audit events. Bootstrap is an
explicit operator command, not a public route, with no guessed email default.

- [ ] Write failing tests that a reader cannot enumerate/manage members, a
  revoked member's live session/link fails on its next request, re-invitation
  does not revive old tokens, and the final administrator cannot be removed.
- [ ] Implement transactional member status/access-version updates and session/
  token invalidation. Bootstrap requires a privately supplied address and its
  verification; no real email or token is committed in fixtures or instructions.
- [ ] Add clear Hebrew admin states and tests for duplicate normalized addresses,
  a failed email change, and concurrent revocation/last-admin protection.
- [ ] Run access/admin integration tests and the admin Playwright flow; commit.

## Task 4: Memorial reading and Yoram's editorial workflow

**Create:** `src/services/memorial.ts`, protected home/biography/gallery/memories
pages under `src/app/(memorial)/`, admin editing pages under
`src/app/(admin)/admin/content/`, `tests/integration/memorial.test.ts`,
`tests/e2e/memorial.spec.ts`.

**Interfaces:** `getPublishedPage(slug: string): Promise<PublishedPage | null>`
requires membership; draft/save/publish/unpublish operations require admin and
validated input. Rendering consumes only the minimal permitted data.

- [ ] Write failing tests for anonymous reads, direct draft-ID access, reader
  mutations, unsafe rich text, content ordering and unknown slugs.
- [ ] Implement the approved sections with draft/publication state, sanitization,
  empty states, semantic headings and publication audit events. Use synthetic
  placeholder text, never invented facts about Yaki.
- [ ] Test unpublishing at service and route level, private/no-store metadata,
  no private social card content, and access denial on alternate hosts.
- [ ] Run RTL/keyboard/mobile-width Playwright scenarios, mixed-direction text,
  reduced-motion and contrast checks. Yoram supplies and approves Hebrew copy
  and visual direction before family content is imported.
- [ ] Run relevant checks, document limitations, and commit.

## Task 5: Private photographs and thumbnails

**Create:** `src/services/media.ts`, `src/app/api/media/[id]/route.ts`, admin
upload actions, `tests/integration/media.test.ts`, `tests/e2e/media.spec.ts`.

**Interfaces:** `readPublishedMedia(id: string): Promise<AuthorizedMedia>`
checks membership and publication; `uploadMedia(input: ValidatedImage)` is
admin-only and stores private objects/derivatives. IDs never grant access alone.

- [ ] Write failing tests for anonymous/reader uploads, oversized files, spoofed
  MIME types, SVG/HTML, unpublished assets, guessed IDs and cache/header leaks.
- [ ] Verify the chosen host's upload/body limits. If 20 MiB cannot pass through
  the app, use short-lived admin-authorized write-only grants to private
  quarantine storage, followed by server-side size/type validation and
  finalization. Test that unfinalized objects are never readable/published.
- [ ] Implement JPEG/PNG/WebP validation, the approved size cap, EXIF-stripped
  delivery copies, private storage and authorized streaming. Keep originals
  private under the agreed retention policy; avoid public signed bearer download URLs. Upload-only quarantine grants
  do not authorize reads and must expire.
- [ ] Test that revocation and unpublishing block the next media/thumbnail read;
  test storage failure leaves no published broken attachment and reports failure.
- [ ] Run integration/browser image and RTL gallery flows with a mock/private
  test bucket, then document cleanup/retention and commit.

## Task 6: Preservation, operations and launch readiness

**Files:** `docs/OPERATIONS.md`, deployment configuration and health route selected
for the approved provider; a separate authorized ops PR for project/secret maps.

- [ ] Record dated provider costs and approved budget. Configure names-only
  secret targets through ops' existing Bitwarden process, with isolated project
  data and least-privilege roles; never copy other project secret values.
- [ ] Implement and test backups/restore under the approved retention and
  recovery targets. Restore into a separate environment; verify ordering,
  private media, draft visibility and revoked-user denial. Record evidence.
- [ ] Verify sender DNS and delivery using an approved test mailbox; prepare
  domain/TLS and canonical redirect changes for a separately authorized launch.
- [ ] Run type/lint/unit/integration/e2e checks and the spec acceptance matrix.
  Review every deployment hostname for access bypass and private caching.
- [ ] Obtain launch authorization; deploy the reviewed main SHA, verify access
  and rollback readiness, then create the annotated production version tag.
  Update actual status and monitoring evidence; never mark an unrun checklist done.

## Plan review and handoff

Tasks cover sign-in, user control, RTL reading/editing, media privacy and
preservation. The review-focus cases map to explicit tests above. Proposed
interfaces use the same MemberContext/access-version boundary throughout.
The plan is deliberately not a code scaffold. Revisit filenames and library
adapter details after Task 0, then execute only the approved scope in focused
PRs. A documentation merge is not permission to start Task 1.
