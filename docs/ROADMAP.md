# Roadmap

**Updated:** 2026-11-05 (phase 2 restructured by Yoram); first written 2026-11-03 from Yoram's description of the full picture.
**Status:** direction. Each phase still gets its own design, plan and release;
nothing below is implemented unless marked so. Delivery tasks are in the
[implementation plan](superpowers/plans/2026-11-01-family-memorial.md).

## The picture

Everything the family has about Yaki, and everything found about him on the
public internet, lives in one archive: pictures, videos, drawings, articles,
interviews and anything else. Files go to private object storage (R2); links
to material that stays on other sites are kept as sources. Every item carries
as much metadata as is known: dates, people, names, places, type, source and
rights. Nothing is public until a family member reviews and publishes it.
Visitors and family can then explore the archive by time, by place and by
search. Yaki's book has its own place on the site, and a film based on the
book is planned to premiere there.

## Phases

| # | Phase | What it delivers | Plan task | Status |
|---|---|---|---|---|
| 0 | Foundation | Hebrew RTL site, invitation-only sign-in by email, member administration, production on Vercel + Neon | Tasks 1–2 | Done (v0.2.0, 2026-11-02) |
| 1 | Item editing | Archive items with metadata, private-by-default, shared editing with conflict checks, publish / make private / archive / restore, minimal public archive and item pages | Task 3 (items) | Done (v0.3.0, 2026-11-04) |
| 2 | Public tabs | New site structure (Yoram, 2026-11-05): Home, Life story, Timeline, Map, From the internet and Search for everyone; Archive for family members only; Achievements dropped. Published items reach tabs automatically from their details. Slices: 1 navigation, family-only archive and search ([spec](superpowers/specs/2026-11-05-public-navigation-search-design.md)); 2 timeline; 3 map; 4 internet sources; 5 life-story editing | Task 3 (rest), Task 4 | Slice 1 released (v0.4.0, 2026-11-05); slices 2–5 follow media and import |
| 3 | Media storage | Private R2 storage, uploads with validation, safe derivatives (thumbnails, web video/audio), playback inside item pages, external sources with attribution ([spec](superpowers/specs/2026-11-05-media-import-design.md), stage 2) | Task 5 | In progress (stage 1 built; stage 2 not started) |
| 4 | Collection import | The existing collection (now in Drive) and found internet material brought in as private items with their metadata, reviewed item by item ([spec](superpowers/specs/2026-11-05-media-import-design.md), stage 1: catalog import with a dry run; no real data imported yet) | Task 6 | In progress |
| 5 | Discovery | Search filters beyond the year (type, people, places, tags); people and place pages. Basic search, timeline and map moved to phase 2 | Task 4, extended | Not started |
| 6 | The book | Yaki's book presented on the site (form to decide: reader, chapters, excerpts or download) | new | Idea; needs design |
| 7 | The film | A film made from the book, presented on the site | new | Idea; production is outside this repository |
| 8 | Launch | `kobob.org` as the address, backups with a rehearsed restore, costs confirmed | Task 7 | Partly done (sender domain) |
| 9 | English version | The whole site also in English (Yoram, 2026-11-05): interface strings, left-to-right layout, and English text for published content (titles, descriptions, life story, people and place names). To decide in its design: address scheme (e.g. `/en/...`), whether English text needs its own publish step, and who translates (family, or machine translation reviewed by the family) | new | Idea; needs design |

Phases 3 and 4 can overlap: import is easier once storage exists, and the
metadata model from phase 1 decides how much an import can carry.

Until phase 9, every phase keeps all interface text in `src/locales/he.ts`
(never inline in components) and avoids left/right-specific layout, so the
English version adds a second locale rather than rewriting pages.

## Metadata the model must support

Decided in phase 1 so later views do not need a data migration:

- **Dates with precision:** exact day, month, year, decade or unknown, and
  "around" or a range. Unknown stays unknown; a file date is not an event date.
- **People:** who appears in or is mentioned by an item.
- **Places:** where an item was made or what it shows, precise enough for a
  map when known.
- **Type:** picture, video, audio, drawing, article, interview, document,
  other; one item can hold several.
- **Source and rights:** who made it, where it came from, whether it may be
  shown publicly.

## Rules carried into every phase

- Everything starts private; only a family member's deliberate action publishes.
  Exception (Yoram, 2026-11-05): imported internet records that explicitly name
  their subject publish as link cards without family review; their summaries
  and saved copies stay family-only.
- No automatic face recognition or guessed identities; people are tagged by
  family members.
- Naming living people, and showing them publicly, needs the same review as
  any other publication.
- Material found on the internet keeps its source and attribution; the site
  does not copy what it has no right to show.

## Open questions

- **The book:** full text, chapters, excerpts or a download; who holds the
  rights; Hebrew only or also translations.
- **The film:** how it is made (filmmaker, animation, AI-assisted), its rights
  and budget, and whether it is hosted on R2 or a video platform.
- **Map:** which map provider, and its cost and privacy terms.
- **Storage cost:** R2 size and egress for the full collection, once its size
  is known.
