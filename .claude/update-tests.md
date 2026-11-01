# update-tests profile — Kobob

Read by the shared `hetzy8-eng:update-tests` skill (hetzy8/claude-skills). The method lives there;
this file holds only what is specific to Kobob. Keep it true: a stale line here is a finding.

## Tiers

| Tier | Path | Tooling | Run |
|---|---|---|---|
| Unit | `tests/unit/*.test.ts` | Vitest | `npm run test:unit` |
| Integration | `tests/integration/*.test.ts` | Vitest against the isolated Postgres | `npm run test:integration` |
| E2E | `tests/e2e/*.spec.ts` | Playwright (chromium, `he-IL`) against a dev server | `npm run test:e2e` |

Integration and e2e need the disposable database: `npm run db:test:up`, export
`TEST_DATABASE_URL` as in `docs/DEVELOPMENT.md`, `npm run db:test:migrate`; stop with
`npm run db:test:down`. Node 24 is required (`npm exec --yes --package=node@24 -- npm run …`
when the shell has another version). Set `KOBOB_TEST_PORT` if 3100 is busy. Always run e2e
through the npm script — it sets `NODE_OPTIONS=--conditions=react-server`.

## Sources of what changed

- `docs/DEVELOPMENT.md` implemented scope and deferred findings.
- Product invariants in `AGENTS.md` (each needs a test that proves it).
- The implementation plan's acceptance criteria in `docs/superpowers/plans/`.

## Must-cover areas

Access control on every protected route/action, token expiry and replay, revocation
(sessions and pending links), role boundaries (member vs admin), private media (once it
lands), Hebrew RTL root and interface copy, and the `/api/health` contract.

## Conventions

- Synthetic data only: emails under `example.test`; never real family data.
- `requireTestDatabaseUrl` refuses anything but the local `kobob_test` database — never
  bypass it.
- Hebrew expectations come from `tests/fixtures/he-interface.json`, not inline literals
  copied from the locale.
- Each spec cleans its own tables in `beforeEach`/`afterAll`.
- Email delivery is mocked through the injected `sendLink`; no live provider in tests.

## What NOT to test

- Live email delivery, Vercel/Neon/R2 behaviour (not provisioned) — cover with mocks and
  the post-deploy smoke gate instead.
