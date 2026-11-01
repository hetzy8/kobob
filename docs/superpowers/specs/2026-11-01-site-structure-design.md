# Site structure and sitemap proposal

**Date:** 2026-11-01
**Status:** draft for Yoram's review; no UI implemented
**Product rules:** [memorial specification](2026-11-01-family-memorial-design.md)

## Intent and approach

Help public visitors discover Yaki's story and public archive material, while
family members preserve and edit the same collection privately. Keep one
archive and one item identity, with supported playback and clear source links.
All navigation labels here are English engineering labels; Hebrew labels need
approval and are not invented here.

Yoram chose a unified archive with type filters over separate photo/video/audio/
article sections. Separate sections would duplicate navigation and fragment
mixed-media items. A generic configurable CMS would add complexity before a
need exists. The proposed first version therefore uses a small fixed set of
page types with editable content, stable IDs and configurable domain settings.
The unified approach is accepted; route names and page compositions below are
engineering proposals for review.

## Sitemap

| Page / proposed route | Purpose | Public visitor | Active verified family member |
|---|---|---|---|
| Home `/` | Introduce Yaki and offer curated entry points | Public content only | Same public view; family workspace link |
| About Yaki `/about` | Approved biography and supporting material | Public content only | Family editing entry point |
| Achievements and prizes `/achievements` | Recognition across the years, connected to evidence | Public entries/relationships only | Public and private entries with clear visibility |
| Archive `/archive` | Search/filter one collection | Public items only | Public/private items, with visibility filter |
| Item `/archive/[id]` | Read/view/play an item and follow its sources | Public item/representations only | Any non-archived private/public item |
| Sign in `/sign-in` | Verify email for existing membership | Generic request result | Sign out or continue to workspace |
| Verification `/verify` | Complete selected email flow | No private content | Session issued only after valid membership/verification |
| Family workspace `/family` | Add and manage shared content | Sign-in required | Shared collection actions, visibility and processing states |
| Add item `/family/items/new` | Create private item from files or links | Denied | Add item; no automatic publication |
| Edit item `/family/items/[id]/edit` | Edit any item's metadata, sources and delivery | Denied | Shared editing, conflict handling and lifecycle actions |
| Archived items `/family/archived` | Find and recover archived items | Denied | Restore any item as private |
| User management `/admin/members` | Add/revoke membership | Denied | Yoram only |

The archive/item routes are shared, but server queries select fields and media
for the current audience. A signed-in response must never enter a shared public
cache. Sign-in and verification are utility routes, not main navigation sections.
Achievement creation/editing and homepage/biography editing need family controls;
propose reusing the same editor conventions rather than adding another CMS.
Exact editor routes can follow schema design.

## Page responsibilities

### Home

Proposed order: approved name/portrait and introduction; links to About,
Achievements and Archive; a small curated selection of public archive items.
No invented biography, life dates, counters, quotations or random private picks.
If no material is public yet, show an honest approved empty state. Sign-in is
available but does not block public browsing. Exact selection and imagery need
Yoram's input during visual design.

### About Yaki

Approved biography in readable sections, optionally referencing public archive
items and achievements. Unknown facts are omitted or explicitly uncertain.
Related private records never reveal titles, images or snippets to public readers.
Timeline is not a separate first-release section; verified dates may appear here
or in the archive. A standalone timeline can be added later if justified.

### Achievements and prizes

A dedicated recognition list with date evidence, approved name, awarding body
when known, short description and supporting sources/items. Propose chronological
ordering for known dates and a clearly labelled group for undated entries. Never
invent an order from filenames or article publication dates. Reuse archive media
and sources rather than uploading another copy. Family users can manage private
entries; public rendering filters each relationship independently.

### Archive

One search box and proposed filters for media type, period and tags, plus public/
private visibility for family users. Mixed-media entries can match multiple type
filters. Public counts, suggestions and result snippets exclude private records.
Family results show clear visibility labels. No separate galleries or media-type
navigation sections. Search implementation can start in PostgreSQL; no external
search service is selected. Exact fields and Hebrew matching need synthetic tests.

### Item

Approved title/description, dates with precision, accessible media, source
attribution and related items. Support several files/links on one record.
External audio/video uses supported embedded players; hosted files use safe
playback representations. Always identify the original source where applicable.
Articles can use a link card initially; approved excerpts or hosted copies are
separate representation choices. Missing/blocked embeds show a clear failure
state and source link, never a fabricated preview. Private notes/rights review
and technical provenance are not automatically public fields.

### Family workspace and editor

Propose shared content navigation, add-item action, visibility/processing filters,
and an archived-items link. Avoid a dashboard of speculative statistics. New items
start private. Uploads stay quarantined until validated; failed processing is
visible and retryable without publishing broken media.

The editor manages metadata, source links and safe representations; it exposes
publish, return-to-private, archive and restore according to item state. Yoram
alone sees permanent deletion and user management, with server enforcement.
Visibility actions clearly say what becomes public. Conflict review keeps unsaved
input and current server content available before a deliberate retry.

**Approved editorial behavior:** editing a public item saves a private working
revision while its existing public revision stays visible. Publication is an
explicit action. Public reads and playback use the published revision's fields,
sources and media; draft replacements remain private until publication.

### Archived items and user management

All family members can inspect recovery entries and restore them privately;
archived media reads require family access and safe representations. Permanent
deletion is Yoram-only and remains disabled until retention/cleanup rules exist.
User management is separate from shared editorial controls. Member emails and
access records never appear in public pages or general archive exports.

## Navigation and adaptability

Propose main navigation: Home, About Yaki, Achievements and prizes, Archive.
A utility area provides Sign in, or Family workspace and Sign out. Yoram also
has User management. Mobile navigation preserves RTL order, keyboard focus and
readable labels. Exact typography, palette and component layout are not chosen.

Use relative links, stable item IDs and validated canonical-origin settings.
Changing domain must not rewrite archive records or storage keys. External source
URLs remain their own references rather than being transformed into site URLs.
Preserve imported KOB identifiers. Future sections can reuse items and sources
without a plugin framework, extra service or duplicate catalog.

## Review still needed

- Page composition and navigation labels are proposed, not approved visual design.
- Choose email code versus confirmation link; select compatible auth integration.
- Identify actual external player providers and their privacy/fallback behavior.
- Supply approved content/visual references before final Hebrew copy and layouts.

No new services, infrastructure, imports, domain changes or deployment are part
of this design document.
