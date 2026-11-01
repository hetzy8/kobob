# Archive data ownership and migration

**Date:** 2026-11-01
**Status:** planning only; no files moved or imported.

## Accepted decisions

All 1,374 existing catalog records enter private website administration.
Viewers see only Yoram-approved items. After launch Yoram manages records,
media, publication and users through the website. Drive remains preserved
source material, not an independently editable production catalog.

## Where information belongs

| Information | Destination | Boundary |
|---|---|---|
| English specs, code, schema, importer, synthetic tests, runbooks | GitHub | Public repository; no actual content exports or private IDs |
| Catalog and editorial decisions, sources, rights, relationships | PostgreSQL | Admin sees all; viewer queries filter approved items |
| Membership, verification and audit records | PostgreSQL | Separate role/session checks; no public user directory |
| Original files and browser-friendly derivatives | Private R2 | Separate immutable originals and versioned derivatives; no public bucket |
| Existing Drive originals and frozen catalog | Drive | Preserved migration evidence; no destructive moves |
| Database and media recovery copies | Independent private backup destination, to select | Separate credentials, retention and restore rehearsal |

## Preserve meaning

Keep stable KOB identifiers, original names, source references and folder
provenance, creator/contributor, rights, review notes and coverage, date
precision/evidence, human appearance confirmations, tags, SHA-256 and duplicate
groups. Preserve original Hebrew values; technical enums can use English
without losing source values. Do not treat confirmation of a person's
appearance as approval to display the item.

The inspected catalog had no approved website selections. External research
records may represent links rather than downloadable files. Proposed handling:
Yoram may approve a rights-reviewed metadata-only source card with an explicit
external link; no copied media, remote preview fetch or embed is implied.
External destination access is controlled by its publisher. Unavailable or
unreviewed material stays explicit, with no invented description or rights.
Do not merge duplicate catalog records or delete originals automatically.

## Staged transition

1. **Reconcile privately.** Snapshot dated source versions in approved private
   storage; map every source field. Compare catalog, folder inventory and
   web registry; paginate listings and account for native exports, links,
   missing files, duplicate references and unknown sizes. A 100-child folder
   response is not proof of a complete inventory.
2. **Dry-run import.** Validate all KOB IDs and source statuses; report expected
   creates/updates/errors without publishing or mutating source files.
   Preserve source version and import-run evidence outside public Git.
3. **Private catalog import.** Idempotently load all records and source review
   decisions. Never overwrite later website edits on retry; report conflicts
   for administrator resolution. Reconcile counts and rejected rows.
4. **Copy and verify media.** Copy accessible originals without moving/deleting
   Drive sources. Compare bytes and SHA-256; retain explicit missing/failed
   states. Generate safe derivatives for TIFF, legacy documents and supported
   audio/video. Unsupported originals remain private and cannot publish.
5. **Editorial review.** Yoram reviews through the website. Approval requires
   deliberate action, rights review and a valid safe delivery representation
   (or the explicitly labelled metadata-only card for a link-only source).
   Unpublish immediately blocks new viewer requests, including media.
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
retry and duplicate-record preservation. All imported records start private.
Viewer search, detail, thumbnails and media must independently enforce approval.

Before cutover, Drive remains the recovery source. After website edits begin,
rollback must preserve those new edits and files through a consistent export
and restore; simply reopening the old Sheet loses work. A Drive preservation
copy is not an ongoing backup of the live website database.
