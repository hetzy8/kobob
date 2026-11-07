# Operations, cost and launch conventions

**Status (2026-11-06):** in production at `https://kobob.vercel.app` (Vercel
`fra1`, Neon Frankfurt), v0.5.0. Sign-in email through Resend, item
editing and public search are live and the first administrator exists. The
catalog import (stage 1) ran on 2026-11-06: 1,162 items, 47 of them public
link cards (Import records below). Backups, private media and the custom
domain (`kobob.org`) are not set up yet; backups come next (ROADMAP.md →
Order of work).

## Ownership

### Development direction confirmed by Yoram, 2026-11-01

Yoram reports that ops is now familiar with Kobob and directs daily tracking
alongside the other projects. This is the operating expectation; the actual
ops registration, scheduled checks and reporting coverage have not been
verified in this repository. No ops configuration is changed by this update.

Keep development small and strict, with low monthly recurring cost as an
explicit goal. Retain the accepted single-app hosting direction, focused
dependencies and bounded CI. Do not add optional services, persistent workers
or paid upgrades without a demonstrated need and explicit authorization.
Cost savings must preserve membership checks, private media and restore
verification. A numeric monthly cap, account capacity and incremental costs
remain unconfirmed; do not describe the proposed stack as free.

Yoram owns membership, permanent deletion, provider/budget decisions and launch.
All active verified family members share editorial authority: edit/publish/
unpublish/archive anyone's items and restore as private. Rights/consent must
still be reviewed. The person implementing a release records actual evidence
and remaining limitations.
Do not infer ownership of a provider account or permission to contact family
members from the existence of this repository.

## Conventions adapted from ops

| Ops convention | Application to kobob |
|---|---|
| Context lives in the repo | README + AGENTS + dated spec/plan and status; no chat-only prerequisites |
| Cost discipline | No unnecessary worker, AI service, CMS or scheduled workflow; budget before provisioning |
| Missing is not zero | Unknown spend, absent telemetry and untested restores remain labelled unknown |
| Bitwarden is the secret source | Map names/targets in ops before distributing values; no manual secret copies |
| Least privilege | Separate runtime, migration, backup and monitoring roles; no cross-project credentials |
| Verify the deployed version | Annotated release tag on the deployed commit, health and authorization checks |
| Backups are operational evidence | Verify artifacts and an isolated restore, not only a green workflow |

Do not import ops' old project tiers or zero-dependency runtime rule. Do not
register kobob in `ops/projects.json` until an authorized follow-up identifies
real workflows and health signals. Start as `development` then; do not invent
production checks to make the monitor appear complete.

## Before provisioning

- Treat `kobobhetz.org` as the initial domain, not a permanent dependency.
  Maintain a domain-change runbook covering configured/trusted origins,
  canonical URLs, DNS/TLS, sender verification and auth callbacks/cookies.
  Explicitly handle pending sign-in links and old-domain redirects if the old
  domain remains controlled; do not promise seamless session/link continuity.
- Confirm `kobobhetz.org` control, registrar/renewal ownership and canonical
  hostname. Proposed canonical origin is `https://kobobhetz.org`; redirect
  `www` only once configured. No DNS changes are part of this task.
- **Decision 2026-11-03 (Yoram):** the site address will be `https://kobob.org`
  (registered at GoDaddy, which hosts its DNS; `mail.kobob.org` already sends
  sign-in email), replacing `kobobhetz.org`. Not configured yet; postponed.
  Order: add `kobob.org` and `www.kobob.org` (redirect to the apex) in Vercel →
  replace GoDaddy's parking A records with Vercel's → wait for Valid
  Configuration → set `SITE_ORIGIN` and `PROD_URL` to `https://kobob.org` and
  redeploy → ship a redirect from `kobob.vercel.app` (Better Auth trusts only
  `SITE_ORIGIN`, so sign-in breaks on the old host) → move ops `healthUrl` and
  `productionDomain`. Do not ship the redirect before `kobob.org` serves.
- Confirm provider plan limits, regions, privacy requirements and dated costs.
  Existing provider familiarity does not mean spare capacity or zero cost.
- Check Bitwarden organization/project capacity and the current secrets tooling
  before adding a kobob scope; do not assume a fourth free project exists.
- Keep dev/test/production data and credentials isolated. Preview deployments
  use synthetic content and never the production member list or media bucket.
