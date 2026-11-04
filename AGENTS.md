# Working in hetzy8/kobob

Read this file, README.md, docs/README.md, the current product spec, and its
implementation plan before changing the project. Do not rely on chat history
or machine-local memory for product decisions.

## Purpose and current scope

Kobob is a public Hebrew RTL family memorial for Yaki Hetz, planned for
`kobob.org` (Yoram, 2026-11-03; it replaced `kobobhetz.org`); the domain may change. Visitors see only explicitly public
content. Family access requires verified email and active membership managed
by Yoram. All active verified family members can read private items and edit,
publish, unpublish, archive and restore everyone's items. Restoration is private;
only Yoram manages users or permanently deletes items.

The access foundation, member administration, sign-in email and item editing
are in production (v0.3.0, 2026-11-04; releases follow OPERATIONS.md). Yoram
authorized development on 2026-11-01. See docs/DEVELOPMENT.md for exact implemented scope and
checks; do not confuse page shells with a completed archive. Do not provision
services, import real data, change DNS, send invitations or deploy without the
corresponding explicit instruction. Preserve requirements, proposals, open
decisions and implemented behavior as different statuses.

## Language and family content

- All GitHub work is in English: documentation, code identifiers, comments,
  commit messages, issues, PR titles, descriptions, and reviews.
- The product is Hebrew, with `lang="he"` and `dir="rtl"` planned at its root.
  Approved Hebrew strings belong in future locale/content resources, not as
  an exception allowing Hebrew engineering discussion on GitHub.
- Never invent biographical facts, dates, quotations, Hebrew spelling, family
  relationships, captions, or consent. Ask Yoram for approved material.
- This repository is public. Never commit real member emails, allowlists,
  tokens, private family media, content exports, production data, or secrets.
  Use synthetic fixtures. Copyright and permission to publish remain with
  the family and original rights holders; no content license is assumed.

## Product invariants for later implementation

1. Email verification proves mailbox control, not family membership. Public
   visibility is an explicit content decision, not an authentication bypass.
2. Only Yoram's explicitly authorized administration grants or removes access.
   No public signup, domain-based membership, or automatic first-user admin.
3. Every protected read and mutation checks a current server-side session and
   active membership. Every administrative mutation additionally checks role.
   Hiding a button or guarding a layout is insufficient.
4. Private media, thumbnails, metadata, previews, and alternate deployment
   URLs must obey the same access boundary. Private content never goes in
   `public/`, public Git storage, or shared caches.
5. Revocation invalidates sessions and pending sign-in links. Already downloaded
   copies cannot be recalled; do not promise that they can.
6. Missing data and failed operations are reported honestly. No invented
   success, fabricated family content, or claim that a backup is restorable
   without a tested restore.
7. New/imported/restored items are private. Public reads check current visibility;
   private reads and all family mutations require active verified membership.
   Concurrent edits/transitions check revisions atomically and preserve unsaved input.
8. Public delivery, external embeds and domain changes must not expose private
   metadata or originals. An external source retains its publisher's access rules;
   unpublishing cannot recall downloaded copies or remove an external source.

## Development and documentation

- Branch flow (adopted 2026-11-01, as in hetzy8/sana): `dev` is the
  integration branch and `main` is production. Fetch current refs, inspect the
  worktree, branch from `origin/dev`, and open a PR into `dev`
  (`gh pr create --base dev`; the default branch is still `main`, so the base
  must be explicit). Never push to `dev` or `main` directly, and never PR a
  feature into `main`: a merge to `main` deploys production. Never overwrite
  another contributor's work.
- A release is a `dev` → `main` PR opened only on Yoram's explicit go. Merging
  it triggers `.github/workflows/vercel-deploy.yml` (Vercel Git auto-deploy is
  off in `vercel.json`); after its smoke gate passes, tag the deployed `main`
  commit (see Secrets, costs, and operations), then `dev` is deleted and
  recreated from that commit and open PRs are retargeted to it. Agents cannot
  push to `dev`/`main` (hetzy8-eng command guard); Yoram runs those pushes.
  See docs/OPERATIONS.md → Branch and release flow.
- Reviews (owner rule 2026-11-02, every hetzy8 project): never request a
  Copilot review; Copilot is off because AI-credit spend is capped at $0. Yoram
  runs one Codex review per code PR and posts it as a PR issue comment from
  `hetzy8` (read `gh api repos/hetzy8/kobob/issues/N/comments`). Merge on CI
  green plus a reply on the PR answering each point (fixed, or why not, with
  evidence). Pushing fixes does not earn a second review. Docs-only PRs need
  no review.
- Keep README.md as the human entry point and docs/README.md as the map.
  Dated designs live in `docs/superpowers/specs/`; dated executable plans live
  in `docs/superpowers/plans/`. Update status and affected docs with behavior.
- Record why decisions exist, evidence inspected, alternatives, costs, and
  unresolved questions. Do not import stale project statuses from other repos.
- Prefer a small monolith, service-layer authorization/data access, validated
  inputs, and focused dependencies. Do not copy unrelated therapy, training,
  mobile, AI, or monitoring features from the reference projects.
- During implementation, tests must prove access control, token expiry/replay,
  revocation, role boundaries, private media, and Hebrew RTL behavior. Use
  isolated test databases and mocked delivery; never a production `.env`.
- Keep CI bounded and relevant. No workflows or dependencies are introduced
  during planning work; add only those needed by an authorized implementation
  slice. Never claim a check was run without its actual result.

## Secrets, costs, and operations

Follow ops' Bitwarden Secrets Manager source-of-truth convention. Future
deployment secrets are mapped by name in `hetzy8/ops/secrets/targets.json` and
distributed by its documented tooling, not pasted into GitHub or added by
hand. Check vault/project capacity before assuming another project is free.
Do not read or copy other applications' secret values.

New paid services, production data imports, domain changes, and deployments
need an explicit implementation/release instruction. Documentation must state
when a provider or cost is proposed, measured, declared, or unknown.

Future production releases receive an annotated `vX.Y.Z` tag on the verified
deployed `main` commit. Do not tag this docs initialization as a production
release. Record deploy SHA, verification, migration/rollback notes, and restore
evidence. Monitoring integration belongs in a later ops PR; do not modify ops
as part of this repository initialization.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
