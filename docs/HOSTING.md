# Hosting decision

**Date:** 2026-11-01
**Status:** direction accepted; documentation only, no resources provisioned.

## Decision and alternatives

Use Vercel for the Next.js website/admin, Neon PostgreSQL for structured data,
private Cloudflare R2 for media, and Resend for verification email. Yoram
confirmed familiarity with Vercel through Sana and Railway through Passus,
then accepted this direction. Keep Kobob data and credentials isolated.

Railway could host the app and database and is familiar for long-running
backend work. Vercel follows the closer existing Hebrew web application.
Neither provider alone supplies archive preservation, editorial approval or
application authorization. A static site cannot replace those services.

## Evidence and cost limits

Sana's local package manifest confirms Next.js, Prisma/Neon, Resend and S3 SDK
usage. Its vercel.json disables automatic Git deployments and declares a
therapy-specific cron: neither setting is automatically a Kobob requirement.
Passus railway.json configures migrations and a health check. No provider
account billing, remaining quota, credentials or deployed settings were read.

A bounded read of the catalog size column on 2026-11-01 found:

- 1,374 records; 1,289 numeric sizes and 85 missing sizes.
- 2,106,497,481 recorded bytes (2.11 decimal GB).
- Largest recorded object: 219,332,420 bytes (219 MB).

These are catalog values, not independently downloaded/verified object sizes.
They include repeated records and non-display formats, exclude unknown sizes,
and do not measure derivatives, backups, future growth or transfer traffic.
No private file names, source URLs, IDs or member data belong in this repo.

[Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) lists
10 GB-month of Standard storage free monthly and $0.015/GB-month beyond it.
Account allowance availability is unknown. Operations and connected metered
services can add costs; free R2 egress does not imply free Vercel delivery.
[Neon pricing](https://neon.com/pricing) lists a Free allowance of 1 GB of
database storage and 100 CU-hours per project monthly. Media lives in R2, not
that database allowance. Free tiers are not a backup or availability guarantee.
These public rates were checked on 2026-11-01; no total bill is estimated yet.

## Before provisioning

- Confirm existing account plans, incremental charges, data regions, sender
  authority, independent backup destination/retention and a monthly budget.
- Check current Vercel request, streaming response and execution limits against
  representative files. The [function limits](https://vercel.com/docs/functions/limitations)
  document a 4.5 MB body limit; do not proxy ordinary large uploads as bodies.
- Design short-lived admin-only upload grants into private quarantine, validate
  before finalization and publication, and support retries/resumable uploads.
- Prove private authenticated streaming/range delivery for audio/video and
  large documents without public read URLs or shared caches. Record limits
  and bandwidth estimates before accepting the delivery design.
- Test conversion feasibility and choose bounded background execution for
  formats requiring it. Routine post-launch operations remain in the website.

An implementation instruction and approved cost/operations decisions are
required before creating services, adding secrets, changing DNS or deploying.
