# Ops and backups design

**Date:** 2026-11-06
**Status:** approved by Yoram, 2026-11-06, including the Hebrew wording below; not
implemented. Yoram asked for R2 and the five selected collages first, so this
step follows that work.
**Source:** step 2 of [ROADMAP.md](../../ROADMAP.md) → Order of work, from the
[panel review](../../reviews/2026-11-06-panel-review.md). Yoram chose Backblaze
B2 as the only backup destination (2026-11-06).

## Goal

Before any family editing and before the first invitation, website data must
survive the loss of Neon, and that must be shown by a real restore. This step
also closes the operational findings that block inviting people: the sign-in
lockout, the missing runbook and the development wording.

Today Drive holds the media originals and the catalog export, but nothing
outside Neon would hold what the website itself creates: edits, reviews,
members and audits. That gap grows the day relatives start captioning.

## Out of scope

- Backing up media files. R2 holds only copies of files that remain in Drive,
  which still covers the originals; this design must add media backup before
  family uploads exist.
- Copies at a second provider, automated restores in CI, and permanent deletion
  of items.

## Backup workflow

`.github/workflows/db-backup.yml`, adapted from Sana's working `DB Backup`,
runs daily at 03:00 UTC and on manual dispatch. Steps:

1. Check that every required secret is present; fail loudly if not.
2. Install the `pg_dump` matching the Neon server major (the local image is
   Postgres 17; the plan confirms production's version first).
3. Run `pg_dump --no-owner --no-privileges | gzip -9 | age -r <public key>`
   under `set -o pipefail`, retrying while Neon wakes from suspend. Plain SQL
   never reaches disk unencrypted. The whole database is dumped, including
   member emails and catalog rows, which is why the encryption is required
   rather than optional as it is on Sana.
4. Upload to `daily/kobob-YYYY-MM-DDTHH-MM-SSZ.sql.gz.age`. If `monthly/` has no
   dump for the current month yet, upload the same file there too, so one failed
   night cannot skip a month.
5. Compare the size with the previous dump. A dump under half that size is
   **uploaded anyway and the run fails**, so a person looks. This differs from
   Sana, which refuses the upload: nothing can be overwritten here, and a
   legitimate large deletion must not stop backups.

Decisions:

- **Public logs.** The repository is public, so anyone can read the run logs.
  Steps print sizes and object names only, never row data or connection strings.
- **Protected secrets.** Secrets live in a GitHub Environment `backup` limited
  to `main`, so a workflow on another branch cannot read them. Actions are
  pinned by commit, as in `ci.yml`. The job has `contents: read` only.
- **Read-only database role.** A new Neon role `kobob_backup` with
  `pg_read_all_data` (`OPERATIONS.md` → least privilege). A leaked secret can
  read but not change the database. If the role cannot dump every table, the
  run fails rather than producing a partial dump silently.
- **No CI key can delete.** The workflow's B2 key can write and list only.
  Expiry is done by B2 lifecycle rules, not by the workflow.

## Storage and retention

A new private B2 bucket in the existing account, used only by kobob, with
Object Lock on.

| Prefix | Kept | How |
|---|---|---|
| `daily/` | 32 days | Lifecycle rule hides at 32 days and deletes one day later |
| `monthly/` | 366 days | Lifecycle rule hides at 366 days and deletes one day later |

Default Object Lock of 30 days applies to the whole bucket, so neither a leaked
key nor a mistake can remove a recent dump. Monthly copies exist because a wrong
caption may go unnoticed for months.

**Cost.** Expected $0: about 44 small dumps against a 10 GB free allowance that
is shared with Sana's bucket in the same account, which the monitor already
tracks. The plan records the actual dump size and the then-current price from
Backblaze's pricing page in `OPERATIONS.md`.

## Keys

All names go through the ops secrets tooling, with Bitwarden as the source
(`shared` project, `KOBOB_` prefix). Yoram generates and enters every value in
their own terminal; agents never see them.

| Name | Goes to | Note |
|---|---|---|
| `KOBOB_BACKUP_DATABASE_URL` | `backup` environment | Direct, non-pooled URL of `kobob_backup` |
| `KOBOB_B2_BACKUP_KEY_ID`, `KOBOB_B2_BACKUP_KEY` | `backup` environment | Bucket-scoped; write and list only |
| `KOBOB_B2_BACKUP_BUCKET` | `backup` environment | Bucket name |
| `KOBOB_BACKUP_AGE_PUBLIC_KEY` | `backup` environment | Not secret, kept with the others |
| `KOBOB_BACKUP_AGE_PRIVATE_KEY` | **Bitwarden only** | No target. Never in CI or the repository |
| `KOBOB_B2_READ_KEY_ID`, `KOBOB_B2_READ_KEY` | `hetzy8/ops` monitor | List only, this bucket only |

Losing the private key makes every dump unreadable, so the drill below opens a
real dump with the copy from Bitwarden, not with the original file.

## Monitoring

A separate PR in `hetzy8/ops`, on Yoram's authorization: add `DB Backup` to
kobob's workflows and `backupWithinHours: 26` in `projects.json`, and a second
`backblaze` entry in `services.json` (bucket, `daily/`, its own read key).

The freshness check matters because a run that never starts alerts nobody, and
GitHub disables scheduled workflows after 60 days without repository
activity, which is normal here. Failed runs also email Yoram through GitHub's
own notifications; Sana's `ci-alert` action is not copied.

## Restore drill

Run by Yoram on the operator Mac, first after the first successful dump and then after
any material schema change, any key change and at least every six months.

1. Download the newest dump from the Backblaze console.
2. Fetch the private key from Bitwarden, decrypt and gunzip it.
3. Restore into a fresh scratch database in a local container, never Neon.
4. Run `scripts/verify-restore.ts` against the scratch database and against
   production, and compare the two reports.

`scripts/verify-restore.ts` is read-only and takes `DATABASE_URL`. It prints the
host and counts, never content:

- Latest applied migration, compared with the newest in `prisma/migrations`.
- Row count of every table.
- Items by origin and visibility, and the invariant that every public item has
  a published revision and every private item has none.
- Through the real public reader: a public item is returned and a private item
  is not.

It exits non-zero on a failed invariant. A difference between the two reports is
acceptable only if explained by edits made after the dump.

**Evidence rule.** Sana's "drill passed" record had to be retracted because no
restore had taken place. In `OPERATIONS.md`, a drill is recorded only with the
dump's date and size, the script's counts and migration, and who ran it. Without
those, the status stays "not rehearsed".

The recovery steps in `OPERATIONS.md` also require checking revoked-member
denial. No revoked member exists today, so the first drill records this as not
applicable; the integration tests cover the behavior.

## Sign-in lockout

`issueAllowed` in `src/lib/auth-system.ts` counts the global limit (50 per 15
minutes) first, and `runtime.ts` passes no `clientAddress`, so every visitor
shares one client bucket. Adding the address alone does not fix this: one
stranger's 51 requests would still exhaust the global limit for everyone.

- `runtime.ts` passes a `clientAddress` that reads `x-vercel-forwarded-for`,
  taking the first address, with IPv6 reduced to its /64. With no address it
  falls back to the current shared bucket, which only local runs reach. The
  plan confirms Vercel's handling of this header on a preview or production
  request before relying on it.
- `issueAllowed` first reads the global counter without incrementing it, and
  refuses at its limit before any row is allocated. It then increments the
  client counter (limit 20), the global counter and the per-address counter, in
  that order, each atomically. Only a client's first 20 requests can reach the
  global counter, however many arrive at once. (Changed in review: the first
  version read the client counter, and a synchronized burst passed that read
  together and used up the global limit.)

Accepted limits: many addresses together can still exhaust the global limit,
which protects the mail quota; and someone who knows a member's email can block
that one address for 15 minutes. The refusal shown to users does not change.

Tests (integration, failing first): a client over its limit no longer consumes
the global counter, so another client can still request; each limit still
refuses at its boundary; the fallback path behaves as today.

## Runbook

A new `Runbook` section in `OPERATIONS.md`, procedures only, no real data:

- **Takedown request.** Make the item private in the UI, confirm as an anonymous
  visitor that the page answers 404 and search no longer finds it, and log the
  date and a private reference outside the repository. Tell the requester the
  truth: encrypted backups keep the record until they expire, up to 366 days.
  After any restore, reapply every takedown logged since that dump.
- **Recovery from backup.** Restore to a new Neon branch or project, run the
  verification script, reapply takedowns and member revocations made since the
  dump, repoint the database secrets through the ops tooling, rotate the auth
  secret so old sessions and links die, and only then reopen traffic.
- **Leaked secret.** Which secret reaches which target (`ops/secrets`), rotate
  it through the tooling, and check what it could have reached.
- **Lost administrator email.** The owner-verified operator procedure with
  `scripts/recover-admin.ts` (changed in review: `scripts/bootstrap-admin.ts`
  refuses once any administrator exists); no public reset path.
- **Site down.** Health endpoint, deploy run, Neon and Vercel status, rollback
  rules from the release section.

`.claude/security-audit.md` and the docs that still describe removed routes are
corrected in the same PR.

## Development wording

Hebrew changes, approved by Yoram with this design:

| Where | Change |
|---|---|
| `documentTitle` | Becomes `יקי חץ` |
| `preview` banner | Removed, with its element in `layout.tsx` and `.preview` in `globals.css` |
| Member help text | Remove the last sentence, `שליחת דוא״ל עדיין אינה זמינה בגרסת הפיתוח.` |

`tests/fixtures/he-interface.json` is updated to match. Nothing else on the home
page changes; that is step 4.

## Delivery

One feature PR into `dev`, Codex review on Yoram's word, then a release to
`main`, because scheduled workflows run only from the default branch and the
sign-in fix and wording are production changes. No migration.

Yoram's steps, with exact commands from the plan: create the bucket, its rules
and keys; create the Neon role; generate the age key and store it in Bitwarden;
add the targets; run the workflow by hand once; run the drill. The ops monitor PR
follows the first good dump.

## Done when

- A scheduled run has uploaded an encrypted dump, and the bucket rules are
  confirmed in the Backblaze console.
- The drill has been run and recorded under the evidence rule.
- One client over its limit cannot block another client's sign-in, in tests.
- The runbook is in `OPERATIONS.md`, and production shows no development wording.
- The ops monitor reports kobob's dump age.
- The `Restore drill and rollback procedure` launch item is ticked only then.

## Open for Yoram

- A second person who can reach the Bitwarden key if Yoram cannot. Without one, a
  backup is only as recoverable as Yoram's own access. This does not block the build.
