# Architecture and stack recommendation

**Date:** 2026-11-01
**Status:** proposed after inspecting existing projects; no services provisioned

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

These are engineering recommendations, not decisions attributed to Yoram.

## Proposed components

| Layer | Proposed choice | Reason / boundary |
|---|---|---|
| App | Next.js App Router, TypeScript, React | Reuse the existing web development approach; one deployable application |
| UI | Tailwind CSS, accessible primitives only as needed | Logical CSS properties and RTL testing; avoid importing Sana's whole UI dependency set |
| Database | PostgreSQL with Prisma; Neon proposed | Relational membership, sessions, content and audit records; isolated dev/test/production databases |
| Authentication | Maintained email-link auth library; Auth.js/Prisma is the existing-project candidate | Verify compatibility and invite-only integration first; no custom cryptography or copied beta version by default |
| Email | Resend with a verified sender for the memorial domain | Existing operational experience; separate sender/configuration and no production delivery in tests |
| Media | Private S3-compatible storage; R2 proposed | Existing tooling experience; authorized application delivery of photos and thumbnails |
| Hosting | Vercel proposed | Existing monolith deployment practice; app auth protects every hostname |
| Verification | Type checking, lint, focused unit/integration tests, Playwright | Test security and actual Hebrew RTL flows, not only component strings |

Do not copy version numbers from another repo. At implementation start choose
supported compatible versions, pin them in a lockfile, and prove the auth
library supports pre-approved membership, email-link consumption, and session
revocation. If the library requires uncontrolled signup, reject that integration
and record the alternative before proceeding.

## Trust boundary

The browser is untrusted. A central server service verifies the current
session, verified identity, active membership and role before data access.
Server Actions validate input and call those services. Media routes apply the
same checks. Layout checks and hosting deployment protection are additional
conveniences, never the family authorization mechanism.

Private responses use `Cache-Control: private, no-store`; no private static
generation, shared ISR/CDN cache, public image optimization source, public
object URL, or service-worker offline cache. Media objects and transformed
thumbnails remain private. Initial media delivery is through an authorized
server route, rather than a durable public or bearer URL. Test that deployment
aliases and preview hosts cannot bypass membership.

Verify host request-body and execution limits before choosing upload transport;
do not send 20 MiB images through a Server Action by assumption. If needed,
issue short-lived admin-authorized, write-only grants to a private quarantine
object, then validate actual size/type and finalize server-side before any
publication. Such upload-only grants are distinct from public download URLs.

Use a versioned membership/session mechanism so revocation and email changes
invalidate outstanding links and sessions. Bootstrap Yoram through an explicit
operator action using a supplied verified address; never promote the first
visitor, a hard-coded guessed address, or an email-domain match.

## Operational cost and evidence

No current bill, free-tier fit, storage estimate, or provider account capacity
has been verified. Expected cost drivers are hosting, database, media storage
and egress, transactional email, backups, domain renewal and CI minutes. Record
dated estimates and an owner-approved cap before provisioning. Prefer existing
provider familiarity while keeping credentials and data isolated from Sana
and Passus. There is no reason for AI APIs, a CMS service, a search service, a
queue, mobile builds, or an always-on worker in the initial version.

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
