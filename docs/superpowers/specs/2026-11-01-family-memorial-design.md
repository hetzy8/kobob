# Yaki Hetz family memorial — product specification

**Date:** 2026-11-01
**Repository:** hetzy8/kobob
**Status:** development authorized; agreed rules consolidated; page design and remaining engineering choices under review; no application code yet
**Initial intended domain:** kobobhetz.org; ownership, DNS and deployment unverified

## 1. Intent and evidence

A public Hebrew RTL memorial for Yaki Hetz, with a private family workspace
for preserving, describing and publishing an archive. It must work well on
phones and stay straightforward to maintain at low recurring cost. All content
begins private; a public website does not publish the source collection.

The private Drive brief and catalog informed the scope. Their raw contents,
private identifiers, member addresses and media do not belong in this public
repository. Preserve original Hebrew metadata, provenance and uncertainty.
Never invent facts, names, dates, relationships, descriptions or permission.

This document replaces the earlier fully private site and read-only member
proposal. Confirmed rules are requirements; proposed defaults and open decisions
remain separate from approved scope and implemented behavior.

## 2. Confirmed decisions

- Public visitors can read only explicitly public content.
- Verified email and active membership are both required for family access.
  Yoram manages membership; verification alone never grants membership.
- Every active verified family member can browse every private item, add items,
  edit everyone's items, publish any item and return any item to private.
- Members can archive any item recoverably and restore any archived item.
  Restoration always returns it to private; publication is a separate action.
- Only Yoram can permanently delete items or manage users.
- Concurrent editing must not silently overwrite work: stale saves require
  review and preserve the second editor's unsaved input.
- One unified searchable archive uses media-type filters rather than separate
  photo, audio, video, article and memory sections. Mixed-media items retain
  one identity with multiple sources or delivery representations.
- A dedicated **Achievements and prizes** section covers recognition across
  the years and links to supporting archive items and external sources.
- Much material lives on other websites. External-source entries are first-class
  archive items; links do not imply permission to copy content.
- Video and audio play inside item pages using supported external players or
  hosted playback. Keep attribution and original-source links, with honest
  unavailable/unsupported states and a source-link fallback.
- Article presentation stays flexible: link-only entries are supported;
  excerpts, hosted copies or embedded reading require review of capabilities
  and permission. No automatic scraping or copying is approved.
- Import all 1,374 catalog records privately, preserving source information.
  Importing and appearance confirmation never imply publication approval.
- After launch the website manages content, media and users. Drive remains a
  preserved migration source, not a second editable production catalog.
- Keep a small monolith, focused dependencies, bounded CI and low recurring cost.
  Vercel, Neon PostgreSQL, private R2 and Resend are the accepted direction.
  Plans, capacity and numeric budget remain unconfirmed; nothing is provisioned.
- Ops is familiar with the project per Yoram; daily tracking is requested.
  Actual registration and reporting coverage have not been verified here.

Comments, face recognition, AI-generated content and native apps are outside
the first release unless separately requested. Shared family editing does not
introduce public contributions or public signup.

## 3. Access and editorial rules

| Capability | Public visitor, including revoked/unverified users | Active verified family member | Yoram / active administrator |
|---|---|---|---|
| Read public items and approved delivery media | Yes | Yes | Yes |
| Read private items and protected media | No | Yes, all items | Yes |
| Add/edit any item; publish or return to private | No | Yes | Yes |
| Archive/restore any item | No | Yes; restore as private | Yes; restore as private |
| Manage membership or permanently delete | No | No | Yes |

Revocation removes family privileges on the next protected request; it does
not prevent reading deliberately public content. No public member directory,
public signup, domain-based membership or automatic first-user administrator.

Every protected read and mutation checks a current server-side session,
verified identity and active membership. User management and permanent deletion
add an administrator role check. Route/layout visibility is not authorization.

| Action | Required result |
|---|---|
| Add/import | Private item; no automatic publication |
| Publish | Deliberate action; only safe, rights-reviewed representations become public |
| Return to private | Next public request denied for item, controlled media, metadata and previews |
| Archive | Remove from normal browsing and public delivery; keep recoverable record |
| Restore | Return to private regardless of former visibility |
| Permanently delete | Yoram only; retention/object cleanup defined before enabling |

