# Operations, cost and launch conventions

**Status (2026-11-04):** in production at `https://kobob.vercel.app` (Vercel
`fra1`, Neon Frankfurt), v0.3.0. Sign-in email through Resend and item
editing are live and the first administrator exists. Backups, private media and the custom domain
(`kobob.org`) are not set up yet.

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
   (Frankfurt, next to `fra1`), Postgres 17 (CI uses 17.7). Keep the pooled and
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

Private media (R2) is a later slice with its own map entries.

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
CI (`Verify`) runs on pull requests only and skips docs-only changes.

The workflow needs repository variable `PROD_URL` and secret
`VERCEL_DEPLOY_HOOK_URL`, mapped in `hetzy8/ops/secrets/targets.json` and
pushed from Bitwarden. Both were set during provisioning (2026-11-02); without
them the workflow fails loudly.

Release checklist:

1. `dev` CI is green on the latest merged PRs; list what the batch contains.
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
6. Delete `dev` and recreate it from the release commit, then retarget any
   open PRs to the new `dev` (`gh pr edit <n> --base dev`). This is the hetzy8
   standards release rule (getmygoals' practice): each cycle starts level with
   production, which is why `dev` has no ruleset. The hetzy8-eng command guard
   blocks agents from writing `dev`/`main`, so Yoram runs:
   `git push origin --delete dev && git push origin <release-sha>:refs/heads/dev`.

After an explicitly authorized release: verify migrations and recovery steps,
check email and media access with approved test accounts, and record the actual
deployment. Then apply an annotated `vX.Y.Z` tag to that deployed commit
(patch for fixes, minor for features, major for breaking changes). Do not create a release tag for documentation bootstrap.
Rollback must consider database compatibility; do not run a destructive down
migration merely to make old code start.

## Preservation and recovery

The proposal is daily encrypted database and media backups, RPO 24 hours and
RTO 1 working day. Before launch, approve backup retention and costs, record
where keys live, document database/object-store restore order, and rehearse
restoring to a separate environment. The rehearsal verifies representative
content, ordering, media, private/public/archive states, revisions and
revoked-member denial on protected operations. Normal item recovery returns to
private. Disaster recovery must reconcile later unpublishing/revocation actions
before reopening traffic; do not resurrect stale public visibility or access. Rotate
session/token secrets after a restore when required to prevent old access
from becoming valid again. Never commit backup payloads to GitHub.

If the only administrator loses email access, recovery is a documented,
owner-verified operator procedure, not a public reset/admin-creation endpoint.
Adding a replacement admin revokes obsolete access and records an audit event.

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
