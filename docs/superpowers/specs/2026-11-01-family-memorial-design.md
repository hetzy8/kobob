# Yaki Hetz family memorial — product specification

**Date:** 2026-11-01
**Repository:** hetzy8/kobob
**Status:** draft for Yoram's review; documentation only; implementation not authorized
**Intended domain:** kobobhetz.org (ownership, DNS and deployment not verified)

## 1. Intent

Give the family a respectful, lasting place to remember Yaki Hetz, read his
story, and revisit approved photographs and memories. The experience should
feel like a family archive, work comfortably in Hebrew on a phone, and remain
straightforward for Yoram to maintain.

The private Drive project brief and catalog have been inspected. Source
material is evidence for review, not permission to publish or fill gaps with
invented memories. Preserve original Hebrew metadata and uncertainty.

## 2. Confirmed requirements and proposed scope

Confirmed by Yoram's request:

- A family memorial for Yaki Hetz at `kobobhetz.org`.
- A Hebrew, right-to-left website.
- Verified email access; users managed by Yoram.
- Existing projects inspected before selecting a stack.
- Import all 1,374 catalog records into private administration; family viewers
  see only items explicitly approved by Yoram. Importing is not publication.
- After launch, manage catalog, media, editorial decisions and users through
  the website. Drive is the preserved migration source, not a second live CMS.
- Hosting direction accepted: Vercel, with Neon PostgreSQL, private Cloudflare
  R2 storage and Resend. Account plans, budget and provisioning remain open.
- English-only GitHub work, with repository conventions, README, docs, spec
  and implementation plan established before code.

Proposed defaults, subject to review:

- All memorial content is private. Anonymous visitors see a minimal Hebrew
  sign-in page without family media, biography, member identities, or excerpts.
- Yoram is the initial administrator and publisher. Approved members can read;
  they cannot publish, upload, invite, or manage other members in the first
  version. Contribution/moderation is a later choice, not an assumed feature.
- The archive supports photos, video, audio, documents, illustrations and
  articles, with Hebrew search and filters by type, period and tags. Source
  formats may need safe browser-friendly derivatives before publication.
- Home and biography use curated approved content. Timeline entries require
  verified event dates; publication dates and filename years are not substitutes.
- Comments, family contributions, public search, face recognition, AI-generated
  content and native apps are not included without a separate decision.

The accepted hosting direction and alternatives are recorded in
[ARCHITECTURE.md](../../ARCHITECTURE.md). This accepts a planning direction,
not implementation, a paid subscription, or a production migration.

## 3. Access and roles

| Actor | Permitted behavior |
|---|---|
| Anonymous visitor | Request sign-in and consume a valid emailed link; no memorial reads |
| Active verified member | Read published memorial content and approved private media; sign out |
| Yoram / active administrator | Member management, publication, content/media administration, audit access |
| Invited but unverified, revoked, or suspended member | No protected content, even with an old session/link |

Membership is an explicit allowlist, not a signup application. Email
verification alone never creates membership. Another administrator may only be
added by an explicit future owner decision; there is no self-promotion.

### Email sign-in proposal

Code versus link remains open; the following is the proposed link approach.
If codes are selected, revise the flow and tests before implementation.

1. Yoram adds an email to the member list. Addresses are trimmed and consistently
   case-normalized; provider-specific dots or plus aliases are not collapsed.
2. The visitor requests a sign-in link. The response does not disclose whether
   the address is a member. Only an active invited member receives a link.
3. A maintained auth library issues a random, single-use token, stored hashed,
   tied to the member and its current access version, expiring in **15 minutes**.
4. Link opening leads to a confirmation step; only the explicit confirmation
   consumes it, so email scanners/prefetch do not silently use it up. Consumption
   is atomic. Reject expired, reused, revoked, or email-mismatched tokens.
5. On successful confirmation, mark the email verified and issue a server-side
   revocable session. Proposed maximum session lifetime is **7 days**. Session
   cookies are HttpOnly, Secure in production, and SameSite appropriate to the
   flow. Redirect targets are restricted to local approved paths.
6. Every private operation checks that the session and member are still active.
   Successful sign-out revokes that session and clears the browser cookie.
   If the network fails, hide private UI on that device, show a retry state,
   and do not claim the server session or HttpOnly cookie has been revoked. A revoked member's existing session must fail on
   its next request; re-inviting does not revive old links or sessions.

Token/session durations are engineering proposals, not family preferences.
Before production, set configurable per-address and per-IP issuance throttles
and a delivery budget; they must work across server instances. Do not log link
tokens, sign-in URLs, mailbox codes, request credentials or real member lists.
Auth callback pages load no third-party resources and use a no-referrer policy.
Email delivery failure never creates an authenticated session.

Yoram's actual admin email is not known. Bootstrap is an operator action after
that address is supplied and verified; no seeded public credentials and no
automatic administrator on an empty database. Admin email changes require
fresh verification and revoke prior sessions/links. Protect the last active
administrator from accidental removal.

## 4. Memorial experience and editorial workflow

- Global `lang="he"` and `dir="rtl"`; use logical spacing/alignment properties.
  Email fields, URLs, codes and dates use directional isolation where needed.
- Mobile-first reading, comfortable typography, visible focus, semantic
  headings, keyboard navigation, labelled forms, sufficient contrast, alt text,
  and reduced-motion support. Aim for WCAG 2.2 AA and verify the actual flows.
- Home: approved name/portrait, a short introduction and clear navigation.
  Biography and memories are factual/editorial content supplied by the family.
- Archive: searchable approved items with captions, provenance, date precision,
  rights and relationships; admin search also covers unpublished records.
- Gallery: ordered photos with approved captions and alt text; no public
  object links. Strip location/EXIF metadata from delivery copies. Preserve
  originals privately only under an agreed retention policy.
