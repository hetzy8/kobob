# Archive data ownership and migration

**Date:** 2026-11-01
**Status:** catalog imported; five selected files copied to R2 (2026-11-06), the rest not moved. Stage 1 of the
[media import](superpowers/specs/2026-11-05-media-import-design.md) ran on
2026-11-06 (1,162 items; OPERATIONS.md → Import records); the Drive originals
stay where they are until stage 3.

## Accepted decisions

The catalog holds 1,379 records, and five of them carry a site selection. All
enter the website privately, with one exception (Yoram, 2026-11-05): imported
internet records that explicitly name their subject publish as link cards
without family review; their summaries and saved copies stay family-only.
The five selected records stay private with that choice kept in their catalog
record. Probable system files (`._*`, `Thumbs.db`, a Word lock file) are
excluded only after a content check, and listed in the report. File hashes
are computed at copy time, not taken from the catalog. The duplicate column
marks related versions, reprints and sets, not duplicates, so nothing is
merged. Take a private snapshot of the exported tabs before the dry run.
Every active verified family member can read every private item, contribute,
edit/publish/unpublish everyone's items, archive recoverably and restore as
private. Only Yoram manages membership and permanently deletes. Concurrent
edits/transitions reject stale revisions instead of overwriting newer work.

After cutover the website manages content, sources, media and users. Drive
remains preserved source material, not a second editable production catalog.
External sources are required; audio/video supports selected embedded players
or hosted playback. Articles keep flexible representations. Preserve source
references independently of delivery mode and never assume copying rights.

## Where information belongs

| Information | Destination | Boundary |
|---|---|---|
| English specs, code, schema, importer, synthetic tests, runbooks | GitHub | Public repository; no actual content exports or private IDs |
| Catalog and editorial decisions, sources, rights, relationships | PostgreSQL | Family sees private/public records; public queries expose only explicitly public fields |
| Membership, verification and audit records | PostgreSQL | Separate role/session checks; no public user directory |
| Original files and browser-friendly derivatives | Private R2 | Separate immutable originals and versioned derivatives; no public bucket |
| Existing Drive originals and frozen catalog | Drive | Preserved migration evidence; no destructive moves |
| Database recovery copies | Private Backblaze B2 bucket (2026-11-07): nightly encrypted dumps, 32-day daily and 366-day monthly retention, Object Lock | Separate read-only database role and bucket-scoped keys; restore rehearsed 2026-11-07 (OPERATIONS.md → Restore drill) |
| Media recovery copies | Not yet backed up; R2 holds five files and Drive keeps the originals | To decide with media stages 2–4 |

## Preserve meaning

Keep stable KOB identifiers, original names, source references and folder
provenance, creator/contributor, rights, review notes and coverage, date
precision/evidence, human appearance confirmations, tags, SHA-256 and duplicate
groups. Preserve original Hebrew values; technical enums can use English
without losing source values. Do not treat confirmation of a person's
appearance as approval to display the item.

External research records may be links, not downloadable files. Preserve them as source entries,
with attribution and original links. Video/audio uses supported players where
available; articles can remain metadata/link cards. Do not copy media, scrape
previews or embed arbitrary sources automatically. Publication of family
items requires a family member's deliberate action and rights/safe-delivery
review. Exception (Yoram, 2026-11-05): an internet record that explicitly names
Yaki publishes as a link card at import, without family review; its summary and
any saved copy stay family-only. External access remains controlled by the
publisher. Broken/restricted sources keep
explicit states without invented descriptions or rights. Do not merge duplicate
records or delete originals automatically.

## Staged transition

1. **Reconcile privately.** Snapshot dated source versions in approved private
   storage; map every source field. Compare catalog, folder inventory and
   web registry; paginate listings and account for native exports, links,
   missing files, duplicate references and unknown sizes. A 100-child folder
   response is not proof of a complete inventory.
2. **Dry-run import.** Validate all KOB IDs and source statuses; report expected
   creates/updates/errors without publishing or mutating source files.
   Preserve source version and import-run evidence outside public Git.
3. **Catalog import.** Idempotently load all records and source review
   decisions; family records are private, internet link cards are public. Never overwrite later website edits on retry; report conflicts
   for administrator resolution. Reconcile counts and rejected rows.
4. **Copy and verify media.** Copy accessible originals without moving/deleting
   Drive sources. Compare bytes and SHA-256; retain explicit missing/failed
   states. Generate safe derivatives for TIFF, legacy documents and supported
   audio/video. Unsupported originals remain private and cannot publish.
5. **Editorial review.** Family members review through the website. Publishing
   requires deliberate action, rights review and safe delivery (or a labelled
   metadata/source card). Return-to-private/archive blocks new public reads,
   including media/metadata; family private access remains. Restoring an archived
   record is always private. Public links to private related records reveal nothing.
6. **Cutover.** Briefly freeze source catalog edits, reconcile a final delta,
   verify records/hashes/relationships and perform an isolated restore drill.
   Obtain Yoram's cutover approval, then make website edits authoritative.
7. **Operate through the website.** Upload, describe, review, publish, manage
   users, inspect processing failures and retry from the admin UI. Future
   Drive material enters through an explicit import workflow, never silent
   bidirectional synchronization. Retained snapshots are read-only evidence.

## Validation and rollback

Use synthetic fixtures in public tests. Prove import idempotence, editorial
conflict preservation, missing-file reporting, hash mismatch handling, safe
retry and duplicate-record preservation. Imported family records start private; the only imported records that publish
are the internet link cards above. Public search, detail, thumbnails and media independently enforce current
public visibility; family routes require active verified membership. Imported
family records and restored records never become public implicitly. Retain stable
KOB/item IDs and source references across a future site-domain change.

Before cutover, Drive remains the recovery source. After website edits begin,
rollback must preserve those new edits and files through a consistent export
and restore; simply reopening the old Sheet loses work. A Drive preservation
copy is not an ongoing backup of the live website database.
