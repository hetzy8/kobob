# Kobob — Yaki Hetz family memorial

A Hebrew, right-to-left family memorial for Yaki Hetz, intended for
**kobobhetz.org**. Access requires verified email and membership managed by
Yoram. Repository documentation, code, comments, commits, issues, and pull
requests are written in English; the website's approved interface and memorial
content will be Hebrew.

**Status: documentation only.** No application, dependencies, database,
authentication, hosting, DNS changes, or production release exist in this
repository. The domain is a target, not evidence of a running deployment.

## Start here

1. [Agent and contributor conventions](AGENTS.md).
2. [Documentation index](docs/README.md).
3. [Product specification](docs/superpowers/specs/2026-11-01-family-memorial-design.md).
4. [Architecture and stack decision](docs/ARCHITECTURE.md).
5. [Implementation plan](docs/superpowers/plans/2026-11-01-family-memorial.md).
6. [Operations and launch requirements](docs/OPERATIONS.md).

## Product boundary

- Remember Yaki through family-approved text and a searchable multimedia archive.
- Make Hebrew reading, navigation, and mixed Hebrew/English text work well on
  phones and larger screens.
- Verify control of an email address **and** check Yoram's active member list;
  a verified email alone never grants access.
- Give Yoram control over access and publication.
- Keep private family information out of this public GitHub repository.

The initial proposal protects all memorial content behind sign-in. A public
introduction and member contributions remain decisions for Yoram; neither is
silently included as an approved requirement.

## Accepted hosting direction

A Next.js App Router application on Vercel, Neon PostgreSQL for catalog and
users, private Cloudflare R2 for media, and Resend for email verification.
This follows Sana's existing approach. Provider plans, budget and exact
compatible versions remain to be verified; nothing has been provisioned.
Code versus link authentication remains open.

All 1,374 catalog records are planned for private administration; family
viewers see only Yoram-approved items. After launch the website manages the
archive and users. Drive remains a preserved migration source. See the
[data migration plan](docs/DATA-MIGRATION.md) and
[hosting decision](docs/HOSTING.md).

## Working here

This initialization is the repository's first commit on `main`, containing
documentation only. Subsequent work uses a focused branch and a pull request
to `main`. A docs merge does not authorize implementation or a production
deployment. There are no setup commands or application tests to run yet.

Conventions are adapted from [hetzy8/ops](https://github.com/hetzy8/ops): context
in the repository, explicit invariants, dated specs and plans, meaningful
verification, cost discipline, centralized secrets, and tagged production
releases. Ops' zero-dependency monitor architecture is specific to ops and is
not a requirement to build the memorial without application dependencies.
