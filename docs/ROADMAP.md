# Roadmap

**Updated:** 2026-11-06 (order of work decided after the [panel review](reviews/2026-11-06-panel-review.md); stage 1 import in production); 2026-11-05 phase 2 restructured by Yoram; first written 2026-11-03 from Yoram's description of the full picture.
**Status:** direction. Each phase still gets its own design, plan and release;
nothing below is implemented unless marked so. Delivery tasks are in the
[implementation plan](superpowers/plans/2026-11-01-family-memorial.md).

## The picture

Everything the family has about Yaki, and everything found about him on the
public internet, lives in one archive: pictures, videos, drawings, articles,
interviews and anything else. Files go to private object storage (R2); links
to material that stays on other sites are kept as sources. Every item carries
as much metadata as is known: dates, people, names, places, type, source and
rights. Family items stay private until a family member reviews and publishes
them; internet material that explicitly names Yaki publishes as a link card
without family review (Yoram, 2026-11-05).
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
| 4 | Collection import | The existing collection (now in Drive) and found internet material brought in with their metadata: family items start private and are reviewed item by item, while internet records that explicitly name Yaki publish as link cards (Yoram, 2026-11-05) ([spec](superpowers/specs/2026-11-05-media-import-design.md), stage 1: catalog import with a dry run) | Task 6 | Stage 1 imported 2026-11-06: 1,162 items (1,115 private family items, 47 public link cards; 64 web sources held for later decisions). Files not yet copied (stages 2–4) |
| 5 | Discovery | Search filters beyond the year (type, people, places, tags); people and place pages. Basic search, timeline and map moved to phase 2 | Task 4, extended | Not started |
| 6 | The book | Yaki's book presented on the site (form to decide: reader, chapters, excerpts or download) | new | Idea; needs design |
| 7 | The film | A film made from the book, presented on the site | new | Idea; production is outside this repository |
| 8 | Launch | `kobob.org` as the address, costs confirmed. Backups with a rehearsed restore moved ahead of the viewer and the first invitation (Yoram, 2026-11-06; see the order below) | Task 7 | Partly done (sender domain) |
| 9 | English version | The whole site also in English (Yoram, 2026-11-05): interface strings, left-to-right layout, and English text for published content (titles, descriptions, life story, people and place names). To decide in its design: address scheme (e.g. `/en/...`), whether English text needs its own publish step, and who translates (family, or machine translation reviewed by the family) | new | Idea; needs design |

Phases 3 and 4 can overlap: import is easier once storage exists, and the
metadata model from phase 1 decides how much an import can carry.

## Order of work (Yoram, 2026-11-06)

Decided after the [panel review](reviews/2026-11-06-panel-review.md), which
found the site cold by absence (no photos, a catalogue voice, a development
banner) rather than by palette. Each step gets its own design and release.

1. Finish stage 1 (done 2026-11-06); drop the development banner and tab
   title and the stale member-help copy; record the import.
2. Ops and backups before any family editing and before the first
   invitation: scheduled database dump to private storage, one rehearsed
   restore, retention and cost approved, keys recorded. Also the operational
   findings: sign-in rate bucket per client, takedown and incident runbook.
3. "Pictures on a phone": media stages 2–4 (storage and delivery, file copy,
   review pages) as one milestone; done when Yoram opens ten family photos on
   his phone.
4. Warm home page and life story in the "living-room wall" direction (phase 2
   slice 5 moves ahead of timeline and map): portrait, years, one sentence,
   six captioned photos, warm palette and Hebrew display type; item pages
   figure-first. Hebrew copy needs Yoram's approval.
5. Invite three relatives with a Hebrew welcome email, add a second
   administrator, watch three 30-minute sessions, fix the top three frictions.
6. Curate: group the family list by source folder, favourites, caption fifty
   favourites together to seed the timeline.

Accepted alongside, each needing its own design: a source health check (link
status on every external source, a dry-by-default script, a broken-links
filter, editable source fields, run before every release and after every
import); family-only by default for people and a family-only flag for
places; the memories data model in order (person roles and captions, stories
and reactions, item relations and collections, events and richer people, an
editable life-story page); a wider release smoke gate; a family review
research queue for sources that still need a person to confirm them (64 held
after stage 1).

Update (Yoram, 2026-11-06): before step 2, R2 is configured and the five
collages Yoram selected for the site are copied there, private to members. The
rest of step 3 keeps its place after ops and backups.

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
