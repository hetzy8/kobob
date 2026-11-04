# Local development and verification

**Status (2026-11-04):** access foundation, member administration, sign-in
email and item editing are in production (v0.3.0, see OPERATIONS.md). The only
production member is the first administrator; no real family content exists.

## Current slice

Implemented: Next.js page shells for Home and Life story (About);
public search and published-item pages; sign-in and verification pages; Hebrew RTL
root; a protected family shell; validated server configuration; Prisma
membership/session/verification schema and migration; Better Auth
confirmation links; fresh membership/role checks; durable issuance throttles;
logout retry that hides private UI on failure.

Home and Life story are honest empty shells; `/search` and
`/items/[id]` show published items only. Interface
copy is Hebrew in `src/locales/he.ts`, including navigation, sign-in and error
states. Yoram requested the shorter Achievements label and plain Sign in.
The Hebrew display name was supplied explicitly by Yoram. No biography,
awards, dates or rights are invented.
Content search, media, embeds and imports remain future slices. Member
administration exists at `/admin/members`; the access service's revocation
behavior is also tested through synthetic database changes.

Item editing (2026-11-03): family members create, edit, publish, make private,
archive and restore archive items with dates, people, places, types and tags.
Routes: `/family`, `/family/items/new`, `/family/items/[id]/edit`,
`/family/archived`, `/family/people`, `/family/places`, and the public
`/archive` and `/archive/[id]`, which show only the published revision. Models:
`Item`, `ItemRevision`, `Person`, `Place` and `EditorialAudit`. The Hebrew
strings under `copy.items` were approved by Yoram on 2026-11-04.
Checks at this slice: 76 unit tests, 60 integration tests, 28 browser tests
(11 existing and 17 for item editing), lint, typecheck and the webpack build
pass (Node 20 locally; the project targets Node 24).

Public navigation and search (2026-11-05, phase 2 slice 1): visitors see Life
story and Search; signed-in members also see Archive, which opens `/family`.
Achievements and the public `/archive` were removed. `/search` matches the
published revision's text, tags, non-family-only people, places and years
(`src/services/search.ts`). The `searchPage` strings await Yoram's approval.
Checks at this slice: 81 unit, 65 integration and 30 browser tests, lint,
typecheck and the webpack build pass.

## Toolchain and engineering choices

- Use Node **24**, npm and Docker for isolated database checks. `.nvmrc` and
  package engines record the runtime; package versions and lockfile are pinned.
- Next.js 16.4.3, React 19.3.1, Prisma 7.10.1 and Better Auth 1.7.15 were selected
  after checking registry compatibility and primary docs. Prisma 8 was a
  prerelease with a different engine floor, so it was not selected.
- Confirmation links are the reversible initial engineering default from the
  plan. This is not a claimed explicit preference from Yoram for links over codes.
  Credentials are hashed; the link carries the raw credential only in its URL
  fragment, which is removed in the browser before explicit POST confirmation.
- Raw library endpoints are not exposed. User creation is disabled; membership
  must be explicitly seeded by future authorized administration. Verification
  records and sessions bind to the membership access version. Cookies/sessions
  never substitute for a fresh active/verified member and role lookup.
- The proposed durations are implemented as a 15-minute link and seven-day
  absolute session lifetime. No session cookie cache or indefinite refresh.
- Issuance is limited atomically to 3/address, 20/client bucket and 50/global
  per fixed 15-minute window. Keys are HMACs rather than stored email/IP strings.
  Without a verified platform address resolver, every client shares the same
  conservative bucket. Do not trust client-supplied proxy headers. Verify the
  deployment integration before claiming distinct per-IP production throttling.
  Coarse limits run before creating address rows; old buckets are pruned when
  a new global window starts. This is not an application-wide DDoS service.
- Webpack is used because Turbopack's production CSS evaluator hit this local
  environment's port-binding restriction even after escalation. The app still
  uses supported Next.js App Router APIs; bundler performance can be revisited.
- Biome replaces the initial ESLint tree after npm reported 16 moderate lint-tool
  dependency advisories with no compatible in-range fix. Removal reduced the
  dependency tree substantially; the replacement install's audit reported zero
  vulnerabilities. Biome does not supply Next-specific ESLint rules, so retain
  type checks, browser tests and review. Recheck advisories before release.

## Public page preview

With Node 24 selected:

