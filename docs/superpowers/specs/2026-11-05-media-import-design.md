# Private media storage and collection import

**Date:** 2026-11-05
**Status:** approved by Yoram, 2026-11-05. Plan:
[media import plan](../plans/2026-11-05-media-import.md).
**Roadmap:** phases 3 and 4 in [ROADMAP.md](../../ROADMAP.md), joined into one
path and moved ahead of the rest of phase 2 (Yoram, 2026-11-05).
**Depends on:** v0.4.0; [item editing design](2026-11-03-item-editing-design.md);
[data migration plan](../../DATA-MIGRATION.md).

## Goal

The family can see the existing collection inside the site and review it. Public
material found on the internet appears publicly as link cards without waiting
for that review.

The site cannot fill any public tab until this exists: the catalog has event
dates on 2 of 1,379 records, and rights are unresolved on 1,378. Dates, titles and
rights come from family review, and the family cannot review files they cannot see.

## Evidence

Read-only analysis of the private catalog and file inventory on 2026-11-05. Only
counts are recorded here; names, links and identifiers stay out of this
public repository. Counts come from metadata, not from re-measured files. The
dry run re-checks them.

| Measure | Count |
|---|---|
| Catalog records (unique, gapless identifiers) | 1,379 |
| Records with a file | 1,294 |
| Web records with a link only | 85 |
| Original bytes | 2,126,631,828 (about 2.13 GB) |
| Files without a recorded SHA-256 | 1,262 |
| Probable system files (`._*`, `Thumbs.db`, Word lock file) | 165 |
| Web records naming the subject explicitly with context | 81 |
| Web records matched only from search results, never opened | 18 |
| Web records with a saved copy (13 rights unclear, 1 CC BY-SA 3.0) | 14 |
| Audio or video actually watched or heard | 0 |

