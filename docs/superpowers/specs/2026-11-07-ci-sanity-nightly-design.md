# CI split, sanity gate and nightly full cycle

**Date:** 2026-11-07. **Status:** approved design, not yet implemented.

## Problem

The pull-request workflow (`.github/workflows/ci.yml`, named `Verify`) is one
job that runs everything in sequence: lint, typecheck, unit, integration, all
36 browser tests and the production build. The last green run took 5m35s, of
which the browser suite against `next dev --webpack` took 3m50s (about 70%).
The suite grows with every slice, so the PR gate keeps getting slower. The
name and the single-job shape also differ from `hetzy8/sana` and
`hetzy8/getmygoals`, whose workflows are named `CI` and split into jobs.

## Decisions

Taken with the owner on 2026-11-07:

1. **Parallel jobs, as in getmygoals.** `Unit tests` and `E2E tests` start
   together. PR wall time is the E2E job alone, about 2 minutes. A broken
   unit job costs a few extra runner minutes while the E2E job finishes; that
   is accepted for the faster feedback.
2. **Broad sanity set, about 12 tests.** Selected by a Playwright tag, not by
   file: with three spec files, file selection is too coarse.
3. **Nightly full cycle on `dev`.** Lint, typecheck, unit, integration, the
   whole browser suite and the build. Failure notification is GitHub's own
   email to the workflow's last committer; no alert action, secret or issue
   bot.

## PR workflow: `.github/workflows/ci.yml`, named `CI`

Unchanged: trigger on `pull_request` only, `paths-ignore` for `docs/**` and
`**.md`, `permissions: contents: read`, SHA-pinned `actions/checkout` and
`actions/setup-node`, Node 24 with the npm cache, the `postgres:17.7-alpine`
service with the synthetic `kobob_test` credential, and
`NEXT_TELEMETRY_DISABLED`.

Changed:

- `name: CI`.
- `concurrency.group: ci-${{ github.workflow }}-${{ github.event.pull_request.number }}`
  with `cancel-in-progress: true`. The workflow runs only on pull requests, so
  the number is always present.
- Two jobs, both with the Postgres service and the same checkout, setup-node,
  `npm ci`, `npm run db:generate` and `npm run db:test:migrate` steps:

| Job id | Display name | Steps after setup | Timeout |
|---|---|---|---|
| `unit` | Unit tests | `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration` | 10 min |
| `e2e` | E2E tests | `npx playwright install --with-deps chromium`, `npm run test:e2e:sanity`, `npm run build` | 15 min |

The build stays in the PR workflow because the browser tests run against
`next dev`, so `next build` is the only production-compile check a PR gets.
It belongs to the E2E job rather than a third job to keep two runner setups
per PR; it adds about 30 seconds.

Not adopted from sana: Playwright browser cache, Next build cache and the apt
mirror retry loop. Here the browser install takes about 20 seconds and the
build about 30 seconds, so the caching would add steps and a cache key to
maintain for little gain. Revisit if either step grows past a minute.

## Sanity selection

Playwright 1.64 supports `test(title, { tag: "@sanity" }, fn)`. Twelve tests
get the tag:

- `tests/e2e/health.spec.ts`: health reports a reachable database without
  caching or leaking detail.
- `tests/e2e/sign-in.spec.ts`: requires explicit confirmation, removes the
  token from the address bar, then enforces revocation; locks private UI when
  logout fails without claiming server revocation, then retries; shows an
  honest expired-link state and blocks raw auth endpoints; administrator
  adds, changes, revokes and restores membership; anonymous and ordinary
  family users cannot view membership; the media route gives visitors the
  same 404 for any id.
- `tests/e2e/editorial.spec.ts`: explains that publishing needs cleared
  rights, then allows it; archive hides an item and restore brings it back as
  private; a stale save keeps the member's input and shows the latest
  version; family pages are Hebrew RTL and require sign-in; the family list
  pages and filters items needing review.

Scripts in `package.json`:

- `test:e2e` stays the full suite.
- New `test:e2e:sanity`: `NODE_OPTIONS=--conditions=react-server playwright test --grep @sanity`.
- `check` keeps running the full suite; it is the local equivalent of the
  nightly, not of the PR gate.

Rule for new tests: a test joins the sanity set when it proves an access
boundary, a revocation, a publish decision or the Hebrew RTL shell for a flow
that production users reach; everything else runs nightly. The set is listed
in `docs/DEVELOPMENT.md` by its selection rule and the grep command, not by
copying the titles, so the tag in the test file stays the single source.

## Nightly: `.github/workflows/nightly.yml`, named `Nightly`

- `on.schedule: cron "0 2 * * *"` (02:00 UTC, before the 03:00 UTC database
  backup) and `workflow_dispatch: {}`.
- `permissions: contents: read`; `concurrency.group: nightly`,
  `cancel-in-progress: false`.
- One job `full`, display name `Full cycle`, `timeout-minutes: 30`, the same
  Postgres service and setup steps as CI, with `actions/checkout` given
  `ref: dev`. GitHub runs scheduled workflows from the default branch's file,
  so the explicit ref is what makes the nightly test the integration branch.
  `dev` is a permanent branch here (delete-on-merge is off), so no fallback
  probing as in getmygoals.
- Steps after setup: `npm run lint`, `npm run typecheck`, `npm run test:unit`,
  `npm run test:integration`, `npx playwright install --with-deps chromium`,
  `npm run test:e2e`, `npm run build`.
- No artifacts are uploaded. Traces and screenshots are disabled in the
  Playwright config to keep credential-bearing output out of CI, and that
  stays so.

Failure notification: GitHub emails the actor of a scheduled run, which is
the last person who committed to the workflow file. That is the owner. If a
nightly fails and no email arrives, check the notification settings before
adding tooling.

## Documentation changes

- `docs/OPERATIONS.md`, Branch and release flow: replace "CI (`Verify`) runs on
  pull requests only" with the two-job `CI` description, the sanity rule and
  the nightly. Release checklist step 1 also requires the latest `Nightly` on
  `dev` to be green, or its failure understood.
- `docs/DEVELOPMENT.md`, verification section: name the two jobs, the sanity
  tag and grep, the rule for tagging, and that `npm run check` equals the
  nightly cycle.
- `AGENTS.md`: the "Merge on CI green" line names the `CI` workflow; the "Keep
  CI bounded" rule gains: new browser tests join the sanity set only under
  the rule above.

## Out of scope

Running the browser tests against `next build` + `next start` instead of
`next dev` (would cut the suite's time but changes the test server and the
`KOBOB_E2E` dist-dir handling); a known-failures gate; alert issues or email
actions; required status checks or branch protection changes; caches.

## Acceptance

- A PR run shows two checks, `Unit tests` and `E2E tests`, under workflow
  `CI`, and finishes in about 2 minutes when green.
- `npm run test:e2e:sanity` runs exactly the twelve tagged tests locally.
- A manual `Nightly` dispatch checks out `dev`, runs the full cycle and
  passes; its run page shows the ref.
- `gh run list --workflow=ci.yml` and `--workflow=nightly.yml` are the
  commands the docs name.
