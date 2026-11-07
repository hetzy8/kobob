# Architecture and stack recommendation

**Date:** 2026-11-01
**Status:** hosting direction accepted; in production since 2026-11-02 on the stack below (HOSTING.md records what is provisioned; this document's details were written before that and are kept as the decision record)

## Evidence before selection

Sana already demonstrates a TypeScript/React Next.js App Router monolith,
Tailwind, PostgreSQL with Prisma, Auth.js integration, Resend delivery,
S3-compatible media, and Vercel deployment. Its authorization/data access live
in services. It is the closer precedent for a small protected website with
Hebrew presentation and an administrator.

Passus demonstrates FastAPI, SQLAlchemy/Alembic/PostgreSQL, server-managed email
sessions, and Railway deployment. That architecture serves a substantial data
ingestion backend; kobob does not currently need its providers, workers,
PostGIS, native apps, or separate API/frontend boundary.

Ops demonstrates durable documentation, explicit failure states, low-cost CI,
Bitwarden-managed secrets, GitHub deployment history, and release tags. It has
no application runtime; its zero-dependency requirement is not a web stack.
See [the inspected revisions](README.md#reference-material-inspected).

## Approaches considered

| Approach | Benefit | Cost / limitation | Decision |
|---|---|---|---|
| Next.js monolith, following Sana web patterns | One app and language; server rendering, Hebrew UI, access management, and content administration together | Requires careful server authorization and private-cache/media handling | Recommended |
| FastAPI plus a separate frontend, following Passus | Familiar backend and explicit API boundary | Two application surfaces/builds for a small memorial; extra auth integration and operations | Not recommended for the first version |
| Static site plus an external access gateway/CMS | Small public delivery surface | Private media, individual revocation, and Yoram's user management still need protected services; Git content would be public here | Not recommended for the private archive |

Yoram accepted the Vercel-based direction after considering the existing
Vercel/Sana and Railway/Passus deployments. Framework/library details remain
engineering proposals; account plans and provisioning are not approved.

## Proposed components

| Layer | Proposed choice | Reason / boundary |
|---|---|---|
| App | Next.js App Router, TypeScript, React | Reuse the existing web development approach; one deployable application |
| UI | Tailwind CSS, accessible primitives only as needed | Logical CSS properties and RTL testing; avoid importing Sana's whole UI dependency set |
| Database | PostgreSQL with Prisma; Neon selected for planning | Relational membership, sessions, content and audit records; isolated dev/test/production databases |
| Authentication | Better Auth with Prisma and confirmation links for the local foundation | Verify compatibility and invite-only integration first; no custom cryptography or copied beta version by default |
| Email | Resend with a verified sender for the memorial domain | Existing operational experience; separate sender/configuration and no production delivery in tests |
| Media | Private S3-compatible storage; R2 selected for planning | Existing tooling experience; authorized delivery of originals and safe display derivatives |
| Hosting | Vercel selected for planning | Existing monolith deployment practice; app auth protects every hostname |
| Verification | Type checking, lint, focused unit/integration tests, Playwright | Test security and actual Hebrew RTL flows, not only component strings |

Do not copy version numbers from another repo. At implementation start choose
supported compatible versions, pin them in a lockfile, and prove the auth
library supports pre-approved membership, email-link consumption, and session
revocation. If the library requires uncontrolled signup, reject that integration
and record the alternative before proceeding.

## Trust boundary

### Task 0 compatibility review, 2026-11-01

The initial compatibility review led to the pinned Next.js 16.4.3, React 19.3.1,
Prisma 7.10.1 and Better Auth 1.7.15 integration. Node 24 is the selected runtime.
See DEVELOPMENT.md for the local implementation, tests and engineering choices;
this is not evidence of provisioning, live delivery or production readiness.

Auth.js/Prisma was the existing-project candidate. Better Auth was selected
for this local slice after source/documentation inspection and isolated contract
tests of atomic consumption, membership-version binding, session revocation and
signup prevention. The initial flow uses confirmation links with hashed tokens,
fragment-only transport, no cookie cache and a seven-day absolute session limit.
Raw auth endpoints remain unexposed. Live email and trusted deployment address
resolution are not connected. See the development guide for exact limitations.

Primary documentation inspected:

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation).
- [Auth.js Resend provider](https://authjs.dev/getting-started/providers/resend).
- [Better Auth email OTP](https://better-auth.com/docs/plugins/email-otp).
- [Better Auth magic links](https://better-auth.com/docs/plugins/magic-link).
- [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma).
- [Better Auth sessions](https://better-auth.com/docs/concepts/session-management).

### Public and family access

The browser is untrusted. Public services return explicit field projections
only for currently public, non-archived items and permitted representations.
Family services verify the current session, email verification and active
membership before every private read or mutation. All family members may read
all private items and edit/publish/unpublish/archive/restore everyone's items.
User management and permanent deletion additionally require Yoram's admin role.
Server Actions validate input and call these services; media routes enforce the
same visibility boundary. Layout checks or deployment protection are additional
conveniences, never the family authorization mechanism.

Search filters visibility before results, counts and suggestions. Public page,
achievement and related-item queries never expose private titles or thumbnails.
An archive flag is separate from visibility; restore always sets private.
Atomic revision comparisons protect saves and lifecycle transitions, returning
a conflict without overwriting newer work. Preserve unsaved browser input.
Yoram approved private working revisions for public-item edits. Public queries
use only published fields and media/source associations; draft saves do not
alter them. Explicit publication switches the public revision atomically.
Unpublishing/archiving blocks old published revisions too; restore stays private.
Audit actions without storing sensitive bodies in logs.

Private responses use `Cache-Control: private, no-store`; no private static
generation, shared ISR/CDN cache, public image optimization source, public
object URL, or service-worker offline cache. Media objects and transformed
thumbnails remain in private storage. Delivery routes check public visibility
or active verified membership as appropriate; originals are never implicitly
public. Avoid durable public/bearer URLs that bypass later visibility changes.
Initially propose no shared cache for revocable public item responses until
invalidation is proven. Test that every deployment alias/preview host enforces
the same public/private boundary.

Verify host request-body and execution limits before choosing upload transport;
do not send 20 MiB images through a Server Action by assumption. If needed,
issue short-lived family-authorized, write-only grants to a private quarantine
object, then validate actual size/type and finalize server-side before any
publication. Such upload-only grants are distinct from public download URLs.

Use a versioned membership/session mechanism so revocation and email changes
invalidate outstanding links and sessions. Bootstrap Yoram through an explicit
operator action using a supplied verified address; never promote the first
visitor, a hard-coded guessed address, or an email-domain match.

## Operational cost and evidence

No current bill, free-tier fit or provider account capacity has been verified.
HOSTING.md records catalog byte values, not a complete measured storage or
traffic estimate. Expected cost drivers are hosting, database, media storage
and egress, transactional email, backups, domain renewal and CI minutes. Record
dated estimates and an owner-approved cap before provisioning. Prefer existing
provider familiarity while keeping credentials and data isolated from Sana
and Passus. There is no reason for AI APIs, a CMS service, a search service, a
mobile build or an always-on worker by default. Choose any background
execution mechanism only after the archive conversion feasibility check.

## External references

Reviewed on 2026-11-01; recheck at implementation because platform details change:

- [Next.js authentication and authorization](https://nextjs.org/docs/app/guides/authentication):
  centralize secure authorization near data access.
- [Next.js server mutations](https://nextjs.org/docs/app/getting-started/mutating-data):
  authorize server functions individually.
- [Vercel generated URLs](https://vercel.com/docs/deployments/generated-urls):
  alternate deployment URLs exist; the application boundary must cover them.

Provider selection and application access are separate: family members should
not need Vercel accounts to read the memorial.

## Archive-specific implementation gates

See [hosting](HOSTING.md) and [migration](DATA-MIGRATION.md). Preserve legacy
formats privately; conversion and bulk import are resumable operations, not
one unbounded web request. Post-launch upload, processing status, retries and
publication are operated through the website. A managed background execution
mechanism may be needed; choose it after testing representative media against
Vercel limits. No persistent worker is authorized or assumed.

Large authenticated downloads and audio/video need verified streaming/range
behavior, current visibility/membership checks on every new request, and
measured host transfer costs. Do not replace this boundary with public bucket
links to work around function limits.

### Sources, playback and portability

Keep archive identity, sources and delivery representations separate. A record
can reference several files/external sources; achievements reuse relationships.
Use one searchable archive with type/period/tag filters. Audio/video supports
selected external players and hosted playback with attribution, original links
and honest unavailable states. Articles support links and later approved
representations. External access rules remain the publisher's; Kobob privacy
cannot make an external URL private. No arbitrary iframe HTML, unrestricted
preview fetches or private metadata in provider requests.

Use relative navigation, stable KOB/item IDs and domain-independent object keys.
Canonical origin and trusted auth origins are validated server configuration,
not request-host input. Initial `kobobhetz.org` may change; document pending-link,
session/cookie, sender, canonical and redirect migration in operations. This
flexibility needs no generic plugin framework or extra application service.
