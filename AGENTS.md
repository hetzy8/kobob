# Working in hetzy8/kobob

Read this file, README.md, docs/README.md, the current product spec, and its
implementation plan before changing the project. Do not rely on chat history
or machine-local memory for product decisions.

## Purpose and current scope

Kobob is a Hebrew RTL family memorial for Yaki Hetz at the intended domain
`kobobhetz.org`. Yoram manages users. Access needs both verified email and
active membership.

The repository is at the **documentation-only** stage. Do not scaffold an app,
install packages, create infrastructure, edit DNS, send invitations, or deploy
until that work is requested. A draft spec or plan is not implementation
approval. Preserve requirements, proposals, open decisions, and implemented
behavior as different statuses.

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

1. Email verification proves mailbox control, not permission to enter.
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

## Development and documentation

- First initialization may establish `main` because the remote has no history.
  Afterward, fetch current refs, inspect the worktree, and work on a focused
  branch with a PR into `main`. Never overwrite another contributor's work.
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
  for this documentation-only initialization. Never claim a check was run
  without its actual result.

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
