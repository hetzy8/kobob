# Session handoff

**Updated:** 2026-11-04 (current state below); the sections after it are the
2026-11-01 record, kept for history; where they disagree, this section wins.
**Purpose:** resume from repository evidence, not chat or machine-local memory.
Read AGENTS.md, README.md, docs/README.md, the product spec and plan before changes.

## Current state (2026-11-04)

- Production: v0.3.0 (`995d901`, PR #23) at https://kobob.vercel.app. Release
  records: OPERATIONS.md → Branch and release flow.
- Sign-in email through Resend is live from `mail.kobob.org`; the first
  administrator was bootstrapped and the first sign-in email arrived.
- Roadmap phase 1, item editing, is live (PR #20; spec
  `docs/superpowers/specs/2026-11-03-item-editing-design.md`). Yoram approved
  the `copy.items` Hebrew strings on 2026-11-04, kept the full decade-range
  wording and chose family-only as the default for people added from an
  item's picker (PR #22). No items have been published yet.
- Postponed by Yoram: `kobob.org` as the site address (order in
  OPERATIONS.md → Before provisioning). Still to do in Vercel project
  settings: Node.js 24.x.
- Next product work: see [ROADMAP.md](ROADMAP.md) (phase 2, achievements and
  memorial pages, then media in R2).

## Repository and current work

- Repository: `hetzy8/kobob`; default branch: `main` (production). Since
  2026-11-01 feature PRs target `dev`; see OPERATIONS.md → Branch and release flow.
- PRs #1 and #2 were merged. Yoram then explicitly requested implementation.
- Current branch: `feat/member-access-foundation`.
- [PR #3](https://github.com/hetzy8/kobob/pull/3) is open; do not merge by assumption.
- Last verified implementation commit: `3a61e6966b33610501ad7f5bb2c29c0d50fd4850`.
  [CI run 41323082083](https://github.com/hetzy8/kobob/actions/runs/41323082083)
  completed successfully. Handoff documentation is a subsequent change; check
  current PR/head/checks again after restart, including whether Yoram merged it.
- Local `next-env.d.ts` has an automatic dev-server change from production type
  references to `.next/dev/types/`. It is not a deliberate application change;
  preserve/inspect it and do not accidentally include it in a feature commit.
- The last local preview was running at `http://127.0.0.1:3000` using Node 24
  and `npm run dev -- --hostname 127.0.0.1 --port 3000`. It may not survive the
  restart; check existing listeners before starting another server.
- The temporary `kobob-test` PostgreSQL compose service was stopped and removed
  after checks. Its tmpfs database has no persistent data to recover.

## Latest wording decisions

The whole website interface is Hebrew, not an English development interface.
All user-facing strings belong in `src/locales/he.ts`; independent browser
expectations are in `tests/fixtures/he-interface.json`. GitHub engineering
prose, identifiers and comments remain English.

Yoram supplied the exact Hebrew display name now stored in the locale's
`title` and `documentTitle` fields. It is used in the wordmark, homepage and
browser title. Do not guess another spelling or invent biography/dates/content.

Latest label corrections are already implemented and pushed:

- Achievements: remove the former “and prizes” qualifier.
- Archive: use the approved label without the definite article.
- Sign in: remove the “Family” qualifier.

The literal approved Hebrew values are in the locale/fixture resources, not
repeated as Hebrew engineering discussion here. Navigation, metadata, empty
states, sign-in, confirmation, logout and error/not-found pages are Hebrew.
The initial display name is approved; other family material is still absent.

## Agreed product model

- Public website, with every item private by default. Public visitors see only
  deliberately public records and their permitted media/metadata.
- Verified email plus Yoram-managed active membership enables family access.
  Every family member reads all private items and edits everyone's items.
- Members add, publish, return to private, archive recoverably and restore any
  item. Restoration always returns to private; only Yoram permanently deletes
  or manages membership.
- Public-item edits remain private working revisions until explicit publication;
  the previously published version stays public meanwhile. Atomic revision
  checks reject stale edits/transitions and preserve unsaved input.
- One searchable archive with media-type filters. Dedicated Achievements section
  links recognition to archive evidence. Sources and delivery representations
  are separate so mixed media and external references need no duplicate items.
- Embed supported video/audio; retain attribution and original-source fallback.
  Article presentation stays flexible. No arbitrary embedding, scraping or
  inferred publication rights. External access remains the publisher's.
- Initial domain `kobobhetz.org` may change. Relative navigation, configured
  validated canonical origin and stable domain-independent IDs remain mandatory.
- Small monolith and low recurring cost. Accepted provider direction: Vercel,
  Neon, private R2 and Resend. No resources provisioned, live delivery, real-data
  import, DNS changes or deployment. Numeric budget/capacity remain unconfirmed.
- Yoram reports ops is familiar and wants daily tracking. Actual coverage is
  unverified here; no ops repository/configuration was changed.

## Implemented scope and evidence

See [DEVELOPMENT.md](DEVELOPMENT.md) for exact commands and limitations.

Implemented only the initial local foundation: Next.js public empty shells,
Hebrew RTL root, confirmation/sign-in UI, protected family shell, server-only
configuration/services, Prisma membership/session/verification schema/migration,
Better Auth integration, fresh membership/role checks and durable throttles.
It is not a populated archive or completed editorial/admin website.

- Node 24 (`.nvmrc`, package engines); pinned Next.js 16.4.3, React 19.3.1,
  Prisma 7.10.1, Better Auth 1.7.15. No global Node installation was changed;
  the machine default was Node 20, so select Node 24 explicitly for checks.
- Confirmation links are the initial engineering default from the plan, not
  a claimed explicit user choice of links over codes. Tokens are hashed and
  transported in URL fragments, removed before explicit POST consumption.
  Raw auth/signup/library endpoints are not exposed.
- Sessions and credentials bind to membership access version. Protected reads
  recheck active status, verified email, session validity and current role.
  Seven-day absolute sessions; 15-minute links; no stale cookie cache/refresh.
- Atomic coarse-first issuance caps and hashed keys; absent a verified proxy
  resolver, clients share a conservative bucket. Production per-IP integration
  is not established. Old buckets are pruned without a scheduled service.
- Runtime live sender deliberately throws “not configured”; tests inject mock
  delivery. No real mail or invitations were sent. No public test-token endpoint.
- Webpack replaces locally blocked Turbopack CSS evaluation. Biome replaced an
  advisory-affected ESLint tree and reduced dependencies. The replacement audit
  reported zero vulnerabilities; do not assume this stays true indefinitely.
- Tests: 18 unit, 30 real PostgreSQL integration, six Chromium browser tests.
  Complete checks, lint/types/build and the latest CI all passed. The final
  label-only update additionally passed lint/build and an HTTP-rendered copy
  check, then the entire updated branch passed CI at the commit linked above.
- Browser checks cover scanner-safe confirmation, revocation, logout retry,
  hydration readiness, mobile overflow and seven-page Hebrew UI/metadata.
- Fresh review found a real library sign-out defect: Better Auth swallowed DB
  deletion failures. The adapter now confirms deletion first, returns 503
  without clearing the retry cookie on failure, and suppresses raw library logs.
  A real PostgreSQL deletion-failure regression proves failure and retry.
- Initial CI exposed cold-route navigation exceeding a five-second URL assertion.
  Tests now assert the actual confirmation 303/location and await navigation.
  Subsequent clean-checkout CI passed; no blanket retries were added.
- CI is bounded to 15 minutes, read-only repo permissions, isolated PostgreSQL,
  mocked email and Chromium. It does not deploy or use production secrets.
- Interactive browser plugin had no connected browser; regression tests used
  Playwright. Do not claim manual visual inspection or final visual approval.

## Known follow-ups and next slice

Two Minor auth review findings are documented in DEVELOPMENT.md and must be
resolved before live delivery/real membership:

1. A failed send currently deletes all pending links for that member, including
   successfully delivered sibling attempts. Bind failure cleanup to its own
   verification record; test overlapping successful/failed sends.
2. Verification deletion authorization can veto expired/internal lock cleanup.
   Separate safe housekeeping from authentication-consumption proof, retaining
   expiry, version, revocation and replay denial. Test internal lock and expired/
   revoked record cleanup without allowing cleanup to authorize a session.

Next planned implementation is Task 2: explicit verified admin bootstrap and
Yoram-only member administration, using synthetic fixtures until real identities
are privately supplied. Do not seed a guessed email or promote the first visitor.
Then implement shared editorial revisions/lifecycle, archive/search/achievements,
media/embeds and authorized migration. None of these later flows exists yet.

Preserve separate gates for costs/capacity, sender/secrets, real-data import,
backup/restore rehearsal, domain changes and release. Use Bitwarden/ops conventions
without copying other applications' values. The source collection remains in
Drive; no files were moved. Permanent deletion awaits retention/cleanup policy.

## Repository protection

At Yoram's request, [main ruleset](https://github.com/hetzy8/kobob/rules/26310833)
was copied exactly from Sana: active on the default branch, block deletion and
non-fast-forward updates, administrator bypass. No mandatory reviews/status
checks were added. Continue focused branches and PRs into `dev`; do not infer merge or
release authorization from the bypass or from a green check.

## Member-administration update

Local Task 2 implementation now includes explicit unverified bootstrap, admin
listing/add/revoke/restore/member-email actions, transactional invalidation and
minimal membership audit. See DEVELOPMENT.md. Owner email recovery/change remains
restricted and live delivery remains disconnected. No real member was created.
Earlier statements that administration does not exist describe the prior slice.
Recheck current PR/head/CI before resuming. Housekeeping PR #6 was still open at
the start of this slice; do not assume its fix merged into main.