- Define permanent-deletion/object cleanup and backup retention before enabling
  Yoram's destructive action. Individual item recovery restores as private; public
  access must not expose archived records, including their safe media copies.

## Names-only configuration proposal

Final variable names follow the chosen auth/storage integrations. Expected
concepts include database runtime and migration URLs, auth secret, canonical
origin, email API key/from address, and private storage endpoint/bucket/key.
No values or real addresses belong in docs. Do not add a `NEXT_PUBLIC_` prefix
to a secret. A later `.env.example` contains empty placeholders only.

## Provisioning runbook (authorized 2026-11-01, carried out 2026-11-02)

Yoram authorized provisioning on 2026-11-01 with these decisions: a standalone
Neon project like Sana (not the Vercel Marketplace), and secrets in Bitwarden
`shared` under `KOBOB_` names because the free plan's three projects are used.
The map is [hetzy8/ops#73](https://github.com/hetzy8/ops/pull/73). The
hetzy8-eng command guard forbids agents from changing Vercel or pushing
secrets, so Yoram runs each step; agents prepare and verify.

| Production variable | Source | Map name |
|---|---|---|
| `DATABASE_URL` | Neon pooled connection string | `KOBOB_DATABASE_URL` |
| `DIRECT_URL` | Neon direct connection string (migrations only) | `KOBOB_DIRECT_URL` |
| `AUTH_SECRET` | generated by the ops tooling | `KOBOB_AUTH_SECRET` |
| `SITE_ORIGIN` | plain setting: the production origin | not a secret |
| `VERCEL_DEPLOY_HOOK_URL` (GitHub secret) | Vercel deploy hook for `main` | `KOBOB_VERCEL_DEPLOY_HOOK_URL` |
| `PROD_URL` (GitHub variable) | same origin as `SITE_ORIGIN` | not a secret |
| `RESEND_API_KEY` | Resend key, sending access only, restricted to `mail.kobob.org` | `KOBOB_RESEND_API_KEY` |
| `EMAIL_FROM` | plain setting: `קובוב <no-reply@mail.kobob.org>` | not a secret |

Steps, in order:

1. Merge this repository's release-flow PR into `dev`, so `vercel.json`
   (Git deploys off, region `fra1`) is on the branch Vercel sees.
2. Neon console: create project `kobob`, region AWS Europe Central 1
   (Frankfurt, next to `fra1`), Postgres 17 (CI uses 17.7). On 2026-11-07
   `SHOW server_version` reported 18.6, so the backup tooling pins 18; the
   test database stays on 17.7, which the app does not notice. Keep the pooled and
   direct connection strings for step 5; do not paste them anywhere else.
3. Vercel, from `~/kobob`: `vercel project add kobob`, then
   `vercel link --yes --project kobob`, then `vercel git connect`. In Project
   Settings set Node.js 24.x; create a deploy hook for branch `main`.
   Add `SITE_ORIGIN` for Production (initially the `*.vercel.app` URL Vercel
   assigns; the custom domain is a separate, explicitly authorized change).
4. Merge hetzy8/ops#73.
5. From `~/ops`: `node scripts/secrets.mjs rotate KOBOB_AUTH_SECRET KOBOB_DATABASE_URL KOBOB_DIRECT_URL KOBOB_VERCEL_DEPLOY_HOOK_URL`
   (dry run), then again with `--apply`; paste the Neon and hook values at the
   prompts. Then `node scripts/secrets.mjs audit`.
6. `gh variable set PROD_URL --repo hetzy8/kobob --body <origin>`.
7. Release: the `dev` → `main` PR on explicit go (checklist above). The build
   applies migrations through `scripts/migrate-production.mjs`; the smoke gate
   must pass before tagging. Then create the first administrator with
   `npm run admin:bootstrap` against production, per DEVELOPMENT.md.
8. Ops follow-up: add `Vercel Deploy (production)` and `healthUrl` to kobob's
   entry in `ops/projects.json`, and Vercel/Neon entries in `services.json`
   (plan, allowance, declared cost) — neither has an entry today, Sana's included.

### Email delivery (Resend)

Sign-in links go out from `mail.kobob.org` (design:
[2026-11-02-resend-email-design.md](superpowers/specs/2026-11-02-resend-email-design.md)).
After the release that ships the code, Yoram runs:

1. Resend: add domain `mail.kobob.org`; create an API key with sending access
   restricted to it.
2. GoDaddy DNS for `kobob.org`: add the SPF, DKIM and DMARC records Resend
   lists; wait until Resend shows the domain verified.
3. Merge the ops map PR for `KOBOB_RESEND_API_KEY`, then from `~/ops`:
   `node scripts/secrets.mjs rotate KOBOB_RESEND_API_KEY --apply`.
4. Vercel Production: set `EMAIL_FROM` (value in the table above), then
   `gh workflow run vercel-deploy.yml --repo hetzy8/kobob --ref main`.
5. Check `/api/health` shows `resend` and `emailFrom` true.
6. `npm run admin:bootstrap` against production, then sign in with that
   address to prove delivery end to end.

Never set `RESEND_DEBUG` in Vercel: the SDK then logs full provider errors,
which can include the recipient address.

Done 2026-11-02/03. Lessons for the next domain or sender change:

- Resend: add the exact sending domain (`mail.kobob.org`, not `kobob.org`) in
  region Ireland (eu-west-1). A domain's region cannot be changed; a domain
  first created in Tokyo was deleted and re-added. Resend now lists a DKIM TXT
  plus two CNAMEs (`rsend.mail`, `send.mail`) instead of MX/SPF records;
  **Auto configure** wrote them to GoDaddy.
- `kobob.org` already has a `_dmarc` TXT (`p=quarantine`). Do not add a second
  DMARC record: two make the check fail.
- `EMAIL_FROM` was first stored with its Hebrew letters reversed (typed in a
  terminal that shows Hebrew left to right). Paste the value from the table
  above, or set it in the Vercel dashboard; check that the sender shows
  `קובוב` in the first email.
- `npm run admin:bootstrap` reads settings from the process environment only.
  Run it in your own terminal (it needs a TTY), with the values taken from
  Bitwarden for that one command:

  ```zsh
  export BWS_ACCESS_TOKEN="$(security find-generic-password -s ops-secrets-bws -w)"; P="$(bws project list --output json | jq -r '.[]|select(.name=="shared").id')"; S="$(bws secret list "$P" --output json)"; SITE_ORIGIN=https://kobob.vercel.app DATABASE_URL="$(jq -r '.[]|select(.key=="KOBOB_DIRECT_URL").value' <<<"$S")" AUTH_SECRET="$(jq -r '.[]|select(.key=="KOBOB_AUTH_SECRET").value' <<<"$S")" npm run admin:bootstrap; unset BWS_ACCESS_TOKEN P S
  ```

  Without them it prints only the generic "Bootstrap failed" message. The
  first administrator was created this way on 2026-11-03; the sign-in email
  arrived in the Gmail primary inbox.

### Private media (R2)

Kobob has its own buckets and keys and never shares them with another app
(media design, decision 7). Buckets are private: no public access, no custom
domain, no CORS.

| Setting | Source | Map name |
|---|---|---|
| `R2_ENDPOINT` | plain: `https://<account>.r2.cloudflarestorage.com` | not a secret |
| `R2_BUCKET` | plain: `kobob-media-production` on Vercel | not a secret |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` on Vercel | Object Read only, production bucket | `KOBOB_R2_READ_ACCESS_KEY_ID`, `KOBOB_R2_READ_SECRET_ACCESS_KEY` |
| Same names, operator's import runs only | Object Read & Write, production bucket | Bitwarden only: `KOBOB_R2_WRITE_ACCESS_KEY_ID`, `KOBOB_R2_WRITE_SECRET_ACCESS_KEY` |
| Same names, local runs only | Object Read & Write, development bucket | Bitwarden only: `KOBOB_R2_DEV_ACCESS_KEY_ID`, `KOBOB_R2_DEV_SECRET_ACCESS_KEY` |

Yoram's steps:

1. Cloudflare → R2: create `kobob-media-production` and
   `kobob-media-development`, location hint Eastern Europe (near `fra1`). Check
   that public access stays disabled and add no CORS policy.
2. R2 → Manage API tokens: create the three tokens in the table, each limited to
   its one bucket.
3. Add the four Bitwarden-only values to the `shared` project in the Bitwarden
   web app. The ops map requires a target, so these have no map entry.
4. Merge the ops map PR, then from `~/ops` run
   `node scripts/secrets.mjs rotate KOBOB_R2_READ_ACCESS_KEY_ID KOBOB_R2_READ_SECRET_ACCESS_KEY`
   (dry run), then again with `--apply`, pasting each value at its prompt. Then
   `node scripts/secrets.mjs audit`.
5. Vercel Production: set `R2_ENDPOINT` and `R2_BUCKET`, then redeploy with
   `gh workflow run vercel-deploy.yml --repo hetzy8/kobob --ref main` and check
   that `/api/health` shows `storage` true.

The app key cannot write, so the copy always runs from the operator's Mac.
Commands and report rules: DEVELOPMENT.md → Media copy. R2 holds copies; Drive
remains the source of the originals until a tested media backup exists.

## Verification and release

Documentation-only changes check links, scope, English text, statuses and
whitespace. The local application suite and bounded PR workflow use isolated databases,
mocked email and synthetic fixtures; private media/storage tests belong to the
media slice. The local foundation proves direct
authorization failures, revocation, token replay and the RTL root/browser shell.
Final Hebrew copy and the archive/editorial/media acceptance matrix remain pending.

### Branch and release flow (adopted 2026-11-01, mirrors Sana)

Features merge into `dev` through PRs; `main` only receives `dev` → `main`
release PRs. Vercel's Git auto-deploy is disabled in `vercel.json`, so no
branch or PR creates a Vercel deployment. A push to `main` runs
`.github/workflows/vercel-deploy.yml`: it calls the Vercel deploy hook, then a
smoke gate waits until `/api/health` reports the merged commit on a new
deployment id with a reachable database and probes `/` and `/sign-in`.
CI (`.github/workflows/ci.yml`, workflow `CI`) runs on pull requests only and
skips docs-only changes. Its two jobs run in parallel: `Unit tests` (lint,
typecheck, unit, integration) and `E2E tests` (the `@sanity` browser subset,
then the production build). The whole browser suite runs in `Nightly`
(`.github/workflows/nightly.yml`) on `dev` at 02:00 UTC and on manual dispatch
(`gh workflow run nightly.yml`); a failure emails the workflow's last
committer. Check the latest nightly with `gh run list --workflow=nightly.yml --limit 1`.

The workflow needs repository variable `PROD_URL` and secret
`VERCEL_DEPLOY_HOOK_URL`, mapped in `hetzy8/ops/secrets/targets.json` and
pushed from Bitwarden. Both were set during provisioning (2026-11-02); without
them the workflow fails loudly.

Release checklist:

1. `dev` CI is green on the latest merged PRs and the latest `Nightly` on `dev`
   is green, or its failure is understood; list what the batch contains.
2. Yoram gives an explicit go; open the `dev` → `main` PR
   (`gh pr create --base main --head dev`) and wait for its checks.
3. Before merging, confirm migrations are backward-compatible with the code
   currently live (rollback runs old code against the new schema). The build
   migrates after `next build` succeeds but before Vercel promotes, so a
   failed smoke gate can still leave the new schema under the old code.
4. Merge; confirm the `Vercel Deploy (production)` run's smoke gate is green
   (`gh run list --workflow=vercel-deploy.yml --limit 1`, then
   `gh run view <id> --json conclusion`).
5. Tag the deployed `main` commit and record SHA, run and verification here.
   - `v0.1.0`, 2026-11-02: `78b3f2e`, first production release (access
     foundation and member administration). The first deploys failed health
     because `DATABASE_URL` pointed at Sana's Neon project and `SITE_ORIGIN`
     was malformed; both were corrected in Vercel. Check a database host's
     endpoint and region against the kobob Neon project before releasing.
   - `v0.2.0`, 2026-11-02: `f8eff0a` (PR #17), sign-in email through Resend.
     [Deploy run 41489102123](https://github.com/hetzy8/kobob/actions/runs/41489102123)
     green; health `ok` with every config flag true.
   - `v0.3.0`, 2026-11-04: `995d901` (PR #23), item editing, lifecycle and
     the public archive; migration `20261103000000_item_editing` (new tables
     only) applied by the build.
     [Deploy run 41877996213](https://github.com/hetzy8/kobob/actions/runs/41877996213)
     green; health `ok` on `995d901` with every config flag true; `/archive`
     answers 200.
   - `v0.4.0`, 2026-11-05: `fe7cc03` (PR #29), public navigation, family-only
     archive and search; no migration.
     [Deploy run 42026065465](https://github.com/hetzy8/kobob/actions/runs/42026065465)
     green; health `ok` with every config flag true; `/archive` answers 404.
   - `v0.5.0`, 2026-11-06: `b0fa8fb` (PR #31), rights rule, public link cards,
     paged family list and the catalog importer (repository only, not run);
     migration `20261105133746_media_import` (additive) applied by the build.
     [Deploy run 42223428711](https://github.com/hetzy8/kobob/actions/runs/42223428711)
     green; health `ok` on `b0fa8fb` with every config flag true; `/search` with
     a query answers 200; `/family` redirects to sign-in when signed out.
   - `v0.6.0`, 2026-11-06: `24bdc94` (PR #40), private R2 storage, the
     access-checked media route and the copy tool; no migration.
     [Deploy run 42302769871](https://github.com/hetzy8/kobob/actions/runs/42302769871)
     green; health `ok` on `24bdc94` with every config flag true, including
     `storage`; `/` and `/search` answer 200; `/family` redirects to sign-in;
     an unknown media id answers 404.
   - `v0.7.0`, 2026-11-07: `30ef6a6` (PR #44), encrypted database backups
     (`DB Backup`, secrets not yet provisioned), restore verification, the
     per-client sign-in limit, `admin:recover`, and CI split into `CI`
     (`Unit tests`, `E2E tests` with the `@sanity` subset) plus `Nightly`; no
     migration.
     The per-client limit was probed on production on 2026-11-07: requests
     carrying forged forwarded-for headers add no rate-limit bucket, and a
     second network gets its own, so the header cannot be spoofed and visitors
     do not share a bucket.
     [Deploy run 42361889618](https://github.com/hetzy8/kobob/actions/runs/42361889618)
     green; health `ok` on `30ef6a6` with every config flag true; `/`,
     `/search?q=a` and `/sign-in` answer 200; `/family` redirects to sign-in;
     an unknown media id and `/archive` answer 404; title `יקי חץ`. First
     [`Nightly` run 42362016644](https://github.com/hetzy8/kobob/actions/runs/42362016644)
     green on `dev` in 4m59s. The Neon server reports PostgreSQL 18.6, so the
     backup tooling is re-pinned to 18 before the first dump (PR #45).
   - `v0.7.1`, 2026-11-07: `04e1664` (PR #47), backup tooling on
     `postgresql-client-18` (PR #45) and the pinned rclone v1.75.2 release
     with checksum, because apt's 1.60 still calls Backblaze API v1, which
     the account refuses (PR #48, found by the upload rehearsal); no migration,
     no application change.
     [Deploy run 42368411128](https://github.com/hetzy8/kobob/actions/runs/42368411128)
     green; health `ok` on `04e1664` with every config flag true.
6. Delete `dev` and recreate it from the release commit, then retarget any
   open PRs to the new `dev` (`gh pr edit <n> --base dev`). This is the hetzy8
   standards release rule (getmygoals' practice): each cycle starts level with
   production, which is why `dev` has no ruleset. The hetzy8-eng command guard
   blocks agents from writing `dev`/`main`, so Yoram runs:
   `git push origin --delete dev && git push origin <release-sha>:refs/heads/dev`.
   Recreate `dev` before merging any open PR into it: a merge into the old
   `dev` is dropped by the recreation (v0.3.0: PR #24 merged first and had to
   be re-landed as PR #25).

After an explicitly authorized release: verify migrations and recovery steps,
check email and media access with approved test accounts, and record the actual
deployment. Then apply an annotated `vX.Y.Z` tag to that deployed commit
(patch for fixes, minor for features, major for breaking changes). Do not create a release tag for documentation bootstrap.
Rollback must consider database compatibility; do not run a destructive down
migration merely to make old code start.

### Import records

Counts only; the export files, reports and row detail stay outside the
repository (DEVELOPMENT.md → Media and catalog import).

- Stage 1 catalog import, 2026-11-06, on v0.5.0 (`b0fa8fb`) with the
  importer fixes merged to `dev` (PRs #34–#36; the importer runs on the
  operator's machine, so it needed no release). Yoram approved the 47 public
  cards from the dry-run card list; the production dry run matched the local
  apply exactly before the production apply, which was bound to the database
  host and the export snapshot. Result: 1,162 items created (1,115 private
  family items with 1,116 file records, 47 public internet link cards, 9 of
  them carrying a public note), 165 system files excluded, 64 web sources left
  out by decision, 0 errors, 0 unreadable. A local rerun of the same export
  reported 0 created, 1,162 existing, 0 changed, 0 conflicts. Verified as an
  anonymous visitor: `/` and `/search` with a Hebrew query answer 200, a card
  opens and links to its source, and the page carries no catalog ids or
  private notes. Public item count before the import: 0.
- Selected collages, 2026-11-06, on v0.6.0 (`24bdc94`), by Yoram's choice ahead
  of ops and backups. Rehearsed first on the development bucket and local
  database; the production dry run then matched. Result: 5 originals verified
  by size, hash and read-back (20,134,347 bytes), 5 thumbnails, 0 failed. The
  items stay private with rights unclear. Verified: the production bucket lists
  5 originals with public access disabled, and a signed-out request for a real
  file id answers 404. The other 1,111 family file records remain pending. On
  2026-11-07 Yoram opened the 4.97 MB file while signed in, and it worked. That
  file is over Vercel's documented 4.5 MB response limit. This does not replace
  the large-file measurement required before the full copy.

## Preservation and recovery

Decision (Yoram, 2026-11-06, after the
[panel review](reviews/2026-11-06-panel-review.md)): backups with a rehearsed
restore come before any family editing and before the first invitation. Design:
[ops and backups](superpowers/specs/2026-11-06-ops-backups-design.md). Target: RPO
24 hours, RTO 1 working day. Never commit backup payloads to GitHub. Media is not
backed up here: R2 holds copies, and Drive holds the originals. Media backup must
be added before family uploads exist.

### Database backup

`DB Backup` (`.github/workflows/db-backup.yml`) runs daily at 03:00 UTC from `main`
in the `backup` Environment, and writes `daily/` and `monthly/` in a private B2
bucket. The dump is encrypted before upload. Object Lock (Governance, 30 days)
protects recent dumps; lifecycle rules expire `daily/` at 32 days and `monthly/` at
366. Failed runs email Yoram through GitHub's notifications, and the ops monitor
reports dump age. GitHub disables schedules after 60 days without repository
activity; when the monitor reports an old dump, check that first and run
`gh workflow enable db-backup.yml --repo hetzy8/kobob`.

```mermaid
sequenceDiagram
    participant workflow as DB Backup (Environment backup, main only)
    participant script as scripts/db-backup.sh
    participant neon as Neon, role kobob_backup
    participant bucket as Backblaze bucket
    participant monitor as hetzy8/ops nightly monitor
    actor Admin
    workflow->>script: 03:00 UTC
    script->>bucket: rclone lsf daily/ (size of the previous dump)
    script->>neon: pg_dump --no-owner --no-privileges (up to 6 attempts)
    script->>script: gzip -9, age -r AGE_PUBLIC_KEY
    script->>bucket: rclone copyto daily/kobob-<stamp>.sql.gz.age
    script->>bucket: copyto monthly/ when the month has no dump yet
    script-->>workflow: exit 1 if under 1000 bytes or under half the previous size
    monitor->>bucket: 04:30 UTC, list daily/ with the list-only key
    monitor-->>Admin: newest dump age and size, act when none within 26 h
    Admin->>bucket: restore drill: download the newest dump
    Admin->>Admin: age -d with the private key, gunzip, psql into a throwaway Postgres 18
    Admin->>Admin: verify:restore on the restored and the production database, compare
```

| Secret in Environment `backup` | Source | Map name |
|---|---|---|
| `BACKUP_DATABASE_URL` | Direct, non-pooled URL of the read-only role `kobob_backup` | `KOBOB_BACKUP_DATABASE_URL` |
| `B2_KEY_ID`, `B2_KEY` | Bucket-scoped key: `listBuckets,listFiles,writeFiles` | `KOBOB_B2_BACKUP_KEY_ID`, `KOBOB_B2_BACKUP_KEY` |
| `B2_BUCKET` | Bucket name | `KOBOB_B2_BACKUP_BUCKET` |
| `AGE_PUBLIC_KEY` | Public half of the age key | `KOBOB_BACKUP_AGE_PUBLIC_KEY` |

The private age key, `KOBOB_BACKUP_AGE_PRIVATE_KEY`, is in Bitwarden only. Losing it
makes every dump unreadable. Cost: measured 2026-11-07. The first dump is 345,597 bytes.
At that size the full retention (32 daily plus 12 monthly dumps) is about 15 MB,
far inside Backblaze's 10 GB free allowance, so the bucket costs nothing today.
Beyond the allowance B2 lists $6.95 per TB-month with egress free up to three
times stored data (pricing page, read 2026-11-07).

A failed run can still have uploaded its dump. If a suspect dump was the first of
the month, it holds the month's slot in `monthly/`, and later runs skip that month.
Once a good dump exists, download it and upload it to `monthly/` under its original
name, since the month check reads the name. The suspect file stays locked for 30
days.

### Restore drill

Status: rehearsed 2026-11-07 by Yoram, with the agent reading reports. Dump
`daily/kobob-2026-11-07T13-00-15Z.sql.gz.age`, 345,597 bytes, from the first run
(42374898823). Restore `0 0 0 0 0`, both reports exit 0, both `problems` empty.
Restored counts: Item 1,162 (family/private 1,115, internet/public 47), ItemRevision
1,162, ItemCatalogRecord 1,162, EditorialAudit 1,162, MediaFile 1,121, ExternalSource
47, ImportRun 2, User 1, Session 3, MembershipAudit 1, RateLimit 3, `_prisma_migrations`
4; latest and newest migration `20261105133746_media_import`. The only differences
from production were the host and RateLimit (15, from the same day's header probe).
Revoked-member denial: not applicable, no revoked member exists. The first attempt
failed before restoring anything because the runbook mounted the tmpfs at the
Postgres 17 data path; fixed in the block below.

Run on the operator Mac after the first dump, after any material schema change or
key change, and at least every six months. Download the newest dump from the
Backblaze console into a new private folder outside the repository. Then, from
`~/kobob` on current `main`, one line at a time:

```zsh
git switch main
git pull
npm ci
npm run db:generate
setopt pipefail
D=<that folder>
DUMP=<the dump file's path>
PW=synthetic-local-restore-only
docker run -d --name kobob-restore \
  -e POSTGRES_PASSWORD="$PW" \
  -e POSTGRES_DB=restore \
  -p 127.0.0.1:55441:5432 \
  --tmpfs /var/lib/postgresql \
  postgres:18.6-alpine
until docker exec kobob-restore pg_isready -q -U postgres -h 127.0.0.1; do sleep 1; done
export BWS_ACCESS_TOKEN="$(security find-generic-password -s ops-secrets-bws -w)"
P="$(bws project list --output json | jq -r '.[]|select(.name=="shared").id')"
S="$(bws secret list "$P" --output json)"
K='.[]|select(.key=="KOBOB_BACKUP_AGE_PRIVATE_KEY").value'
print -r -- "$S" | jq -r "$K" |
  age -d -i - "$DUMP" |
  gunzip |
  docker exec -i kobob-restore \
    psql -v ON_ERROR_STOP=1 -q -U postgres -d restore >/dev/null
print "restore: $pipestatus"
L="postgresql://postgres:$PW@127.0.0.1:55441/restore"
DATABASE_URL="$L" npm run -s verify:restore > "$D/restored.json"
print "restored report exit: $?"
K='.[]|select(.key=="KOBOB_BACKUP_DATABASE_URL").value'
U="$(print -r -- "$S" | jq -r "$K")"
DATABASE_URL="$U" npm run -s verify:restore > "$D/production.json"
print "production report exit: $?"
jq .problems "$D/restored.json" "$D/production.json"
diff "$D/restored.json" "$D/production.json"
docker rm -f kobob-restore
unsetopt pipefail
unset BWS_ACCESS_TOKEN P S K L U PW DUMP
```

The drill passes only if `restore` shows all zeros, both report exits are 0 and
both `problems` lists are empty. Production is read through the read-only backup
role. The host always differs. Any other difference is acceptable only if explained
by activity after the dump, such as `Session` or `RateLimit` rows. Share counts and
migration names when reporting, never the host.

**Evidence rule.** Record a drill only with the dump's date and size, the script's
counts and migration, and who ran it. Without those, the status stays "not
rehearsed". The first drill records revoked-member denial as not applicable, since
no revoked member exists; integration tests cover the behavior.

### Runbook

**Takedown request.** Make the item private in the interface. As a signed-out
visitor, confirm its page answers 404 and search no longer finds it. Log the date
and a private reference outside the repository. Tell the requester the truth:
encrypted backups keep the record until they expire, up to 367 days. After any
restore, reapply every takedown logged since that dump.

**Recovery from backup.** Restore to a new Neon branch or project with
`psql -v ON_ERROR_STOP=1` as in the drill. The dump has no owners or grants, so
restore as the role the app connects with. Run `npm run verify:restore` against it.
Reapply takedowns and member revocations made since the dump. Repoint
`KOBOB_DATABASE_URL` and `KOBOB_DIRECT_URL` with
`node scripts/secrets.mjs rotate <names> --apply` from `~/ops`. If `kobob_backup` did
not carry over to the new database, create it with a password from
`openssl rand -hex 32`:

```sql
CREATE ROLE kobob_backup WITH LOGIN PASSWORD '<generated>';
GRANT pg_read_all_data TO kobob_backup;
```

Rotate `KOBOB_BACKUP_DATABASE_URL`, run `DB Backup` by hand and check the new dump's
size. Otherwise backups keep dumping the old database and stay green. Rotate
`KOBOB_AUTH_SECRET` the same way, so old sessions and links die. Only then reopen
traffic, and check that a revoked member is denied. Do not resurrect stale public
visibility or access: an item recovered individually returns to private.

**Leaked secret.** `secrets/targets.json` in `hetzy8/ops` shows which secret reaches
which target. Revoke and replace it at the provider, rotate it with
`node scripts/secrets.mjs rotate <name> --apply`, run
`node scripts/secrets.mjs audit`, and check the provider's logs for what it could
have reached. The Bitwarden-only keys (R2 write and development keys, the private age
key) are replaced by hand. A leaked private age key exposes every dump still in the
bucket: generate a new key and keep the old private key in Bitwarden under a dated name
until the last dump using it expires, up to 367 days, or those dumps become
unreadable. Treat the old dumps as exposed until they expire.

**Lost administrator email.** Yoram verifies the owner's identity outside the site,
then runs `npm run admin:recover` in their own terminal, with the same values as the
`admin:bootstrap` command in Email delivery above. `admin:bootstrap` only creates the
first administrator and refuses here. `admin:recover` asks for the lost address and the
replacement, and needs an explicit RECOVER. It moves that active administrator to the
replacement, which no other member may already hold; ends their sessions and pending
links; requires the new mailbox to verify; and records a `recover` audit event. Sign in
from the new mailbox, then check that the old address gets no link. There is no public
reset path, and no public admin-creation endpoint.

**Site down.** Check `/api/health` first: a 503 with `config.databaseUrl` true points
at the database, and `commit` shows what is live. Then the latest `Vercel Deploy
(production)` run, Neon's and Vercel's status pages, and the rollback rules in Branch
and release flow. Do not run a destructive down migration to make old code start.

## Launch checklist (not completed)

- [ ] Page design, approved content/Hebrew copy, rights and selected public
  material are ready; confirmed shared-family publication rules are implemented.
- [ ] Admin email and recovery process are established privately.
- [ ] Budget, data/storage regions, retention and provider limits are approved.
- [ ] Sender domain is verified and SPF/DKIM/DMARC reviewed; mail tested with an
  approved address, never a bulk invitation run.
- [ ] DNS/TLS/canonical redirects are verified on the intended domain.
- [ ] Anonymous, member, revoked-member and admin flows pass on every hostname;
  anonymous reads succeed only for public content and revoked users retain only
  public access. Metadata, relationships and media obey the same boundary.
- [ ] Private media, caches, metadata and preview data boundaries are checked.
- [ ] Restore drill and rollback procedure are recorded.
- [ ] Ops monitoring/configuration is added in a separate authorized PR.
- [ ] A verified production deployment and its annotated version tag exist.

## Accepted direction and migration gates

Vercel, Neon, private R2 and Resend are the accepted hosting direction; see
[HOSTING.md](HOSTING.md) for dated catalog-size evidence and unresolved costs.
See [DATA-MIGRATION.md](DATA-MIGRATION.md) for source preservation, idempotent
imports, the final edit freeze and website authority after cutover. Backups
must cover new website data; preserved Drive originals do not cover it.

Repository visibility remains unresolved: the repository is currently public
and contains engineering docs only, while the source brief proposed private
GitHub. Do not change visibility or add private archive exports by assumption.

## Repository protection verified, 2026-11-01

At Yoram's instruction, Sana's main ruleset was copied to Kobob and read back:
[main ruleset](https://github.com/hetzy8/kobob/rules/26310833). It is active on the
default branch, blocks deletion and non-fast-forward updates, and preserves
administrator bypass. It does not require PR reviews or status checks. The
contributor workflow uses focused branches and PRs into `dev`; see Branch and
release flow. `dev` deliberately has no ruleset: it is deleted and recreated
from the release commit after every release.
