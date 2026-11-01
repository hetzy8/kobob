# Kobob — Yaki Hetz family memorial

A public Hebrew RTL family memorial for Yaki Hetz, initially intended for
**kobobhetz.org**. Public visitors see only explicitly public content. Family
access requires verified email and active membership managed by Yoram.
The domain may change; keep site URLs configurable and item identities stable.
GitHub work is English; approved product content and interface copy will be Hebrew.

**Status: development authorized; Task 0 and page-design review in progress.**
The repository contains documentation only: no application, dependencies,
services, data import or production release. Yoram authorized development on
2026-11-01. Design/compatibility gates remain; provisioning and launch are separate.

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
  A dedicated Achievements and prizes section links recognition to evidence.
- Video/audio plays within item pages using supported external embeds or hosted
  media. Articles keep flexible representations, including source links.
- Preserve provenance and rights; never invent family facts or permission.
  Private content, member data and originals never enter this public repository.

The [sitemap proposal](docs/superpowers/specs/2026-11-01-site-structure-design.md)
sets out Home, About Yaki, Achievements and prizes, Archive and item pages, plus
the family workspace, recovery and Yoram-only user management. Page composition,
visual direction and sign-in remain under review. Edits to public items stay
private working revisions until explicit publication; existing public content
remains visible meanwhile.

## Hosting, costs and migration

Accepted direction: a small Next.js App Router monolith on Vercel, Neon
PostgreSQL, private Cloudflare R2 and Resend. Exact compatible versions, auth
library and email code versus link remain open. Nothing has been provisioned.
Aim for low monthly recurring cost with focused dependencies and bounded CI;
account capacity, numeric cap and actual costs remain to verify. Yoram requests
daily ops tracking; actual coverage has not been verified here.

All 1,374 catalog records are planned for private import. After cutover the
website manages the archive and users; Drive remains a preserved migration
source. See [migration](docs/DATA-MIGRATION.md), [hosting](docs/HOSTING.md) and
[operations](docs/OPERATIONS.md) for evidence and gates.

## Working here

The first commit established documentation on main. Subsequent work uses a
focused branch and a PR into main. A documentation merge is not a production
release. There are no application setup commands or tests yet. Current work
consolidates agreed requirements and drafts page design for review.

Conventions adapt [hetzy8/ops](https://github.com/hetzy8/ops): repository context,
explicit invariants, dated specs/plans, verified results, cost discipline,
centralized secrets and tagged production releases. Its monitor-specific
zero-dependency architecture is not a requirement for this application.
