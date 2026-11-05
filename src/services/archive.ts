import "server-only";
import type { Database } from "../lib/database";
import type { DateValue, ItemTypeValue } from "./item-input";
import { dateFromRow, revisionInclude, toRevisionView, type RevisionView } from "./item-view";
import { matches, parseQuery } from "./search";

export type PublicSummary = {
	id: string;
	title: string;
	types: ItemTypeValue[];
	date: DateValue;
};

// The only reader for visitors. It needs no session, so it must select from
// the published revision alone and drop family-only people.
const publicWhere = {
	state: "active",
	visibility: "public",
	publishedRevisionId: { not: null },
} as const;

export type PublicSource = {
	url: string;
	publisher: string;
	author: string;
	publishedText: string;
	license: string;
};
// An explicit field list: anything else on an item's relations stays family-only.
const publicSources = {
	select: { url: true, publisher: true, author: true, publishedText: true, license: true },
	orderBy: { id: "asc" },
} as const;

export function createArchiveReader(db: Database) {
	// Loads every published item and matches in code (spec 2026-11-05: fine at
	// family-archive scale; move matching into SQL if it gets slow).
	async function searchPublicItems(text: string): Promise<PublicSummary[]> {
		const query = parseQuery(text);
		const items = await db.item.findMany({
			where: publicWhere,
			include: { publishedRevision: { include: revisionInclude }, sources: publicSources },
			orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
		});
		return items.flatMap((item) => {
			const revision = item.publishedRevision;
			if (!revision) return [];
			const date = dateFromRow(revision);
			const texts = [
				revision.title,
				revision.description,
				...revision.tags,
				...revision.people
					.filter(({ person }) => !person.familyOnly)
					// Main name only: other names are never shown publicly (Yoram, 2026-11-05).
					.map(({ person }) => person.name),
				...revision.places.flatMap(({ place }) => [place.name, ...place.otherNames]),
				...item.sources.flatMap((source) => [source.publisher, source.author]),
			];
			if (!matches({ texts, date }, query)) return [];
			return [{ id: item.id, title: revision.title, types: revision.types, date }];
		});
	}
	return {
		searchPublicItems,
		listPublicItems: () => searchPublicItems(""),
		async getPublicItem(id: string): Promise<(RevisionView & { id: string; sources: PublicSource[] }) | null> {
			const item = await db.item.findFirst({
				where: { id, ...publicWhere },
				include: { publishedRevision: { include: revisionInclude }, sources: publicSources },
			});
			if (!item?.publishedRevision) return null;
			return { id: item.id, sources: item.sources, ...toRevisionView(item.publishedRevision, { publicOnly: true }) };
		},
	};
}
