# Operations, cost and launch conventions

**Status:** planned. No application services, secrets, backups, monitoring or
domain configuration were created during documentation initialization.

## Ownership

Yoram owns membership, content approval, provider/budget decisions and launch.
The person implementing a release records evidence and remaining limitations.
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

- Confirm `kobobhetz.org` control, registrar/renewal ownership and canonical
  hostname. Proposed canonical origin is `https://kobobhetz.org`; redirect
  `www` only once configured. No DNS changes are part of this task.
- Confirm provider plan limits, regions, privacy requirements and dated costs.
  Existing provider familiarity does not mean spare capacity or zero cost.
- Check Bitwarden organization/project capacity and the current secrets tooling
  before adding a kobob scope; do not assume a fourth free project exists.
- Keep dev/test/production data and credentials isolated. Preview deployments
  use synthetic content and never the production member list or media bucket.

## Names-only configuration proposal

Final variable names follow the chosen auth/storage integrations. Expected
concepts include database runtime and migration URLs, auth secret, canonical
origin, email API key/from address, and private storage endpoint/bucket/key.
No values or real addresses belong in docs. Do not add a `NEXT_PUBLIC_` prefix
to a secret. A later `.env.example` contains empty placeholders only.

## Verification and release

Documentation-only changes check links, scope, English text, statuses and
whitespace; there is no app suite yet. Future CI uses isolated databases,
mocked email/storage and synthetic family fixtures. It must prove direct
authorization failures, revocation, token replay and Hebrew RTL flows.

After an explicitly authorized release: verify migrations and recovery steps,
deploy the reviewed `main` SHA, check email and media access with approved test
accounts, and record the actual deployment. Then apply an annotated `vX.Y.Z`
tag to that deployed commit (patch for fixes, minor for features, major for
breaking changes). Do not create a release tag for documentation bootstrap.
Rollback must consider database compatibility; do not run a destructive down
migration merely to make old code start.

## Preservation and recovery

The proposal is daily encrypted database and media backups, RPO 24 hours and
RTO 1 working day. Before launch, approve backup retention and costs, record
where keys live, document database/object-store restore order, and rehearse
restoring to a separate environment. The rehearsal verifies representative
content, ordering, media, draft privacy and revoked-member denial. Rotate
session/token secrets after a restore when required to prevent old access
from becoming valid again. Never commit backup payloads to GitHub.

If the only administrator loses email access, recovery is a documented,
owner-verified operator procedure, not a public reset/admin-creation endpoint.
Adding a replacement admin revokes obsolete access and records an audit event.

## Launch checklist (not completed)

- [ ] Yoram approves scope, content, Hebrew copy and publication permissions.
- [ ] Admin email and recovery process are established privately.
- [ ] Budget, data/storage regions, retention and provider limits are approved.
- [ ] Sender domain is verified and SPF/DKIM/DMARC reviewed; mail tested with an
  approved address, never a bulk invitation run.
- [ ] DNS/TLS/canonical redirects are verified on the intended domain.
- [ ] Anonymous, member, revoked-member and admin flows pass on every hostname.
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
