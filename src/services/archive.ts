import "server-only";
import type { Database } from "../lib/database";
import type { DateValue, ItemTypeValue } from "./item-input";
import { dateFromRow, revisionInclude, toRevisionView, type RevisionView } from "./item-view";

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

export function createArchiveReader(db: Database) {
	return {
		async listPublicItems(): Promise<PublicSummary[]> {
			const items = await db.item.findMany({
				where: publicWhere,
				include: { publishedRevision: true },
				orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
			});
			return items.flatMap((item) =>
				item.publishedRevision
					? [
							{
								id: item.id,
								title: item.publishedRevision.title,
								types: item.publishedRevision.types,
								date: dateFromRow(item.publishedRevision),
							},
						]
					: [],
			);
		},
		async getPublicItem(id: string): Promise<(RevisionView & { id: string }) | null> {
			const item = await db.item.findFirst({
				where: { id, ...publicWhere },
				include: { publishedRevision: { include: revisionInclude } },
			});
			if (!item?.publishedRevision) return null;
			return { id: item.id, ...toRevisionView(item.publishedRevision, { publicOnly: true }) };
		},
	};
}
