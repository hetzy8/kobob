# Public navigation, family-only archive and search

**Date:** 2026-11-05
**Status:** approved design (Yoram, 2026-11-05)
**Implemented:** 2026-11-05 on `feat/public-search`.
**Roadmap:** phase 2, slice 1 of 5 in [ROADMAP.md](../../ROADMAP.md)
**Depends on:** v0.3.0 (item editing, published revisions, family-only people);
[item editing design](2026-11-03-item-editing-design.md)

## Goal

Visitors find published items through search; the family sees everything
through an Archive tab that only members see. The site's tabs change to the
structure Yoram set on 2026-11-05.

## Site structure (Yoram, 2026-11-05)

| Tab | Who sees it | What it shows | Slice |
|---|---|---|---|
| Home | everyone | introduction and entry points | exists |
| Life story | everyone | the family's text about Yaki, edited and published | 5 |
| Timeline | everyone | published items with a date, in date order | 2 |
| Map | everyone | published items at their places | 3 |
| From the internet | everyone | published items with an internet source | 4 |
| Search | everyone | search across all published items | 1 (this one) |
| Archive | family members only | every item, private and published | 1 (this one) |

- Achievements is no longer a tab. Recognition is an item with a date and
  appears on the timeline. Reason: Yoram was not sure a separate section was
  right; the timeline shows it in context.
- A published item reaches the tabs automatically from its details: a date puts
  it on the timeline, a place with coordinates on the map, an internet source
  under From the internet, and every published item is searchable. Not chosen:
  tabs picked by tags at publish time (an extra step that can leave a dated
  item off the timeline).
- A tab appears only once its slice ships. Not chosen: "coming soon" pages.

## Scope

In: navigation change, member-only Archive tab, removal of Achievements and of
the public `/archive`, public item page at `/items/[id]`, `/search`.

Out: timeline, map, internet sources, life-story editing (slices 2–5); search
filters beyond the year; ranking; visual design.

## Navigation

- Visitors: Home, Life story, Search, plus the sign-in link. Slices 2–4 add
  their tabs to this list when they ship.
- Signed-in active members additionally see **Archive**, linking to the
  existing family list at `/family` (all active items, private and published,
  with the existing links to archived items, people, places and, for the
  administrator, members).
- The header decides by a server-side membership check. A failed check shows
  the visitor navigation; it never shows an error or blocks the page. Hiding
  the tab is presentation only: `/family` and every family action keep their
  own checks.
- Pages showing the member navigation are rendered per request and never
  enter a shared cache.
- `/achievements` and its copy entries are removed. `/about` (Life story)
  stays as it is until slice 5.

## Public item pages

- `/archive` and `/archive/[id]` are removed and answer not-found. No item has
  been published, so no public link breaks and no redirect is needed.
- `/items/[id]` shows what `/archive/[id]` shows today: the published revision
  only. Private, archived and unknown ids get the same not-found page.
  Family-only people are never shown.

## Search (`/search`)

- One text box (`q`) in a GET form, so a search is a shareable URL.
- A query is split on whitespace into words. A word of four digits from 1000
  to 2999 is a **year**; every other word is a **text word**.
- An item matches when every word matches:
  - a text word matches, case-insensitively as a substring, the published
    revision's title, description or a tag, or the name or another name of a
    linked person who is not family-only, or the name or another name of a
    linked place;
  - a year matches when the item's date period overlaps that calendar year.
    The period of a single date covers its precision (a day, month, year or
    decade from its start); a range runs from its start to the end of its end
    date's precision. Approximate dates count as their stated period. Items
    with an unknown date never match a year.
- Only published, active items are searched, through their published revision.
  Unpublished edits, private and archived items are never read.
- No query: all published items, newest publication first (today's `/archive`
  list). Results show title, date and types, linking to `/items/[id]`.
- No results: an honest "nothing found" message. Nothing published: the
  existing empty-archive message.
- Substring matching handles Hebrew prefixes such as ה, ב, ל. The server loads
  the published items and matches them in one pure function, so the
  family-only and year rules live in code that unit tests cover, and user
  input never becomes a SQL pattern. Not chosen: Postgres `ILIKE` (pattern
  escaping, and the year rule is awkward in SQL) and full-text search (no
  Hebrew dictionary). At family-archive scale this is fast; move matching
  into the database if search gets slow.
- Query length is capped at 200 characters and 10 words; longer input is cut,
  not rejected.

## Copy

New Hebrew strings need Yoram's approval before release: the Search tab label
(proposed חיפוש), the search box label and button, and the no-results message.
The Archive tab reuses the approved ארכיון. Achievements strings are removed.

## Tests

- Browser: a visitor sees Home, Life story and Search and no Archive tab; a
  member sees the Archive tab and it opens the family list; `/archive`,
  `/archive/[id]` and `/achievements` answer not-found; `/items/[id]` shows a
  published item and not-found for a private one.
- Integration (real PostgreSQL): search finds a published item by title,
  description, tag, person name, person's other name, place name and year
  (single dates of each precision and ranges); multi-word queries require all
  words; it never returns private or archived items or text that exists only in
  an unpublished working revision; a family-only person's name finds nothing;
  `%` and `_` in a query match literally.
- Unit: query parsing (years, words, caps) and the year-overlap rule.
- The existing Hebrew interface fixture is updated for the new navigation.
