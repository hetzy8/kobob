# Kobob — Yaki Hetz family memorial

A public Hebrew RTL family memorial for Yaki Hetz, planned for **kobob.org**
(decided 2026-11-03, replacing kobobhetz.org). Public visitors see only explicitly public content. Family
access requires verified email and active membership managed by Yoram.
The domain may change; keep site URLs configurable and item identities stable.
GitHub work is English; the website interface is Hebrew. Family content still
requires approval.

**Status (2026-11-04): v0.3.0 in production at https://kobob.vercel.app.**
An invitation-only access boundary, member administration (bootstrap,
add/revoke/restore, member email changes), sign-in email through Resend and
item editing (shared editing, publishing, conflict checks and the public
archive pages) are live; Home, About and Achievements are still page shells.
The planned site address is `kobob.org` (not configured yet). Media and import
remain future work ([roadmap](docs/ROADMAP.md)). Interface copy is Hebrew; approved family names and content remain pending. No
real family data has been imported. See [local setup and checks](docs/DEVELOPMENT.md).

## Start here

1. [Contributor conventions](AGENTS.md).
2. [Documentation index](docs/README.md).
3. [Product specification](docs/superpowers/specs/2026-11-01-family-memorial-design.md).
4. [Page structure and sitemap proposal](docs/superpowers/specs/2026-11-01-site-structure-design.md).
5. [Architecture](docs/ARCHITECTURE.md).
6. [Implementation plan](docs/superpowers/plans/2026-11-01-family-memorial.md).
7. [Operations and launch requirements](docs/OPERATIONS.md).

## Agreed product boundary

- Everything starts private; public visitors see only deliberately public items.
- Every active verified family member can browse all private items, add items,
  edit everyone's items, publish, return to private, archive and restore.
- Archiving is recoverable; restoration is private. Only Yoram manages users
  and permanently deletes. Concurrent edits cannot silently overwrite work.
- One searchable archive has media-type filters and stable item identities.
  A dedicated Achievements section links recognition to evidence.
- Video/audio plays within item pages using supported external embeds or hosted
  media. Articles keep flexible representations, including source links.
- Preserve provenance and rights; never invent family facts or permission.
  Private content, member data and originals never enter this public repository.

The [sitemap proposal](docs/superpowers/specs/2026-11-01-site-structure-design.md)
sets out Home, About Yaki, Achievements, Archive and item pages, plus
the family workspace, recovery and Yoram-only user management. Page composition,
visual direction remain under review. Edits to public items stay
private working revisions until explicit publication; existing public content
remains visible meanwhile.

## Hosting, costs and migration

Accepted direction: a small Next.js App Router monolith on Vercel, Neon
PostgreSQL, private Cloudflare R2 and Resend. Compatible versions and the auth
library have been selected for the local foundation; confirmation links are the
initial engineering default. Nothing has been provisioned.
Aim for low monthly recurring cost with focused dependencies and bounded CI;
account capacity, numeric cap and actual costs remain to verify. Yoram requests
daily ops tracking; actual coverage has not been verified here.

All 1,374 catalog records are planned for private import. After cutover the
website manages the archive and users; Drive remains a preserved migration
source. See [migration](docs/DATA-MIGRATION.md), [hosting](docs/HOSTING.md) and
[operations](docs/OPERATIONS.md) for evidence and gates.

## Working here

When resuming a session, read the [handoff](docs/SESSION-HANDOFF.md) alongside
the spec and plan, then recheck Git/PR state before changing files.

`dev` is the integration branch and `main` is production, as in Sana: work
on a focused branch from `dev` with a PR into `dev`. A release is a `dev` →
`main` PR on Yoram's explicit go; merging it deploys to Vercel through the
deploy workflow, followed by an annotated version tag. A merge into `dev` is
not a production release. Local setup and actual verification commands are in
[DEVELOPMENT.md](docs/DEVELOPMENT.md). Production access/content and visual
approval remain separate from the local foundation.

Conventions adapt [hetzy8/ops](https://github.com/hetzy8/ops): repository context,
explicit invariants, dated specs/plans, verified results, cost discipline,
centralized secrets and tagged production releases. Its monitor-specific
zero-dependency architecture is not a requirement for this application.
