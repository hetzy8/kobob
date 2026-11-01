# Operations, cost and launch conventions

**Status:** initial local foundation exists; provider services, live email,
secrets distribution, backups, monitoring integration and domain configuration
remain unprovisioned. Local test data and source CI configuration are not production.

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
pushed from Bitwarden. Neither exists yet; they belong to the authorized
provisioning step, and a release before then fails the workflow loudly.

Release checklist:

1. `dev` CI is green on the latest merged PRs; list what the batch contains.
2. Yoram gives an explicit go; open the `dev` → `main` PR
   (`gh pr create --base main --head dev`) and wait for its checks.
3. Before merging, confirm migrations are backward-compatible with the code
   currently live (rollback runs old code against the new schema).
4. Merge; confirm the `Vercel Deploy (production)` run's smoke gate is green
   (`gh run list --workflow=vercel-deploy.yml --limit 1`, then
   `gh run view <id> --json conclusion`).
5. Tag the deployed `main` commit and record SHA, run and verification here.

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
release flow. A matching `dev` ruleset is proposed but not yet applied.
