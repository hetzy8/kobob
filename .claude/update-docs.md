# update-docs profile — Kobob

Read by the shared `hetzy8-eng:update-docs` skill (hetzy8/claude-skills). The method lives there;
this file holds only what is specific to Kobob. Keep it true: a stale line here is a finding.

## Documents in scope

| File | Purpose |
|---|---|
| `AGENTS.md` | Contributor/agent conventions and product invariants (source; `CLAUDE.md` only points to it) |
| `README.md` | Human entry point: purpose, scope, hosting, working here |
| `docs/README.md` | Documentation map with a status column per document |
| `docs/SESSION-HANDOFF.md` | Restart context: verified PR/head, preview state, next work |
| `docs/ROADMAP.md` | The full picture and phases; status column per phase |
| `docs/DEVELOPMENT.md` | Implemented scope, local setup, exact verification commands and results |
| `docs/ARCHITECTURE.md` | Stack and structure |
| `docs/HOSTING.md` | Provider direction, cost evidence, provisioning gates |
| `docs/OPERATIONS.md` | Secrets, branch/release flow, backups, launch checklist |
| `docs/DATA-MIGRATION.md` | Source preservation, import and cutover plan |
| `docs/reviews/*.md` | Dated review records (panel reviews); append-only, decisions recorded with their reason |
| `.env.example` | Every setting the code reads, empty placeholders only |

**Append-only records — tick or add dated notes, never rewrite:**
`docs/superpowers/specs/**` and `docs/superpowers/plans/**` (plans: tick steps).

## Drift checks per document

- **`docs/DEVELOPMENT.md`** — implemented-scope list matches `src/app/**` routes and
  `prisma/schema.prisma`; commands match `package.json` scripts; dependency versions
  match `package.json`.
- **`docs/SESSION-HANDOFF.md`** — branch, open PRs and last verified commit match
  `gh pr list` / `git log`; it must not describe a merged PR as open.
- **`docs/README.md`** — every listed file exists; status column matches each doc's own status line.
- **`docs/OPERATIONS.md` / `docs/HOSTING.md`** — "nothing provisioned" statements stay
  true until resources actually exist; record provisioning with date and evidence.
- **`.env.example`** — matches every `env.X` / `process.env.X` read in `src/` and `scripts/`.

## Project rules

- Keep statuses distinct: requirement, proposal, open decision, implemented. A proposal
  or unchecked task is never described as implemented.
- Never write or change Hebrew user-facing copy or family facts; approved strings live in
  `src/locales/he.ts`. Flag gaps for Yoram.
- All docs are in English. The repo is public: no real names beyond approved content,
  emails, URLs of private sources or secrets.
- Docs change in the same PR as the behaviour they describe.