Archived records need a family recovery view. Originals stay private. Neither
unpublishing nor deletion recalls downloaded copies or deletes an external
publisher's source. Permanent deletion cannot promise immediate removal from
retained backups.

Saves and lifecycle actions check the current revision atomically. A stale
request fails visibly, preserves unsaved input and requires review; it must
not reverse a newer publication, archiving or restoration decision. Audit events
record actor, target, action and time without sensitive content bodies.

**Approved by Yoram:** edits to a public item create a private working revision;
the existing public revision stays visible until explicit publication. Public
queries and media/source associations must use that published revision, never
unpublished edits. Restoring or returning to private must not resurrect an older
public revision. A full version-history browser is not assumed.

## 4. Site structure and experience

See [page structure and sitemap](2026-11-01-site-structure-design.md) for
proposed navigation and page responsibilities. The unified archive and dedicated
achievements section are accepted; detailed layouts, route names, homepage
selection and visual direction remain proposals.

Use root `lang="he"` and `dir="rtl"`, logical CSS properties, directional
isolation for emails/URLs/codes, visible focus, semantic headings, labelled forms,
contrast, alt text and reduced-motion support. Aim for WCAG 2.2 AA and verify
actual phone/desktop flows. GitHub engineering work is English; Hebrew copy,
exact name, biography, imagery and achievement facts require family approval.

Search applies visibility before returning results, counts, snippets or
suggestions. Public relationships cannot reveal a linked private item's title,
thumbnail or metadata. Family browsing includes public/private items; archived
items belong in recovery. Unknown dates remain unknown; filenames/publication
dates are not substitutes for event evidence. Show honest empty/error states.

## 5. Logical data and service boundaries

| Concept | Essential fields / boundary |
|---|---|
| Member | Stable ID, unique normalized email, role, status, verified timestamp, access version |
| Verification credential/session | Library-supported hashed credentials, expiry, atomic use, revocation; server-side revocable sessions |
| Archive item | Stable ID/KOB ID, title/description, type/tags, date evidence/precision, visibility, archive state, revision |
| Source | Original reference, publisher/creator/contributor, attribution, rights, availability; separate from delivery |
| Media representation | Item association, original/derivative or external player, private object key, hash, validation/processing state |
| Achievement | Approved name/description, date evidence, awarding body if known, supporting items/sources, editorial state |
| Memorial page | Approved editable content and ordering; page-editing interface still proposed |
| Import run/review | Source version/values, per-record outcomes, conflicts and reconciliation |
| Audit event | Actor/target IDs, action, UTC timestamp, minimal non-secret metadata |

These are logical concepts, not a frozen Prisma schema. Avoid duplicated auth
models or a generic plugin platform. Thin validated route/action adapters call
server services; client input never proves identity or authorization.
Transactions protect membership, token consumption and editorial transitions.

Preserve filenames, KOB IDs, source/folder provenance, original Hebrew values,
rights, contributors, review coverage/notes, appearance confirmations, SHA-256
and duplicate groups. Never merge duplicates automatically or infer identity
from faces. Original and derivative hashes remain separate.

## 6. Authentication proposal and compatibility gate

Code versus link and the maintained auth-library choice remain open.
Auth.js/Prisma and Better Auth are candidates; documentation is not integration
proof. Verify compatible supported versions and pin them. No copied beta version
or custom cryptography by default.

The proposed link flow sends only to active members with a generic public
request result. Random hashed single-use credentials bind to member/access
version with proposed **15-minute** expiry. GET/prefetch does not consume them;
explicit confirmation does. If codes are selected, revise attempt limits,
flow and tests before implementation.

Proposed absolute session lifetime: **7 days**, without indefinite refresh.
Cookies are HttpOnly, Secure in production and appropriately SameSite. No stale
session/cache may extend revoked access. Revocation and verified email changes
invalidate sessions and pending credentials; re-invitation never revives them.

Use durable per-address/IP throttles and a delivery budget. Reject malicious
redirects, expired/replayed credentials and concurrent replay. Callback pages
load no third-party resources and use no-referrer. Never log tokens, mailbox
codes, auth URLs or member lists. Delivery failure issues no session. Successful
logout revokes the session/clears the cookie; offline failure hides private UI
with retry without falsely claiming server revocation.

