# CI split, sanity gate and nightly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the PR workflow to `CI`, split it into parallel `Unit tests` and `E2E tests` jobs that run a tagged sanity subset of the browser suite, and add a `Nightly` workflow that runs the full cycle on `dev`.

**Architecture:** Playwright tags (`@sanity`) on twelve existing tests select the PR subset through a new `test:e2e:sanity` script; the workflows only call npm scripts. `.github/workflows/ci.yml` keeps its trigger, service and pinned actions but becomes two jobs. `.github/workflows/nightly.yml` is one job on a cron with an explicit `ref: dev` checkout. Docs name the workflows and the tagging rule.

**Tech Stack:** GitHub Actions, Playwright 1.64 (`test(title, { tag }, fn)`), npm scripts, PostgreSQL 17 service container. Spec: `docs/superpowers/specs/2026-11-07-ci-sanity-nightly-design.md`.

## Global Constraints

- Workflows keep `permissions: contents: read`, SHA-pinned `actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09` and `actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444`, Node `'24'`, the `postgres:17.7-alpine` service with user `kobob_test`, password `synthetic-ci-only`, database `kobob_test`, and `NEXT_TELEMETRY_DISABLED: '1'`.
- No new dependencies, caches, alert actions, artifact uploads or branch-protection changes.
- `test:e2e` and `check` stay the full suite. Only `test:e2e:sanity` is new.
- Exactly twelve tests carry `@sanity`, the ones listed in the spec. No others.
- Workflow files are linted before commit with `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest` (no local actionlint is installed).
- Local browser runs need the test database: `npm run db:test:up`, `export TEST_DATABASE_URL='postgresql://kobob_test:synthetic-local-test-only@127.0.0.1:55439/kobob_test'`, `npm run db:test:migrate`; `npm run db:test:down` afterwards.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Work on branch `chore/ci-sanity-nightly` (already created from `dev`).

---

### Task 1: Tag the sanity tests and add the `test:e2e:sanity` script

**Files:**
- Modify: `tests/e2e/health.spec.ts:3`
- Modify: `tests/e2e/sign-in.spec.ts:81,104,134,234,265,298`
- Modify: `tests/e2e/editorial.spec.ts:71,173,205,652,741`
- Modify: `package.json:17` (scripts block)

**Interfaces:**
- Produces: npm script `test:e2e:sanity` that runs only tests tagged `@sanity`. Task 2 calls it from the workflow.

- [ ] **Step 1: Confirm the current count of tagged tests is zero**

Run (needs the test database, see Global Constraints):
```bash
npm run db:test:up && export TEST_DATABASE_URL='postgresql://kobob_test:synthetic-local-test-only@127.0.0.1:55439/kobob_test' && npm run db:test:migrate
NODE_OPTIONS=--conditions=react-server npx playwright test --grep @sanity --list
```
Expected: `Error: No tests found` (exit code 1). The full list `NODE_OPTIONS=--conditions=react-server npx playwright test --list | tail -1` prints `Total: 36 tests in 3 files`.

- [ ] **Step 2: Add the tag to the twelve tests**

Playwright's details object goes between the title and the function. Change each `test(` line below exactly as shown; leave the function bodies untouched.

`tests/e2e/health.spec.ts` line 3:
```ts
test("health reports a reachable database without caching or leaking detail", { tag: "@sanity" }, async ({
```

`tests/e2e/sign-in.spec.ts`:
```ts
// line 81
test("requires explicit confirmation, removes the token from the address bar, then enforces revocation", { tag: "@sanity" }, async ({
// line 104
test("locks private UI when logout fails without claiming server revocation, then retries", { tag: "@sanity" }, async ({
// line 134
test("shows an honest expired-link state and blocks raw auth endpoints", { tag: "@sanity" }, async ({
// line 234
test("administrator adds, changes, revokes and restores membership", { tag: "@sanity" }, async ({
// line 265
test("anonymous and ordinary family users cannot view membership", { tag: "@sanity" }, async ({
// line 298
test("the media route gives visitors the same 404 for any id", { tag: "@sanity" }, async ({ request }) => {
```

