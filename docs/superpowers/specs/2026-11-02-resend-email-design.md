# Sign-in email delivery through Resend

**Date:** 2026-11-02
**Status:** approved design (Yoram, 2026-11-02); not yet implemented
**Update 2026-11-03:** implemented in PR #16, released as v0.2.0 (`f8eff0a`);
rollout steps 3, 4 and 6–8 done, first sign-in email delivered; step 5
(ops map, hetzy8/ops#77) still open. Record: OPERATIONS.md
→ Email delivery (Resend).
**Depends on:** v0.1.0 in production (Vercel + Neon); access rules in the
[memorial specification](2026-11-01-family-memorial-design.md)

## Goal

Members receive their one-time sign-in link by email in production, so the
first administrator can be bootstrapped and sign in. Nothing else changes in
the access model: membership stays pre-approved, links stay single-use and
expire after 15 minutes, and the public response never reveals whether an
address belongs to a member.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Provider | Resend, through the official `resend` SDK | Same provider and SDK as Sana; the Resend Pro plan already paid for covers another domain |
| Not chosen | Direct REST calls with `fetch` | One dependency fewer, but drifts from Sana's pattern |
| Not chosen | Vercel Marketplace Resend integration | Would create a second Resend account outside the ops secrets map |
| Sending domain | `mail.kobob.org` (a subdomain of `kobob.org`) | Owner choice; a subdomain keeps the apex domain's reputation separate |
| Sender | `קובוב <no-reply@mail.kobob.org>` | Owner choice of display name |
| API key | A new Resend key with sending access only, restricted to `mail.kobob.org` | Sana's key stays separate; a leaked kobob key cannot read or send for other domains |

## Configuration

| Production variable | Kind | Source |
|---|---|---|
| `RESEND_API_KEY` | secret | Bitwarden `shared` as `KOBOB_RESEND_API_KEY`, written by the ops secrets tooling |
| `EMAIL_FROM` | plain setting | Set by hand in Vercel, like `SITE_ORIGIN`; marked unmanaged in the ops map |

`readEmailConfig(env)` in `src/lib/config.ts` validates both, separately from
`readServerConfig`, so a missing email setting never blocks the database or
pages:

- `RESEND_API_KEY`: non-empty, starts with `re_`, no whitespace.
- `EMAIL_FROM`: either `address` or `Name <address>`, where the address has a
  single `@` and a dotted domain. No line breaks anywhere.

Errors name the setting only, never its value, matching `readServerConfig`.

`/api/health` turns its `resend` and `emailFrom` flags from presence into
validity, using `readEmailConfig` the way `serverConfigValidity` checks the
other settings. `status` keeps depending on the database alone, so a release
that ships before the provider setup still passes the deploy gate.

## Components

### `src/lib/email.ts` (new)

`createResendSender({ apiKey, from, client? })` returns a function with the
existing `sendLink({ email, url })` contract, so `src/lib/auth-system.ts` does
not change. `client` is injectable for unit tests; by default it constructs
the SDK client once.

- **Reserved test domains:** addresses at `example.com`, `example.net`,
  `example.org`, `test.com` or TLDs `.test`, `.example`, `.invalid`,
  `.localhost`, `.local` are not sent. The call resolves without sending, so
  behaviour matches a real send (the same rule Sana uses).
- **Message:** subject `קישור כניסה לקובוב`; a plain-text part and a minimal
  HTML part with `dir="rtl"` and `lang="he"`. Text: the link, that it works
  once and for 15 minutes, and that the email can be ignored if the reader did
  not ask for it. The link is the only inserted value, and it is HTML-escaped.
  All copy lives in `src/locales/he.ts`.
- **Timeout:** each send aborts after 10 seconds (`AbortSignal.timeout`,
  passed to the SDK as a request option), so a stalled provider cannot hold
  the after-response task open.
- **Failure:** a Resend error, timeout or rejection (including a constructor
  failure) throws
  `Error("EMAIL_DELIVERY_FAILED")` with no message text, address or link. The
  Resend error's `name` and HTTP `statusCode` are logged through
  `failureCodes`, never the message.
- An idempotency key is not used: each call is already a distinct link, and a
  retry is the member pressing the button again within the rate limits.

### `src/lib/runtime.ts`

`accessSystem()` builds its sender with `createLinkSender`
(`src/lib/link-sender.ts`):

- Production (`NODE_ENV === "production"`) with valid email config: the
  request answers without waiting. The Resend send is scheduled with Next's
  `after` (Vercel `waitUntil`) and runs after the response, with a 10-second
  timeout. Reason: a member's request must take as long as a non-member's,
  so response time cannot reveal membership (owner decision 2026-11-02, from
  the final review).
- Otherwise: a sender that throws `EMAIL_DELIVERY_NOT_CONFIGURED`.
  In production that is logged once per instance as a code, so a missing
  setting is visible in the runtime log as well as on `/api/health`.

Development and CI never construct the Resend sender. Browser tests keep their
injected mock sender; there is no live send from CI and no test mailbox.

### Sign-in page

The Hebrew notice `deliveryNotice` ("delivery is not available in the
development version") is removed. The page response stays the same for members,
non-members and failed deliveries (the existing `sent` confirmation), so it
cannot be used to test whether an address is a member.

## Error handling summary

| Situation | Member sees | Operator sees |
|---|---|---|
| Not a member, or revoked | The generic confirmation (`sent`) | Nothing (by design) |
| Email config missing or invalid | The same confirmation; no email arrives | `resend`/`emailFrom` false on `/api/health`; code in runtime log |
| Resend rejects or is down | The same confirmation; no email arrives | `[email] delivery failed` with name and status code |
| Rate limit reached | Existing rate-limit response | Nothing new |

In production the request does not wait for Resend, so a delivery failure
happens after the response: it is logged as codes (`[email] delivery failed`,
then `[email] sign-in link not delivered`). The unused verification row is not
deleted; the link was never revealed and expires after 15 minutes.

When email is not configured, the existing path in `requestLink`
(`auth-system.ts`) applies: the sender throws, the unused verification row is
deleted, `onDeliveryError` logs `[email] delivery not configured`, and the
answer is still `accepted`. The `sent` copy already tells the member to try
again if no link arrives.

## Tests

- **Unit, `tests/unit/email.test.ts`:** a send passes `from`, `to`, subject,
  text and HTML to the client; the HTML has `dir="rtl"` and an escaped link;
  a reserved test domain is skipped without calling the client; a client error
  throws `EMAIL_DELIVERY_FAILED` and neither the thrown error nor the log
  contains the address, link or provider message.
- **Unit, `tests/unit/config.test.ts`:** `readEmailConfig` accepts a valid key
  and both sender forms; rejects a missing key, a non-`re_` key, a sender
  without a domain and a sender with a line break; errors carry no values.
  Health validity flags for email are isolated per setting.
- **e2e:** unchanged flows with the mock sender; `health.spec.ts` keeps
  `resend`/`emailFrom` as booleans (false in CI).
- No test sends real mail.

## Rollout

1. Feature PR into `dev` with this code and doc updates (`DEVELOPMENT.md`
   "Live email", `OPERATIONS.md` provisioning table and runbook,
   `.env.example` unchanged since both names already exist).
2. Release PR `dev` → `main` on owner go; the smoke gate passes with email
   flags still false.
3. Owner, in Resend: add domain `mail.kobob.org`; create the restricted
   sending key.
4. Owner, in GoDaddy DNS for `kobob.org`: add the SPF, DKIM and DMARC records
   Resend lists; wait for Resend to show the domain verified.
5. Ops PR: map `KOBOB_RESEND_API_KEY` (Bitwarden `shared`, Vercel production
   `RESEND_API_KEY`, `productionDomain: kobob.vercel.app`) and mark
   `vercel:kobob:production#EMAIL_FROM` unmanaged; the kobob expectations note
   says `resend`/`emailFrom` false is now a finding.
6. Owner: from `~/ops`, `node scripts/secrets.mjs rotate KOBOB_RESEND_API_KEY
   --apply`; set `EMAIL_FROM` in Vercel Production; redeploy.
7. Check `/api/health` shows `resend` and `emailFrom` true.
8. Owner: `npm run admin:bootstrap` against production to create the first
   administrator, then sign in with that address to prove the full flow.

## Out of scope

- The custom site domain (`kobobhetz.org` or `kobob.org` for the site itself).
- Other email types (invitations, notifications).
- Bounce or complaint webhooks; Resend's dashboard is the record for now.
- Media storage (R2).