- Yoram can save drafts and publish/unpublish. A member sees published content
  only; unpublished content and media are not reachable by guessing IDs or URLs.
- Show honest empty, loading, denied, expired-link and delivery-error states.
  Do not use invented biography or real-looking family placeholder identities.
- Keep editorial audit records of who published/unpublished, changed access,
  or removed media. Logs contain IDs and actions, not sensitive content bodies.
- Archived/unpublished media is inaccessible to readers. Permanent deletion
  and backup retention require a documented policy; avoid irreversible deletion
  as the only editorial control.

Hebrew wording, Yaki's exact Hebrew name, dates, images, chronology, visual
tone, and permissions require family approval. No Hebrew text is invented in
this documentation bootstrap.

## 5. Proposed data and service boundaries

| Concept | Essential fields / rules |
|---|---|
| Member | Stable ID, normalized unique email, role, status, verified timestamp, access version; no public directory |
| Verification token | Library-compatible hashed token, member/access version, expiry, atomic single-use state |
| Session | Member ID, revocable session identity, expiry and access version; use the library's supported format |
| Memorial page / memory | Stable ID/slug, Hebrew title/body, draft/published state, ordered position, editor timestamps |
| Media asset | Private object key, type/size, caption/alt text, publication association, processing state; no public URL |
| Audit event | Actor ID, action, target ID, UTC timestamp, minimal non-secret metadata |

These are logical models, not a frozen Prisma schema. Validate auth-library
compatibility before final schema design. Do not duplicate session or token
tables just to match these names.

All private access goes through server services. Route handlers or Server
Actions are thin validated adapters. Every member lookup, content write,
media read and admin action checks permissions at its own server boundary.
Use transactions for membership changes, token consumption and publication
updates where consistency matters. Never trust a client-supplied role or email
as proof of identity.

## 6. Privacy and operational requirements

- A public code repository is not the archive. Real content, assets, member
  data and exports belong only in approved private storage.
- App authorization covers the domain, previews, deployment aliases, metadata,
  thumbnails and errors. `robots.txt` and `noindex` are additional guidance,
  not access control. Public social cards contain no private portrait/excerpt.
- Private pages and media must not enter shared caches or public image/CDN
  storage. No analytics, tracking pixels or third-party embeds in the first
  release without a separate decision.
- Validate uploads by actual format and size. Preserve legacy originals in
  private quarantine; never render active or unvalidated formats directly.
  JPEG/PNG/WebP are proposed image display formats, not an import restriction.
  Define format-specific limits and safe PDF/document/audio/video delivery
  before implementation; unsupported items remain private with explicit status.
- Back up the database and private originals, encrypt backups, test restoration
  into an isolated environment, and preserve content order and access controls.
  Proposed recovery targets: **RPO 24 hours, RTO 1 working day**. Retention and
  provider costs must be agreed before collecting real family material.
- Minimal health checks expose no identities/content. Ops integration and
  budget registration are later changes, never claimed as configured now.

See [OPERATIONS.md](../../OPERATIONS.md) for launch gates and ownership.

## 7. Acceptance criteria

1. Anonymous requests to memorial pages, actions, media, metadata endpoints and
   alternate hosts reveal no private content.
2. An uninvited but mailbox-verified person cannot enter. Active invited members
   can enter only after verification; replayed/expired links fail.
3. Revocation blocks the next protected request and outstanding links. Changing
   an email cannot preserve access through the previous address.
4. Members cannot read drafts, mutate content, enumerate users, or elevate roles
   by direct endpoint calls. Yoram can manage users and publish approved content.
5. Hebrew reading, mixed-direction fields, keyboard navigation and touch flows
   work at narrow mobile widths and on desktop without horizontal overflow.
6. A photo cannot be retrieved anonymously by its object key or transformation
   URL. Unpublishing blocks member access to the asset on the next request.
7. Delivery failures, offline logout, expired links, empty galleries and unknown
   content IDs have clear Hebrew states and no sensitive diagnostic output.
8. A database/media restore drill succeeds before real launch; the deployed SHA,
   release tag, costs and operator recovery steps are recorded.

## 8. Decisions for Yoram before implementation

- Confirm fully private content versus a deliberately public introduction.
- Approve or adjust the proposed first-release sections and read-only member
  role; decide whether family contributions are needed now.
- Supply the exact Hebrew name, approved facts/content, rights/consents, and
  desired visual references. No biography or life dates are assumed.
- Supply the initial verified admin email and recovery contact/process; do not
  put the real member list in GitHub.
- Confirm provider account plans, a recurring budget, media processing, backup
  retention, and recovery targets. Confirm domain control and sender authority.

This specification records a coherent proposal for review. None of those
unanswered items authorizes code, content publication, provisioning or launch.

## 9. Archive migration and authority

See [DATA-MIGRATION.md](../../DATA-MIGRATION.md) for the phased transition.
Preserve KOB identifiers, original filenames, source references, contributors,
creator/rights, date evidence and precision, review coverage, Yoram's notes,
appearance confirmations, SHA-256 values and duplicate groups. Appearance
confirmation and publication approval are separate fields. Never infer identity
from faces or treat discovery of an external source as publication permission.

Logical models also include ArchiveItem, Source, EditorialReview, MediaVariant
and ImportRun. Original and derivative objects have separate keys, hashes,
processing states and relationships. Import all records as non-public; preserve
source statuses without automatically promoting them to publication approval.

Additional acceptance criteria: rerunning an import creates no duplicate KOB
records and does not overwrite subsequent website edits; failed transfers remain
visible to the administrator and cannot publish. Hebrew search and filters
return only approved records to viewers. Counts and file hashes reconcile
before cutover; restoration preserves editorial decisions and access rules.
