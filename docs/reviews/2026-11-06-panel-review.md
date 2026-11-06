# Panel review, 2026-11-06

**Scope:** `dev` at `4223972` (v0.5.0 plus the importer owner-decision fixes),
reviewed read-only by five independent agents (project manager, designer,
developer, security, QA) on the day stage 1 of the catalog import went into
production. The full reports stay outside the repository; this document keeps
the findings, the agreed order of work and Yoram's decisions.
**Status:** decisions recorded; nothing below is implemented unless the
roadmap says so.

Yoram's brief: "the current design is cold and not inviting; this project is
built for friends and family, it has to be warm, exciting and full of
memories."

## Verdict on the brief

All five reviewers agree: the site is cold, and cold **by absence, not by
palette**. It is an engineering shell with a catalogue voice:

- The first sentence a visitor reads is the development banner, and the tab
  title still says "development version" (`src/locales/he.ts`).
- Home is a name, one uncaptioned collage and two links; About says there is
  no public content yet. Nothing says who Yaki was or why the site exists.
- Copy is administrative ("item", "what to search", "no items found").
- The public item page has no image slot; search is a plain list of
  title · date · type. The first public catalogue is 47 link cards without
  pictures.
- Type and colour are institutional: Arial first in the font stack (the Hebrew
  font named after it is never loaded), light headings, a slate-teal palette;
  the only warm colour is the focus ring (`src/app/globals.css`).
- Behind the sign-in the family will see 1,115 filename-titled rows with no
  pictures until stages 2–4 of the media plan serve the files and a viewer.

Two reviewers add a caution the panel adopted: a redesign today would still
feel cold, because there are no photos on the site to design around. Content
and the viewer come first; the visual direction follows once real photos
exist; warmth is measured with relatives, not by opinion.

## Order of work (decided by Yoram, 2026-11-06)

Yoram accepted the recommendations with ops and backups first, once the
import is finalized.

1. **Finish stage 1.** Done 2026-11-06 (OPERATIONS.md → Import records).
   Remove the development banner and tab title and the stale member-help
   copy that says email is unavailable; record the import.
2. **Ops and backups** before any family editing and before the first
   invitation: scheduled database dump to private storage, one rehearsed
   restore, retention and cost approved, keys recorded, all in OPERATIONS.md.
   Three of five reviewers ranked this highest; the roadmap had parked it in
   phase 8. Includes the operational findings below (sign-in rate bucket,
   takedown and incident runbook, docs drift).
3. **"Pictures on a phone":** media stages 2–4 as one milestone, done when
   Yoram opens ten family photos on a phone. Preconditions from the security
   review: private buckets only, membership re-checked on every request
   including each byte range, EXIF/GPS stripped from derivatives, originals
   never public, sniffed content types, a per-session byte ceiling. From the
   developer review, before stage 3 writes a thousand derivatives: allow more
   than one derivative per item (`MediaFile @@unique([itemId, role])`), use
   `private, max-age` for thumbnails instead of the global `no-store`, and
   memoize the member check per request.
4. **Warm home page and life story.** Designer's recommended direction, the
   "living-room wall": an approved portrait with name, years and one sentence;
   six framed, family-captioned photos; a timeline teaser; link cards styled
   as newspaper clippings; search last. Warm sand/olive/brown palette taken
   from the photos; Hebrew display type through `next/font` (David Libre
   headings, Rubik body); item pages figure-first with a caption line of
   date · place · who and provenance demoted to a footer; undated items carry
   a "who remembers when this was?" prompt. Plain CSS, one developer. Needs
   from the family: a portrait, 6–12 captioned photos, the years and the first
   life-story paragraph. Every Hebrew string is a draft until Yoram approves it.
5. **Invite three relatives and watch.** A Hebrew welcome email (adding a
   member sends nothing today), a second administrator, three observed
   30-minute sessions (an older relative on iPhone with large text, one on an
   older Android, one younger), starting cold on the home page. Warmth
   criterion: a memory spoken unprompted within ten minutes; count "is that
   all?" moments and the reaction at the sign-in wall. Repeat after step 4.
6. **Curate, don't grind.** Group the family list by source folder, add a
   favourites mark, caption fifty favourites together; those seed the
   timeline. Review of the 1,115 items is enrichment, not a gate.

Accepted alongside, each with its own design before it is built:

- **Source health check** as a feature and a release step (QA): link status
  and checked-at on each external source, a dry-by-default script with a
  report outside the repository, a family filter for broken links, editable
  source fields on the item form (today a missed author or date can only be
  fixed in the database, because reruns never update existing items), run
  before every release and after every import.
