# add-diagrams profile — Kobob

Read by the shared `hetzy8-eng:add-diagrams` skill (hetzy8/claude-skills). The method lives there;
this file holds only what is specific to Kobob. Keep it true: a stale line here is a finding.

## Actors

`Visitor` (anonymous), `Member` (active verified family member), `Admin` (Yoram); systems are participants.

## Where to trace

- **Sequence diagrams** — page/server action → `src/services/*` → `requireMember`/`requireAdmin`
  (`src/lib/auth-system.ts`) → Prisma → email delivery (`sendLink`).
- **ER diagrams** — `prisma/schema.prisma`; only the models asked about.
- **State machines** — member status (`MemberStatus`) and role (`MemberRole`) transitions in
  `src/services/members.ts`; item visibility (private/public/archived) once the archive slice lands.

## Where diagrams go

- Access and system-wide flows → `docs/ARCHITECTURE.md`.
- Feature flows → the closest doc under `docs/` (create only if none fits).
- Release/deploy flow → `docs/OPERATIONS.md`.

Diagrams use English labels; never put family names, emails or private content in them.
