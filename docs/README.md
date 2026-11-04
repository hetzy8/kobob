# Documentation

All documents are English. The website itself will be Hebrew RTL.

| Document | Purpose | Status |
|---|---|---|
| [AGENTS.md](../AGENTS.md) | Contributor invariants and workflow | Applies now |
| [Session handoff](SESSION-HANDOFF.md) | Restart context, verified PR/head, preview state and next work | Read when resuming; recheck external state |
| [Roadmap](ROADMAP.md) | The full picture: phases from item editing to discovery, the book and the film | Direction; phase 1 released (v0.3.0) |
| [Product spec](superpowers/specs/2026-11-01-family-memorial-design.md) | Agreed rules, proposals, access and acceptance criteria | Consolidated; open decisions explicit |
| [Page structure and sitemap](superpowers/specs/2026-11-01-site-structure-design.md) | Navigation, page responsibilities and family workflows | Draft for Yoram's review |
| [Development](DEVELOPMENT.md) | Implemented local scope, setup, test isolation and limitations | Foundation, membership administration, sign-in email and item editing in production (v0.3.0) |
| [Architecture](ARCHITECTURE.md) | Existing-project inspection and stack | Hosting direction accepted; details proposed |
| [Hosting](HOSTING.md) | Provider direction, storage evidence and cost gates | Vercel, Neon and Resend provisioned; R2 not yet |
| [Data migration](DATA-MIGRATION.md) | Data locations, preservation, import and cutover | Planned; no data moved |
| [Implementation plan](superpowers/plans/2026-11-01-family-memorial.md) | Ordered implementation tasks and verification | Initial foundation in progress; later slices not started |
| [Resend email design](superpowers/specs/2026-11-02-resend-email-design.md) | Sign-in email delivery through Resend | Implemented, v0.2.0 |
| [Resend email plan](superpowers/plans/2026-11-02-resend-email.md) | Tasks for the Resend slice | All steps done |
| [Public navigation and search design](superpowers/specs/2026-11-05-public-navigation-search-design.md) | Tabs, family-only Archive, public search and item pages | Approved; implemented on `feat/public-search` |
| [Public navigation and search plan](superpowers/plans/2026-11-05-public-navigation-search.md) | Tasks for phase 2 slice 1 | All steps done |
| [Operations](OPERATIONS.md) | Secrets, costs, backups, releases, domain and launch gates | In production; release records, Resend lessons, kobob.org plan |

## Source of truth

Explicit instructions from Yoram take precedence. AGENTS.md governs working
conventions; the spec governs approved product behavior; ARCHITECTURE.md
records technical decisions; the plan translates them into work. If they
conflict, reconcile them rather than silently selecting one. Keep statuses
honest: a proposal or unchecked task is not implemented functionality.

## Reference material inspected

- `hetzy8/ops` main at `3c35d909b9b35672c60c95ffa8f03ac591530ab3`:
  README.md, AGENTS.md/CLAUDE.md, docs/INCIDENTS.md, and the production-version
  and secrets-source designs and production-version implementation plan.
- Sana local snapshot `b48bf6ff5f9a150ef70b76d88bd6ff776537f3cd`:
  README.md, AGENTS.md, package.json, and its Vercel deployment convention.
- Passus local snapshot `1fcbd5aef3880db868a62e86535fc184fc33a212`:
  README.md, railway.json, and its existing email-sign-in/session behavior
  inspected during prior repository reviews. These are inspected local
  snapshots, not assertions about the latest deployed versions.

Ops' transferable rules are documented in AGENTS.md and OPERATIONS.md. Its
monitor-only zero-dependency rule and project-specific budgets, tier labels,
workflow names, and domains are not copied as kobob facts.

## Next review

Yoram authorized development and resumed building after merging the consolidated
plan. See DEVELOPMENT.md for the implemented local foundation and outstanding
scope. Public-item edits remain private until explicit publication. Page shells
are not final visual design or a populated archive. Provider, numeric budget,
retention, import and launch gates remain separate; raw private source evidence
stays outside GitHub.