`tests/e2e/editorial.spec.ts`:
```ts
// line 71
test("explains that publishing needs cleared rights, then allows it", { tag: "@sanity" }, async ({ page }) => {
// line 173
test("a stale save keeps the member's input and shows the latest version", { tag: "@sanity" }, async ({
// line 205
test("archive hides an item and restore brings it back as private", { tag: "@sanity" }, async ({
// line 652
test("family pages are Hebrew RTL and require sign-in", { tag: "@sanity" }, async ({ page }) => {
// line 741
test("the family list pages and filters items needing review", { tag: "@sanity" }, async ({ page }) => {
```

Then run `npx biome format --write tests/e2e` so line wrapping matches the repo style; `npx biome lint tests/e2e` must report no errors.

- [ ] **Step 3: Verify the tag selects exactly twelve tests**

Run:
```bash
NODE_OPTIONS=--conditions=react-server npx playwright test --grep @sanity --list | tail -1
```
Expected: `Total: 12 tests in 3 files`.

- [ ] **Step 4: Add the script**

In `package.json`, directly after the `"test:e2e"` line, add:
```json
		"test:e2e:sanity": "NODE_OPTIONS=--conditions=react-server playwright test --grep @sanity",
```
`"test:e2e"` and `"check"` stay unchanged.

- [ ] **Step 5: Run the sanity subset through the script**

Run: `npm run test:e2e:sanity 2>&1 | tail -3`
Expected: the last lines include `12 passed` and no `failed`. Note the wall time Playwright prints (expect roughly one to two minutes).

- [ ] **Step 6: Run the full suite once to prove nothing else changed**

Run: `npm run test:e2e 2>&1 | tail -3`
Expected: `36 passed`.

- [x] **Step 6a (added during execution): warm the dev server before the suite**

The sanity subset failed on `archive hides an item` with `net::ERR_ABORTED` and `a stale save keeps` timed out when run first: cold route compilation under `next dev` makes open pages reload mid-test (see the spec, "Found while implementing"). Added `tests/e2e/warm-up.ts` as `globalSetup` in `playwright.config.ts`; it requests every `page.tsx`/`route.ts` under `src/app` once, with `[segments]` replaced by `warm-up`, plus one unknown path for the not-found page. After it, the subset passed 12/12 twice and the full suite 36/36.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e package.json
git commit -m "test: tag the sanity browser tests and add test:e2e:sanity

Twelve tests that prove access boundaries, revocation, publish decisions and
the Hebrew RTL shell carry the @sanity tag. The new script runs only those;
test:e2e and check stay the full suite.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Rewrite `ci.yml` as `CI` with parallel `Unit tests` and `E2E tests` jobs

**Files:**
- Modify: `.github/workflows/ci.yml` (whole file)

**Interfaces:**
- Consumes: `npm run test:e2e:sanity` from Task 1.
- Produces: check names `Unit tests` and `E2E tests` under workflow `CI`, which the docs in Task 4 name.

- [ ] **Step 1: Lint the current file to confirm the linter works**

Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest .github/workflows/ci.yml; echo "exit $?"`
Expected: no findings, `exit 0`.

- [ ] **Step 2: Replace the file**

Write `.github/workflows/ci.yml` with exactly:
```yaml
name: CI
on:
  # PRs only (into dev for features, into main for releases), as in sana. main
  # receives only release merges that were already green on their PR, and
  # vercel-deploy.yml smoke-tests the deployment, so re-running on push to main
  # spends metered minutes on a commit that just passed. Docs-only PRs run
  # nothing; a PR touching docs and code still runs.
  pull_request:
    paths-ignore:
      - "docs/**"
      - "**.md"
permissions:
  contents: read
# One run per PR; a new push cancels the previous run of the same PR.
concurrency:
  group: ci-${{ github.workflow }}-${{ github.event.pull_request.number }}
  cancel-in-progress: true
