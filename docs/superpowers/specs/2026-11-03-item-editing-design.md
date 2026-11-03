# Item editing, lifecycle and conflicts

**Date:** 2026-11-03
**Status:** approved design (Yoram, 2026-11-03, section by section); not yet implemented
**Roadmap:** phase 1 in [ROADMAP.md](../../ROADMAP.md); plan Task 3, items only
**Depends on:** v0.2.0 (sign-in, membership); rules in the
[memorial specification](2026-11-01-family-memorial-design.md) §3 and §5

## Goal

Family members create and edit archive items with the metadata later phases
need (dates, people, places, types, tags), publish them deliberately, and
return them to private, archive and restore them. Visitors see only the
published version of public items. Concurrent changes never overwrite each
other silently.

## Scope

In: archive items as text and metadata; shared people and places lists;
revisions; lifecycle actions; conflict checks; audit; family screens; a minimal
public list and item page.

Out (later phases): files and media (phase 3), achievements and memorial pages
(phase 2), search, filters, timeline and map (phase 5), import (phase 4),
permanent deletion (needs a retention policy), visual design.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Public view in this slice | Minimal `/archive` and `/archive/[id]` | Publishing must have a visible, testable effect (Yoram, 2026-11-03) |
| People and places | Shared lists that items link to | Clean people/place pages and a reliable map later; one record per name (Yoram) |
| Public visibility of people and places | They follow the items: shown only through a published item's published revision; a person can be marked family-only and is then never shown publicly | Protects living people without a second publish step (Yoram) |
| Revision storage | Item row plus revision rows; links belong to a revision | Public queries read the published revision directly |
| Not chosen | Draft fields plus a JSON snapshot | Public people/place queries become awkward |
| Not chosen | A version per save (full history) | Not required by the product spec; more data |
| Deleting people and places | Not available in this slice | Links stay valid; no orphan handling needed yet |

## Data model

| Table | Fields |
|---|---|
| `Item` | `id` (cuid); `kobId` (optional, unique, for imports); `state` `active`/`archived`; `visibility` `private`/`public`; `version` integer; `workingRevisionId`; `publishedRevisionId` (null unless public); `createdAt`, `updatedAt` |
| `ItemRevision` | `id`; `itemId`; `title`; `description` (plain text); `types` (one or more of `picture`, `video`, `audio`, `drawing`, `article`, `interview`, `document`, `other`); date fields; `tags` (text array); `authorId`; `createdAt`, `updatedAt` |
| Date fields | `dateKind` `unknown`/`single`/`range`; `dateStart`, `dateEnd` (dates); `datePrecision` `day`/`month`/`year`/`decade`; `dateApproximate` boolean |
| `Person` | `id`; `name`; `otherNames` (text array); `familyOnly` boolean; `version`; timestamps |
| `Place` | `id`; `name`; `otherNames`; `latitude`, `longitude` (optional, both or neither); `version`; timestamps |
| `ItemRevisionPerson`, `ItemRevisionPlace` | `(revisionId, personId)` / `(revisionId, placeId)` |
| `EditorialAudit` | `actorId`, `targetType` (`item`/`person`/`place`), `targetId`, `action`, `createdAt`; never titles, descriptions or names |

Limits (enforced by `item-input.ts`): title 1–200 characters; description up
to 20,000; 1–8 types; up to 30 tags of up to 50 characters; up to 50 people
and 50 places per item. A `range` needs `dateEnd` ≥ `dateStart`; `unknown`
has no date values; precision applies to both ends.

## Lifecycle rules

An item is **public** when `visibility = public`, `state = active` and
`publishedRevisionId` is set. Public reads use only the published revision.

| Action | Allowed from | Effect |
|---|---|---|
| Create | — | New item and working revision; private, active, `version` 1 |
| Save | active | If the working revision is the published one, copy it into a new working revision first; then update the working revision |
| Publish | active, with unpublished edits or private | `publishedRevisionId = workingRevisionId`; visibility public |
| Make private | active and public | Visibility private; `publishedRevisionId = null` |
| Archive | active | State archived; visibility private; `publishedRevisionId = null` |
| Restore | archived | State active; stays private |