- **Family-only by default** for people, and a family-only flag for places
  (security).
- **Data model for memories** (developer), additive and in this order:
  person-link roles (depicted, mentioned, photographer, donor) and file
  captions; stories and reactions by family members (the 2026-11-01 spec put
  comments out of scope; reopened by this decision); relations and
  collections between items; events for the timeline and a richer person
  (relation to Yaki, dates, portrait, bio); an editable life-story page with
  revisions.
- **Wider smoke gate** (QA): a Hebrew search returns a card, a pinned public
  item answers 200 and an unknown id 404, `/family` and `/admin` redirect,
  `dir="rtl"` is present, the public card count matches.

## Findings by reviewer

Severity as given by the reviewer. "Confirmed" means the reviewer or the
coordinator found it in the code; "reported" means not re-verified.

### Security (boundary sound; risks operational)

| Severity | Finding | Status |
|---|---|---|
| High | No backup or restore drill for the production database | confirmed |
| Medium | Sign-in rate limit keyed on one shared bucket, so a single stranger can block everyone's sign-in for 15 minutes | reported |
| Medium | `Person.familyOnly` defaults to false; `Place` has no family-only flag; the public card note is free text published without family review | confirmed |
| Low–medium | No takedown, deletion, incident or secret-rotation runbook | confirmed |
| Low | Public search loads the whole published set per request, twice for a non-empty query | confirmed |
| Low | Possible timing difference between member and non-member on the access request route | suspected |

Passed: membership checks in the service layer on every family and admin read
and action; explicit public projection; hashed single-use 15-minute tokens;
7-day sessions; append-only audits; no secrets or real identifiers in git
history; keyless Drive access refuses non-impersonated logins; importer
confirmation bound to host and snapshot.

### Developer (lint clean, 138/138 unit tests)

- High: family pages run the session check three times per request
  (navigation, page guard, editorial `run()`); stage 4 would multiply it per
  thumbnail. Memoize `requireMember` with React `cache()`.
- High: `Cache-Control: private, no-store` on every path (`next.config.ts`)
  forces relatives to re-download every thumbnail on every visit.
- Medium: public pages are uncached; move the public reader to `use cache`
  with tags invalidated on publish, unpublish and rights withdrawal.
- Medium: Hebrew search is in-memory substring only, with no normalization of
  final letters, geresh or niqqud, and there is no family search; needs a
  normalized search column with a trigram index before the archive is searched.
- Medium: `src/services/editorial.ts` (432 lines) holds lifecycle, rights,
  review, listing, people and places and is about to absorb files, sources
  and catalog; split it. Five family pages repeat the same access and redirect
  boilerplate; `isAccessError` is defined three times.
- Indexes for coming slices: `ItemRevision(dateStart)` for the timeline,
  `Item(state, updatedAt)` for the paged list.
- Streaming large audio through Vercel functions is unmeasured (Gate B).

### QA

Untested journeys: anonymous Hebrew search through the page and the
database; member sign-in from the form; "make private" in the UI leading to
an anonymous 404 and removal from search; mobile Safari, old Android, large
fonts and slow networks (Playwright is desktop Chromium against `next dev`);
importer refusals and the review queue. Quality: a members test asserts a
rejection without a message; specs import copy from the locale, so wrong
Hebrew cannot fail; index-based locators and a timer-ordering test are
flake-prone. `/family` already renders thumbnails from a media route that
does not exist yet.

### Project manager

"Imported" is not "usable": the family milestone is the viewer. No
invitation or onboarding exists. Review load of 1,115 items falls on one
account with a flat list. Single operator and administrator. Public side cannot
show any photo by design until rights are cleared.

### Designer

RTL foundations are solid (logical properties, `dir` and `lang`, gershayim)
but URLs and Latin publisher names lack bidi isolation and the wordmark uses
Latin-style letter spacing. Accessibility is well-founded (skip link, focus
ring, 44 px buttons, strong contrast) but all body text is grey, navigation
and preview text are small with tap targets around 20 px, and the collage has
a generic alt text; relatives over seventy on phones will feel it. Two
alternative directions were offered (family album; newspaper archive) and
not chosen.

## Open after this review

- Where the backup lives, its cost and who holds the keys (step 2 design).
- Who supplies the portrait, the captioned photos, the years and the first
  life-story paragraph (step 4).
- Whether relatives' stories and reactions are public or family-only.
- Who clears rights on family material (carried over from the media design).