# Two independent jobs so the PR gate takes about as long as the browser job
# alone. The browser job runs only the @sanity subset; the full suite runs in
# nightly.yml. See docs/superpowers/specs/2026-11-07-ci-sanity-nightly-design.md.
jobs:
  unit:
    name: Unit tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    services:
      postgres:
        image: postgres:17.7-alpine
        env:
          POSTGRES_USER: kobob_test
          POSTGRES_PASSWORD: synthetic-ci-only
          POSTGRES_DB: kobob_test
        ports: [5432:5432]
        options: >-
          --health-cmd "pg_isready -U kobob_test -d kobob_test"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      TEST_DATABASE_URL: postgresql://kobob_test:synthetic-ci-only@127.0.0.1:5432/kobob_test
      NEXT_TELEMETRY_DISABLED: '1'
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5
      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - run: npm run db:generate
      - run: npm run db:test:migrate
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:unit
      - run: npm run test:integration
  e2e:
    name: E2E tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:17.7-alpine
        env:
          POSTGRES_USER: kobob_test
          POSTGRES_PASSWORD: synthetic-ci-only
          POSTGRES_DB: kobob_test
        ports: [5432:5432]
        options: >-
          --health-cmd "pg_isready -U kobob_test -d kobob_test"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      TEST_DATABASE_URL: postgresql://kobob_test:synthetic-ci-only@127.0.0.1:5432/kobob_test
      NEXT_TELEMETRY_DISABLED: '1'
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5
      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - run: npm run db:generate
      - run: npm run db:test:migrate
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e:sanity
      # The browser tests run against `next dev`, so this is the PR's only
      # production-compile check. Locally and in CI the build never migrates.
      - run: npm run build
```

- [ ] **Step 3: Lint the new file**

Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest .github/workflows/ci.yml; echo "exit $?"`
Expected: no findings, `exit 0`.

- [ ] **Step 4: Check the job names and scripts resolve**

Run: `grep -n "name: \|run: npm run" .github/workflows/ci.yml` and compare each `npm run X` with `grep -n '"X"' package.json`.
Expected: `name: CI`, `name: Unit tests`, `name: E2E tests`; every script named exists in `package.json` (`db:generate`, `db:test:migrate`, `lint`, `typecheck`, `test:unit`, `test:integration`, `test:e2e:sanity`, `build`).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: rename Verify to CI and split it into Unit tests and E2E tests

The two jobs run in parallel, as in getmygoals. The browser job runs the
@sanity subset and the build; the full suite moves to the nightly. Trigger,
permissions, pinned actions and the Postgres service are unchanged.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Add the `Nightly` workflow

**Files:**
- Create: `.github/workflows/nightly.yml`

**Interfaces:**
- Consumes: the full `test:e2e` script (unchanged) and the same setup steps as Task 2.
- Produces: workflow `Nightly`, job `Full cycle`, which the docs in Task 4 name; `gh run list --workflow=nightly.yml` lists its runs.

- [ ] **Step 1: Write the file**

Write `.github/workflows/nightly.yml` with exactly:
```yaml
name: Nightly
# The full cycle on dev once a day: everything CI runs plus the whole browser
# suite, which the PR gate only samples (@sanity). Scheduled workflows run from
# main's copy of this file, so the checkout names dev explicitly; dev is a
# permanent branch here (delete-on-merge is off). Failure notification is
# GitHub's own email to the workflow's last committer.
on:
  schedule:
    - cron: "0 2 * * *"
  workflow_dispatch: {}
permissions:
  contents: read
concurrency:
  group: nightly
  cancel-in-progress: false
jobs:
  full:
    name: Full cycle
    runs-on: ubuntu-latest
    timeout-minutes: 30
    services:
      postgres:
        image: postgres:17.7-alpine
        env:
          POSTGRES_USER: kobob_test
          POSTGRES_PASSWORD: synthetic-ci-only
          POSTGRES_DB: kobob_test
        ports: [5432:5432]
        options: >-
          --health-cmd "pg_isready -U kobob_test -d kobob_test"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      TEST_DATABASE_URL: postgresql://kobob_test:synthetic-ci-only@127.0.0.1:5432/kobob_test
      NEXT_TELEMETRY_DISABLED: '1'
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5
        with:
          ref: dev
      - uses: actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v5
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - run: npm run db:generate
      - run: npm run db:test:migrate
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - run: npm run build
```