Clearing the published revision on make-private and archive means no later
action can bring an older public version back.

Every mutation names the `version` it expects. Inside one transaction, the
service checks the actor's membership again, then runs
`UPDATE "Item" … WHERE id = $id AND version = $expected` and increments
`version`. Zero rows updated means a conflict: the transaction is rolled back
and nothing changes. An action not allowed from the current state is also
refused without changes. Person and place edits use the same expected-`version` check.

## Components

| Unit | Responsibility |
|---|---|
| `src/services/editorial.ts` | `createEditorialService(db, requireMember)`: `createItem(input)`, `updateItem(id, expectedVersion, input)`, `transitionItem(id, expectedVersion, action)`, `listItems()`, `listArchived()`, `getItem(id)`, `listPeople()`, `savePerson(input)`, `listPlaces()`, `savePlace(input)`. Every call checks for an active verified member; mutations write audit rows in the same transaction. |
| `src/services/archive.ts` | Public reads, no session: `listPublicItems()`, `getPublicItem(id)`. Selects only published-revision fields, places, and people with `familyOnly = false`. |
| `src/services/item-input.ts` | zod schemas for item, person and place input. Input never carries identity or permission. |
| `src/services/editorial-runtime.ts` | Wires the service to the database and `requireMember`, like `member-runtime.ts`. |
| Server actions under `src/app/family/` | Thin: parse form data, call the service, return field errors, a conflict result or success. |

## Screens

Family (members only; anyone else is redirected to sign-in):

- `/family`: active items with a private/public label and an "edited since
  published" label; add-item button; links to archived items, people and places.
- `/family/items/new` and `/family/items/[id]/edit`: the item form with
  search-and-add pickers for people and places. Lifecycle buttons match the
  state: publish (or publish again), make private, archive.
- `/family/archived`: archived items with restore.
- `/family/people` and `/family/places`: edit names, other spellings, the
  family-only switch and coordinates.

Public:

- `/archive`: published items with title, date and types; plain layout.
- `/archive/[id]`: the published version. A private, archived or unknown id
  gets the same not-found page.

New Hebrew interface strings are proposed in `src/locales/he.ts` and listed in
the PR for Yoram's approval before release; they are not approved copy until then.

## Errors and conflicts

| Situation | Member sees | Data |
|---|---|---|
| Version mismatch | "The item changed since you opened it"; their input stays in the form beside the latest saved version; they save again | Unchanged; a stale save cannot reverse a newer publish, archive or restore |
| Simultaneous actions on the same version | One succeeds; the other gets the conflict message | One result, never a mix |
| Invalid input | Field errors; input kept | Nothing saved |
| Action not allowed in the current state | Same conflict message (the page was out of date) | Unchanged |
| Session expired or membership revoked | Redirect to sign-in | Unchanged; the check runs inside the transaction |
| Database failure | Generic error; input kept | Rolled back |

## Tests

- **Integration (real PostgreSQL):**
  - members edit each other's items;
  - new items are private;
  - saving a public item leaves the public version unchanged until publish;
  - make private and archive hide the item on the next public read;
  - restore returns it private, and a later publish shows the new version, never an older one;
  - a family-only person never appears in public reads, while places on published items do;
  - a stale version fails with no change, including two concurrent actions on the same version (save versus publish, archive versus restore);
  - non-members and revoked members are refused by every function;
  - no member-facing permanent delete exists;
  - audit rows carry no content.
- **Unit:** `item-input.ts`: date shapes, ranges, precision, limits.
- **Browser:**
  - create → publish → visible at `/archive/[id]` → edit → public page still old → publish → new version shown;
  - a conflict across two browser contexts keeps the input;
  - archive and restore;
  - the not-found page for private items;
  - Hebrew RTL on the new pages.
- Synthetic data only; no real names, places or family content in tests.