Bootstrap Yoram explicitly using a privately supplied verified address. Protect
the last active administrator. Recovery is an owner-verified operator procedure,
not a public administrator-creation endpoint.

## 7. Privacy, media, operations and domain flexibility

Private data never enters public Git, `public/`, public storage, shared caches,
public image optimization or offline service-worker caches. Private responses
use `Cache-Control: private, no-store`. All deployment hosts enforce the same
rules. Propose no shared caching for revocable public item responses initially
until invalidation is designed and tested.

Public media reads check current public visibility and permitted representation;
private reads also require membership. R2 originals/derivatives remain in a
private bucket. Public presentation does not expose original keys or permanent
public object URLs. Strip EXIF/location from delivery copies. Public search and
social metadata contain only deliberately public fields, never private notes.

External access rules remain the publisher's. Support selected players rather
than arbitrary iframe HTML. Validate URLs, avoid unrestricted server fetches,
and prevent private metadata/referrers leaking to providers. Provider selection,
privacy controls and failures need representative-source tests. Analytics and
tracking features are not approved; third-party player behavior needs review.

Validate actual formats/sizes; quarantine uploads before finalization. Preserve
legacy originals privately and derive safe browser representations. Failed or
unsupported assets cannot publish. Verify host upload/streaming/range limits
and conversion feasibility before selecting transport/background processing.
No persistent worker or extra managed service is assumed.

`kobobhetz.org` is initial and may change. Use validated server-side canonical
origin, relative navigation and domain-independent item IDs/storage keys.
Never trust request hosts for auth URLs. Explicit trusted origins and local
redirect checks remain mandatory. Document DNS/TLS, canonical URLs, sender,
callbacks/cookies, pending-link and old-domain redirect migration. Invalidate
and reissue when needed; do not promise seamless session continuity.

Proposed recovery: **RPO 24 hours, RTO 1 working day**. Agree retention, backup
destination, budget and regions before provisioning/import. Test isolated
restore including states, media, revisions and revoked-access denial. See
[operations](../../OPERATIONS.md), [hosting](../../HOSTING.md) and
[migration](../../DATA-MIGRATION.md). Paid services, provisioning, real-data
imports, DNS changes and launch remain separately authorized work.

## 8. Acceptance criteria for later implementation

1. Public reads, media, previews, relationships, counts and alternate hosts reveal
   no private/archived content. Explicitly public reads succeed without membership.
2. Uninvited verified people have no family privileges. Active verified members
   read all private items and edit everyone's items.
3. Revocation/email change blocks the next protected request and old credentials;
   expiry/replay fail. Deliberately public reads remain available.
4. Members cannot manage users, elevate roles or permanently delete. Yoram can.
5. New/imported items are private. Lifecycle actions enforce public/private/archive
   states across content/media; restoration is always private.
6. Concurrent saves/transitions reject stale revisions without losing unsaved
   input or silently reversing newer changes.
7. Search, achievements and external players enforce visibility without metadata leaks.
8. Supported embedded/hosted audio/video works; unavailable sources, unsupported
   files, delivery failures and empty pages have honest states.
9. Hebrew RTL, mixed direction, keyboard/touch and narrow widths work. Real content
   replaces synthetic fixtures only when authorized.
10. Imports are idempotent and preserve website edits; counts/hashes reconcile.
    Restore rehearsal preserves privacy and revoked-user denial.
11. Origin changes need no content-ID/internal-link rewrite. Unsafe callback hosts
    fail and pending links have explicit migration handling.
12. Launch records deployed SHA, checks, rollback/restore evidence, actual costs
    and an annotated version tag on the verified deployed main commit.

## 9. Remaining decisions

Before editorial implementation: review page structure, select the sign-in
method, define permanent-deletion/retention behavior and
prove compatible packages/provider integrations. Engineering can choose focused
schema/service details within these boundaries.

Before final visual/content work: approved Hebrew copy/name, biography, imagery,
achievement facts, rights and visual references. Before provisioning/import/launch:
numeric budget, provider capacity/regions, privately supplied admin/recovery
details, retention and sender/domain authority. Repository visibility is separate;
never add private data to the currently public repository.