- [ ] **Step 2: Lint it**

Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest .github/workflows/nightly.yml; echo "exit $?"`
Expected: no findings, `exit 0`.

- [ ] **Step 3: Check the schedule does not collide with the backup**

Run: `grep -n "cron" .github/workflows/*.yml`
Expected: `db-backup.yml` at `"0 3 * * *"` and `nightly.yml` at `"0 2 * * *"`; different hours.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/nightly.yml
git commit -m "ci: add the nightly full cycle on dev

Lint, typecheck, unit, integration, the whole browser suite and the build,
daily at 02:00 UTC and on manual dispatch, checking out dev explicitly.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Update the docs that name the workflows

**Files:**
- Modify: `docs/OPERATIONS.md:233` and the release checklist item 1 (`:241`)
- Modify: `docs/DEVELOPMENT.md:172-181`
- Modify: `AGENTS.md:88-89` and `:103-105`
- Modify: `docs/superpowers/specs/2026-11-07-ci-sanity-nightly-design.md:3` (status line)

**Interfaces:**
- Consumes: names `CI`, `Unit tests`, `E2E tests`, `Nightly`, `Full cycle`, script `test:e2e:sanity`, tag `@sanity` from Tasks 1 to 3.

- [ ] **Step 1: OPERATIONS.md, branch and release flow**

Replace line 233:
```
CI (`Verify`) runs on pull requests only and skips docs-only changes.
```
with:
```
CI (`.github/workflows/ci.yml`, workflow `CI`) runs on pull requests only and
skips docs-only changes. Its two jobs run in parallel: `Unit tests` (lint,
typecheck, unit, integration) and `E2E tests` (the `@sanity` browser subset,
then the production build). The whole browser suite runs in `Nightly`
(`.github/workflows/nightly.yml`) on `dev` at 02:00 UTC and on manual dispatch
(`gh workflow run nightly.yml`); a failure emails the workflow's last
committer. Check the latest nightly with `gh run list --workflow=nightly.yml --limit 1`.
```

Replace release checklist item 1:
```
1. `dev` CI is green on the latest merged PRs; list what the batch contains.
```
with:
```
1. `dev` CI is green on the latest merged PRs and the latest `Nightly` on `dev`
   is green, or its failure is understood; list what the batch contains.
```

- [ ] **Step 2: DEVELOPMENT.md, verification section**

Replace lines 172 to 181 (the two paragraphs starting "`npm run check` runs" and "The PR workflow is bounded") with:
```
`npm run check` runs lint, types, unit, integration, the full browser suite and
build; it is the local equivalent of the nightly. `npm test` is the unit suite
only; it is not evidence of complete verification. Browser fixtures use the real
auth integration and database with mocked email, then exercise the actual HTTP
routes. Traces/screenshots are disabled to avoid storing credential-bearing
browser artifacts. Never publish auth failure artifacts or private fixture output
without review.

The PR workflow (`CI`) has two parallel jobs with read-only repository
permissions, isolated PostgreSQL and no live email/storage: `Unit tests` (lint,
typecheck, unit, integration; 10 minutes) and `E2E tests` (one Chromium browser
running `npm run test:e2e:sanity`, then the build; 15 minutes). The sanity
subset is the tests tagged `@sanity` in `tests/e2e`; a test joins it when it
proves an access boundary, a revocation, a publish decision or the Hebrew RTL
shell for a flow production users reach. Everything else runs in `Nightly` on
`dev`, which runs the whole cycle. No deployment or ops mutation is included in
either workflow. A workflow change is not verified until GitHub executes it.
```

- [ ] **Step 3: AGENTS.md**

On lines 88 to 89, change `Merge on CI\n  green plus a reply` so it reads `Merge on a green `CI` run (both jobs)\n  plus a reply`, keeping the surrounding sentence intact:
```
  `hetzy8` (read `gh api repos/hetzy8/kobob/issues/N/comments`). Merge on a green
  `CI` run (both jobs) plus a reply on the PR answering each point (fixed, or why
  not, with evidence). Pushing fixes does not earn a second review. Docs-only PRs
  need no review.
```

Replace lines 103 to 105:
```
- Keep CI bounded and relevant. No workflows or dependencies are introduced
  during planning work; add only those needed by an authorized implementation
  slice. Never claim a check was run without its actual result.
```
with:
```
- Keep CI bounded and relevant. No workflows or dependencies are introduced
  during planning work; add only those needed by an authorized implementation
  slice. New browser tests run nightly by default and get the `@sanity` tag only
  under the rule in docs/DEVELOPMENT.md. Never claim a check was run without its
  actual result.
```

- [ ] **Step 4: Spec status**

In `docs/superpowers/specs/2026-11-07-ci-sanity-nightly-design.md` line 3, change `approved design, not yet implemented` to `implemented 2026-11-07 (plan: ../plans/2026-11-07-ci-sanity-nightly.md)`.

- [ ] **Step 5: Check no stale name remains**

Run: `grep -rn '`Verify`\|name: Verify' AGENTS.md docs .github | grep -v "superpowers/specs/2026-11-07-ci-sanity-nightly-design.md:7"`
Expected: no output (the spec's problem statement keeps the old name on purpose).

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md docs/OPERATIONS.md docs/DEVELOPMENT.md docs/superpowers/specs/2026-11-07-ci-sanity-nightly-design.md
git commit -m "docs: name the CI jobs, the sanity rule and the nightly

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Push, open the PR and verify the workflows on GitHub

**Files:** none changed.

**Interfaces:**
- Consumes: everything above. Acceptance per the spec: two checks under `CI`, about 2 minutes; a manual `Nightly` run on this branch's file checks out `dev` and passes.

- [ ] **Step 1: Stop the local test database and push**

Run:
```bash
npm run db:test:down
git push -u origin chore/ci-sanity-nightly
```
Expected: the branch appears on the remote.

- [ ] **Step 2: Open the PR to dev**

```bash
gh pr create --base dev --head chore/ci-sanity-nightly \
  --title "ci: split CI into Unit and E2E jobs with a sanity subset, add the nightly" \
  --body "$(cat <<'EOF'
Spec: docs/superpowers/specs/2026-11-07-ci-sanity-nightly-design.md. Plan: docs/superpowers/plans/2026-11-07-ci-sanity-nightly.md.

- `Verify` becomes `CI` with two parallel jobs, `Unit tests` and `E2E tests`.
- Twelve browser tests carry `@sanity`; `npm run test:e2e:sanity` runs them on PRs. `test:e2e` and `check` stay the full suite.
- `Nightly` runs the full cycle on `dev` at 02:00 UTC and on dispatch.
- Docs name the jobs, the tagging rule and the nightly.

Verification: local `test:e2e:sanity` (12 passed) and `test:e2e` (36 passed); actionlint on both workflows; this PR's own `CI` run; a manual `Nightly` dispatch from this branch (link in a comment).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch the CI run**

Run: `gh pr checks --watch` then `gh run list --workflow=ci.yml --limit 1 --json databaseId,conclusion,createdAt,updatedAt`
Expected: two checks, `Unit tests` and `E2E tests`, both `pass`; the run's `updatedAt` minus `createdAt` is about 2 to 3 minutes. If `E2E tests` fails, open its log with `gh run view <id> --log-failed` and fix on this branch before continuing.

- [ ] **Step 4: Dispatch the nightly from this branch**

Run:
```bash
gh workflow run nightly.yml --ref chore/ci-sanity-nightly
sleep 20
gh run list --workflow=nightly.yml --limit 1 --json databaseId,status,url
gh run watch <databaseId> --exit-status
```
Expected: the job `Full cycle` passes. In the run log, the checkout step shows `ref: dev`. If it fails on a browser test, that is a real nightly finding about `dev`; record it in the PR rather than retrying.

- [ ] **Step 5: Comment the evidence on the PR**

```bash
gh pr comment --body "CI run: <ci run url> (Unit tests + E2E tests green, <m>m<s>s). Nightly dispatch from this branch: <nightly run url> (Full cycle green on dev)."
```

- [ ] **Step 6: Hand over**

The owner runs one Codex review per code PR and merges. Report the PR URL, both run URLs and the measured CI duration.
