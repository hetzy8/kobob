# security-audit profile — Kobob

Read by the shared `hetzy8-eng:security-audit` skill (hetzy8/claude-skills). The method lives there;
this file holds only what is specific to Kobob. Keep it true: a stale line here is a finding.

Rules source: "Product invariants" and "Secrets, costs, and operations" in `AGENTS.md`.
This repository is **public**: anything committed is published.

## The rules (check each)

### 1. Every protected read and mutation re-checks the server-side session
Family pages, actions and routes must go through `requireMember()` / `requireAdmin()`
(`src/services/access.ts` → `src/lib/auth-system.ts`), which re-read the member's
`status` and `accessVersion` from the database. A layout guard or hidden button is
not a check.

- Grep `src/app/**/page.tsx`, `**/actions.ts` and `src/app/api/**/route.ts` for any
  Prisma/`db.` access or service call not preceded by one of the two guards.
- Public pages (`/`, `/about`, `/achievements`, `/archive`, `/sign-in`, `/verify`)
  must not read member data or private items.
- `/api/health` is deliberately public: it may only return `status`, `commit`,
  `deploymentId`, `timestamp` and `config` booleans — any other field is a finding.

### 2. Only administrators grant or remove access
Membership mutations live in `src/services/members.ts`, and each must call the injected
`requireAdmin` first. No signup path, domain-based membership or automatic first-user
admin; `scripts/bootstrap-admin.ts` is the only explicit bootstrap.

- Flag any `user.create` / `user.update` of `role` or `status` outside `members.ts`
  and the bootstrap script.

### 3. Revocation invalidates sessions and pending links
Revoke and role/email changes must, in the same transaction, delete the member's
`Session` and `Verification` rows (or bump `accessVersion`). Check every branch in
`members.ts` that lowers access.

### 4. MembershipAudit is append-only
No `membershipAudit.update`, `.delete`, `.deleteMany` or `.upsert` in `src/`.
(Tests may truncate it on their isolated database.)

### 5. Private content never becomes public by storage or cache
- Nothing private in `public/` (only the explicitly selected collage images in
  `public/images/`, EXIF stripped).
- Responses carrying member or private data are `Cache-Control: private, no-store`
  (`next.config.ts` sets it globally — flag any route that overrides it).
- No durable public URL for private media once the media slice lands.

### 6. No secrets or real family data in the repository
- No real member emails, allowlists, tokens, exports or `.env` values; fixtures are
  synthetic (`example.test`).
- `.env.example` holds empty placeholders only; no `NEXT_PUBLIC_` prefix on a secret.
- Secret values come from Bitwarden via ops `secrets push`, never typed into files.

### 7. Errors do not leak internals
Public responses return codes (`SERVICE_UNAVAILABLE`, `SIGN_OUT_UNCONFIRMED`, …),
never driver/library messages. Grep `catch` blocks in routes for `err.message`.

## Exclusions and authorized callers

- Exclude `node_modules/`, `.next/`, `.next-e2e/`, `src/generated/`, `tests/`.
- `src/lib/auth-system.ts` is the authorized caller for `Session`, `Verification`
  and `RateLimit` cleanup; `src/services/members.ts` for membership and audit writes.