```sh
npm ci
npm run db:generate
npm run dev
```

Open `http://localhost:3000`. Empty public pages render without database/auth
configuration. Protected access requires valid configuration and membership.
No development account is automatically promoted or exposed.

`.env.example` has empty placeholders only. Future local configuration must
use an isolated development database, a locally generated secret of at least
32 characters and the correct canonical origin. Do not use production `.env`
files, real member lists or another app's credentials. The migration scripts
below do not load `.env` files or fall back to `DATABASE_URL`.

Live email is sent only in production, through Resend, when `RESEND_API_KEY`
and `EMAIL_FROM` pass `readEmailConfig` (`src/lib/runtime.ts`). Development
and tests never construct the Resend client: browser tests issue synthetic
links through an injected mock sender, and there is no test mailbox or
production bypass. Reserved test domains (`example.*`, `test.com`, `.test`,
`.invalid`, `.local`…) are never sent to, even in production. In production
delivery runs after the response (`src/lib/link-sender.ts`, Next's `after`),
so response time cannot reveal membership. Delivery failures are logged as
codes only; the member always sees the same confirmation so the form cannot
reveal membership.

## Isolated test database

The compose service binds only `127.0.0.1:55439`, uses dedicated synthetic
credentials and keeps PostgreSQL data in tmpfs. Never run these suites against
production or an existing family-data database. They remove synthetic records
from the dedicated test database between cases.

```sh
npm run db:test:up
export TEST_DATABASE_URL='postgresql://kobob_test:synthetic-local-test-only@127.0.0.1:55439/kobob_test'
npm run db:test:migrate
npx playwright install chromium
npm run check
npm run db:test:down
```

The last command removes only the dedicated compose service/network and loses
its temporary data. Do not run database-mutating test commands concurrently.
The guard requires an explicit loopback PostgreSQL URL selecting database and
user `kobob_test`, with no connection query parameters. CI uses the same guard
with its isolated PostgreSQL service on port 5432. The migration round-trip
check creates a schema inside a transaction and rolls it back; it is not a
production down-migration or a backup restore drill.

`npm run check` runs lint, types, unit, integration, browser tests and build.
`npm test` is the unit suite only; it is not evidence of complete verification.
Browser fixtures use the real auth integration and database with mocked email,
then exercise the actual HTTP routes. Traces/screenshots are disabled to avoid
storing credential-bearing browser artifacts. Never publish auth failure
artifacts or private fixture output without review.

The PR workflow is bounded to 15 minutes, read-only repository permissions,
one Chromium browser, isolated PostgreSQL and no live email/storage. No deployment
or ops mutation is included. Its remote run is not verified until GitHub executes it.

## Next work

Implement explicit admin bootstrap/member management, then shared editorial
revisions/lifecycle, visibility-filtered archive/achievements, safe media and
supported external players. Follow the spec and plan; provider budget, real-data
imports, domain changes and launch retain separate gates. Keep permanent deletion
disabled until retention/cleanup policy is agreed. Family-approved Hebrew copy
and visual references are needed before final presentation work.

## Initial review follow-ups

The fresh review found that Better Auth 1.7.15 can report successful sign-out
after database deletion fails. The adapter now confirms session removal itself
before clearing cookies/reporting success, disables raw library error logging,
and has a real PostgreSQL deletion-failure regression with a successful retry.
Network-failure retry is separately covered in the browser suite.

Two Minor cleanup findings are deferred for the next auth maintenance slice:
failed delivery currently invalidates all that member's pending links rather
than just the failed attempt, and verification authorization hooks can veto
library housekeeping of expired/internal lock rows. These affect link availability
and database cleanup, not authorization: expired/revoked credentials remain denied.
Resolve both before enabling live delivery/real membership; test overlapping
successful/failed sends and safe cleanup separately from consumption proof.

## Copilot review fixes

PR #3 review follow-ups persist pending logout in a browser session cookie.
The family server page omits private children while that intent is present,
including before hydration; successful logout or explicit fresh confirmation
clears it. This is a UI lock, not a substitute for server session revocation.
Verification handles initial and subsequent hash fragments, removes credentials
from the address bar and clears prior errors. Access requests enforce a 4,096-byte
limit during streaming and cancel oversized bodies before parsing.

Verification: each regression failed before its fix; the complete local check
passed with 18 unit, 31 PostgreSQL integration and seven Chromium tests, plus
lint, type checking and production build. Tests use synthetic data and mock mail.

## Failed-delivery cleanup follow-up

Failed delivery now removes only the verification identifier captured for that
issuance request via AsyncLocalStorage. An overlapping successful delivery keeps
its credential. The new PostgreSQL regression failed before the change and passes
afterward. An additional expired-credential test confirms cleanup leaves no
session; this path already passed before any housekeeping-hook change.
The broader internal-lock/deletion-hook follow-up remains under investigation.
Full local verification passed: 18 unit, 33 integration, seven browser tests,
lint, types and production build, using synthetic data and mocked delivery.

## Server launchers

With Node 24 selected and dependencies installed, run either
`./scripts/start-server.sh` or `python3 scripts/start-server.py` from any directory.
Both start the development server at `http://127.0.0.1:3000` in the foreground;
Ctrl+C stops it. Extra Next.js arguments are forwarded, for example
`./scripts/start-server.sh --port 3200`. The Bash entry point requires Python 3.
The launchers check installed project dependencies. If the active Node is not
24, they select Node 24 through `npm exec --yes --package=node@24`, using npm's
cache or downloading that runtime when necessary. This leaves global Node
unchanged. They do not start a database or configure services.

## Verification housekeeping investigation

The remaining cleanup issue was reproduced with an expired unbound verification
row: library housekeeping left it behind because the deletion hook rejected its
missing membership fields. Expired rows may now be deleted before membership
proof is considered; that path never sets session-creation proof. Valid credential
consumption still requires current active membership and matching access version.
The unbound-row regression failed before the fix and passed afterward. The full
local check passed: 18 unit, 34 integration and seven browser tests, lint, types
and build. Earlier follow-up notes above describe historical findings; the
expired-row housekeeping issue is now resolved. Member administration remains
unimplemented.

## First public homepage image

Yoram selected a Downloads collage for the public site on 2026-11-01.
The homepage now displays its full composition with generic Hebrew alt text
and no invented caption, identities or dates. Only a 1600-square WebP derivative
is stored in public/images; EXIF/XMP are stripped. The source remains outside
Git. This explicit selection applies to this collage, not the remaining archive.
Production build passed; lint completed with the three existing cookie warnings.

## Local member administration

The family page links administrators to `/admin/members`. Every list/action
requires a current verified active admin session and rechecks role, status and
access version inside a serialized PostgreSQL transaction. Adding grants ordinary
unverified membership only. Revocation, restoration and email changes advance the
access version and remove sessions and pending credentials in the same transaction.
Restored members and changed addresses must verify again. No email is sent by
these controls. Duplicate addresses and failures return honest generic feedback;
typed addresses remain available for retry.

A transaction-scoped advisory lock serializes administration and bootstrap,
including concurrent last-verified-active-admin checks. A private audit table
records actor/target IDs, action and time without copying email values. No role
promotion UI, member deletion or production data is included. Administrator email
changes are deliberately unavailable in the UI; a verified owner-recovery flow
is still required before enabling that operation for the sole administrator.

`npm run admin:bootstrap` is an explicit interactive operator command. Configure
an isolated local database and server settings in the process environment first;
the command does not load production `.env` files. It asks for the address and
an explicit BOOTSTRAP confirmation, refuses an existing administrator or existing
member, and leaves email unverified. Its code is tested with synthetic addresses.
The production bootstrap ran on 2026-11-03 (command in OPERATIONS.md → Email
delivery); signing in by email then verifies the address. Never put an actual
address in Git or shell history.

Browser tests use a separate `.next-e2e` build directory so a local preview can
remain running. `KOBOB_TEST_PORT=3310` selects a free test port when another
project uses the default 3100; test config and mocked links share that origin.

Verification for this slice: full local `npm run check` passed with 18 unit,
40 real PostgreSQL integration and ten Chromium tests, plus lint/types/build.
Lint retains three existing document.cookie warnings. Browser coverage includes
anonymous/member denial, the full admin workflow, and an open admin form submitted
after role removal with input preserved. The Next test server clears the runner's
react-server NODE_OPTIONS because Next sets its own runtime conditions.
A fresh code review checked authorization, bootstrap, invalidation and concurrency;
the owner-email restriction is now explicit and failed-form input is preserved.