Cloudflare R2 storage on the existing account was 268.64 MB with $0 billed on
2026-11-05 (Yoram's dashboard). Listed pricing: 10 GB-month free, then $0.015 per
GB-month; no egress charge. No plan upgrade is needed.

Vercel documents a 4.5 MB payload limit lifted for streamed responses, a 300 s
default duration that includes streaming, and advises against using functions as
a media server. Actual behavior with large files is measured in stage 2.

## Decisions

1. **Import before site uploads.** No upload through the site in this design.
2. **Exclude system files from items.** The importer confirms each by content
   (the AppleDouble header for `._*`, the name and format for `Thumbs.db` and lock
   files). Anything unconfirmed stays an item. Excluded records are listed in
   the private import report. Drive is not changed.
3. **The original filename is the placeholder title,** marked as needing review.
   Web records use their cataloged title. Nothing is invented.
4. **Internet records skip family approval** (Yoram, 2026-11-05: they are already
   public). See [Internet records](#internet-records). This changes product
   invariant 7 for these records and the roadmap's rule that nothing is public
   before family review, so stage 1 updates AGENTS.md, ROADMAP.md and
   DATA-MIGRATION.md.
5. **Family records need rights cleared before publishing.** A family member marks
   rights as cleared; publishing is refused otherwise. Rights ownership for family
   material is still an open question and does not block import. Withdrawing rights
   on a public family item unpublishes it, with a warning beforehand (Yoram,
   2026-11-05).
6. **Public media is out of scope.** A published item shows text and links only.
7. **Own bucket and keys.** Kobob never shares a bucket or key with another app.

## Records and what they become

| Catalog records | Count | Result |
|---|---|---|
| System files, confirmed | up to 165 | No item; listed in the report |
| Family files | up to 1,115 | Private item with file; needs review |
| Internet, explicit identification, link only | 67 | Public link card |
| Internet, explicit identification, saved copy | 14 | Public link card; copy family-only |
| Internet, search match only | 18 | Private; needs a fact check |

Expected total: 1,214 items with 1,129 files, if all 165 system files are confirmed.

Imported descriptions, review notes and summaries go to the private catalog
record, never the public description: 40 of them contain internal review wording.
The five records marked as selected for the site stay private with that choice
kept in their catalog record. Duplicate groups are preserved, never merged. Only 1
of the 10 groups is a binary duplicate; the rest are versions, reprints or sets.
Event dates are not imported automatically; one of the two cataloged dates is
evidently a publication year. The dry-run report lists both for Yoram.

### Internet records

- **Public card:** cataloged title, publisher, author, source publication date
  as text, the source link and its license where recorded. No summary, no copied
  file, no fetched preview, no embed. Links open with `rel="noopener noreferrer"`
  and only `http` and `https` are accepted.
- **Publishing:** the first import creates the item with its published revision
  and an audit row. A later import never republishes, so a family member's
  "make private" or archive decision sticks.
- **Search matches (18):** stay private until a family member or an agent opens the
  source and confirms it concerns him; then an ordinary publish, with no rights step.
- **Saved copies:** being online does not grant the right to rehost, so a saved copy
  stays family-only even when its card is public. Showing one is a later rights
  decision.
- **Where they appear:** existing item pages and search now; the "From the
  internet" tab in phase 2 slice 4.

## Data model

New migration, additive only, so v0.4.0 runs unchanged against it.

- **`Item`:** `origin` (`family`, `internet`; default `family`), `rightsStatus`
  (`unknown`, `needs_clarification`, `cleared`; default `unknown`) and
  `reviewStatus` (`needs_review`, `reviewed`; default `reviewed` so existing
  items are not flagged; the importer sets `needs_review`). Changes use the
  existing version check and write an audit row.
- **`ExternalSource`:** `itemId`, `url`, `publisher`, `author`, `publishedText`,
  `license`. Only these fields reach public queries, and only for published items.
- **`MediaFile`:** `itemId`, `role` (`original`, `thumbnail`, `display`),
  `storageKey` (opaque, with no filename or family data), `mimeType`, `sizeBytes`,
  `sha256`, `width`, `height`, `status` (`pending`, `verified`, `failed`),
  `failureCode`, `originalFilename`. Unique on `itemId` and `role`.
- **`ItemCatalogRecord`:** `itemId`, the verbatim catalog row as JSON, its tab and
  the snapshot hash. Family reads only; never selected by a public query. The item
  page shows provenance, rights, creator and appearance values verbatim from this
  record rather than copying them into many typed fields. A confirmed appearance
  never grants permission to display.
- **`ImportRun`:** kind, snapshot hash, start and finish, counts only. Row detail
  stays in the private report outside Git.

`ItemRevision.authorId` has no foreign key; imports use a fixed system actor value.
Stage 1 checks that nothing assumes it is a member.

## Storage

- Two private buckets, production and development, with no public access or CORS.
  Tests use an injected fake client and never reach a bucket.
- Three keys: a read-only production key for the app, a read-write production key
  held only for the operator's import, and a development key. Each is limited to
  one bucket and mapped through ops/Bitwarden.
- Settings: `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
  They are validated separately from `readServerConfig`, as email settings are, so
  a missing setting does not block pages. Health reports validity booleans only.
- Drive stays the recovery source for originals during migration. This is not a
  tested backup; automated backup belongs to the launch phase.

## File delivery

`GET /api/media/[id]` streams through the app. Direct signed links were rejected
because they outlive revocation until expiry, and the plan requires a current
check on every new read.

- Each request, including each range request, checks a current session and active
  verified membership. An unauthorized or unknown id gets the same 404.
- Only `verified` files are served. Storage keys never reach the browser.
- Range requests return 206 with a capped chunk, so audio and video stay within
  the function duration.
- Headers: `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, a
  sandboxing CSP. Inline only for JPEG, PNG, GIF, PDF and MP3; everything else is
  an attachment, including `.mht` and other active formats.

## Import

Two operator scripts run on Yoram's Mac; nothing runs on Vercel. Both default to a
dry run, need an explicit `--apply`, print the target database host before writing,
and write reports to a path outside the repository.

**`scripts/import-catalog.ts`** reads a dated catalog export, not the live sheet;
the catalog changed after its "frozen" date. It validates identifiers and reports
planned creates, updates, exclusions and errors. Keyed on `Item.kobId`, a rerun
creates no duplicates and never overwrites website edits; a changed row on an
edited item is reported as a conflict.

**`scripts/import-media.ts`** reads from Drive by file id, using a Google service
account with Viewer access to the collection folder only. For each file:

1. Read from Drive, one file at a time, checking size against the catalog and
   computing SHA-256.
2. Upload to the original key in R2.
3. Read it back and compare bytes and hash; only then mark it `verified`.
4. Create a thumbnail, and a display copy for TIFF, with `sharp`. Embedded metadata
   such as GPS is stripped. `sharp` cannot read BMP, so the 2 BMP files download
   only.

A run is resumable and skips verified files. Failures stay as explicit `failed`
states with a code, and never hide a record.

## Family review pages

- `/family` becomes paged, with thumbnails and a "needs review" filter.
- The item page shows the file, its source and provenance, rights and review status,
  with actions to mark rights cleared and mark reviewed. Editing uses the existing
  form and conflict checks.
- Publishing a family item without cleared rights is refused on the server and
  explained on the page.
- Browser viewing: images including TIFF through the display copy, PDF, MP3. Office
  files, WMV, ZIP, BMP and others download with an honest "no preview yet" label.
- New Hebrew strings need Yoram's approval before release.

## Stages

Each stage is its own PR into `dev`. Each run against real data needs Yoram's
explicit go.

1. **Schema and catalog import.** Models, the rights rule with its status actions
   (without them the family could not publish after this release), `import-catalog`,
   doc changes, the paged family list and needs-review filter. Dry-run report for Yoram, then the import: 81 public cards and
   private records without files.
2. **Storage and delivery.** R2 client and media route. Yoram provisions
   buckets and keys. Measure on production, behind sign-in, with synthetic files
   of the largest sizes (about 220 MB audio, 64 MB image), since preview
   deployments are off.
3. **File copy.** `import-media` on a small sample, then everything. Reconcile
   counts, bytes and hashes.
4. **Review pages.** Thumbnails appear, and the file viewer.

If stage 2 measurements show that streaming cannot serve the largest files, this
comes back to Yoram before stage 3, with costs and the access trade-off.

## Testing

Synthetic fixtures only, on the isolated test database.

- **Access:** anonymous, revoked and unverified users get 404 on every role,
  including on range requests; revocation takes effect on the next request.
- **Public boundary:** no public query or page exposes a catalog record, summary,
  saved copy, media file or held item. Making a card private removes it from public
  reads and from search, and a rerun does not bring it back.
- **Rights rule:** a family item cannot be published without cleared rights, by any
  path; internet items skip the rule; already-published items are unaffected until
  their next publish; withdrawing rights unpublishes a public family item.
- **Delivery:** ranges, chunk cap, attachment for unsafe types, spoofed types,
  no storage key in responses, EXIF stripped.
- **Import:** rerun without duplicates, website edits preserved, conflicts reported,
  system-file detection including a false `._` name, size and hash mismatch, failed
  and resumed copies, external URL scheme validation, malformed rows.
- **Hebrew RTL:** new pages and status messages in browser tests.

## Not in this design

Uploads through the site; Office and WMV conversion; video and audio embeds; public
media; automated backup of R2; link-liveness checks; the timeline and other public
tabs.

## Open questions

- **Rights for family material:** who may clear it. Does not block import; blocks
  publishing family items.
- **Derivative size:** unknown until stage 3. Expected to stay within the allowance;
  measured then.
- **Vercel transfer costs:** measured in stage 2 and recorded in HOSTING.md.
