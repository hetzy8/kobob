# Local development and verification

**Status:** initial local foundation implemented; not deployed. No real family
content, production membership, provider resources or live mail delivery exists.

## Current slice

Implemented: Next.js page shells for Home, About Yaki, Achievements,
Archive, sign-in and verification; Hebrew RTL root; a protected family shell;
validated server configuration; Prisma membership/session/verification schema
and migration; Better Auth confirmation links; fresh membership/role checks;
durable issuance throttles; logout retry that hides private UI on failure.

The public pages are honest empty shells, not the completed archive. Interface
copy is Hebrew in `src/locales/he.ts`, including navigation, sign-in and error
states. Yoram requested the shorter Achievements label and plain Sign in.
The Hebrew display name was supplied explicitly by Yoram. No biography,
awards, dates or rights are invented.
User management/bootstrap, shared editing, publication, archive/restore, content
search, media, embeds and imports remain future slices. The access service's
revocation behavior is tested through synthetic database changes; the admin
revocation workflow does not exist yet.

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

Live email is deliberately disconnected in `src/lib/runtime.ts`. Browser tests
issue synthetic links using an injected mock sender in test setup; there is no
test mailbox/token endpoint or production bypass. The Hebrew sign-in page states
that live delivery is unavailable in this preview. Configuring a real sender,
secrets and delivery requires its separate operational work; no mail was sent.

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
