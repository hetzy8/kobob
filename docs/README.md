# Documentation

All documents are English. The website itself will be Hebrew RTL.

| Document | Purpose | Status |
|---|---|---|
| [AGENTS.md](../AGENTS.md) | Contributor invariants and workflow | Applies now |
| [Session handoff](SESSION-HANDOFF.md) | Restart context, verified PR/head, preview state and next work | Read when resuming; recheck external state |
| [Product spec](superpowers/specs/2026-11-01-family-memorial-design.md) | Agreed rules, proposals, access and acceptance criteria | Consolidated; open decisions explicit |
| [Page structure and sitemap](superpowers/specs/2026-11-01-site-structure-design.md) | Navigation, page responsibilities and family workflows | Draft for Yoram's review |
| [Development](DEVELOPMENT.md) | Implemented local scope, setup, test isolation and limitations | Foundation implemented; no deployment |
| [Architecture](ARCHITECTURE.md) | Existing-project inspection and stack | Hosting direction accepted; details proposed |
| [Hosting](HOSTING.md) | Provider direction, storage evidence and cost gates | Accepted direction; nothing provisioned |
| [Data migration](DATA-MIGRATION.md) | Data locations, preservation, import and cutover | Planned; no data moved |
| [Implementation plan](superpowers/plans/2026-11-01-family-memorial.md) | Ordered implementation tasks and verification | Initial foundation in progress; later slices not started |
| [Operations](OPERATIONS.md) | Secrets, costs, backups, releases, domain and launch gates | Planned; nothing provisioned |

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
