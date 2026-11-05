import "server-only";
import type { Prisma } from "../generated/prisma/client";
import type { Database } from "../lib/database";
import type { MemberContext } from "../lib/auth-system";
import {
	itemInputSchema,
	personInputSchema,
	placeInputSchema,
	type ItemInput,
	type ParsedItem,
	type PersonInput,
	type PlaceInput,
} from "./item-input";
import {
	dateToRow,
	revisionInclude,
	toRevisionView,
	type RevisionView,
} from "./item-view";

export type EditorialAction =
	| "publish"
	| "make-private"
	| "archive"
	| "restore";
export type RightsValue = "unknown" | "needs_clarification" | "cleared";
export type ReviewValue = "needs_review" | "reviewed";
export type ItemSummary = {
	id: string;
	title: string;
	visibility: "private" | "public";
	hasUnpublishedEdits: boolean;
};
export type FamilyItem = {
	id: string;
	state: "active" | "archived";
	visibility: "private" | "public";
	version: number;
	hasUnpublishedEdits: boolean;
	origin: "family" | "internet";
	rightsStatus: RightsValue;
	reviewStatus: ReviewValue;
	working: RevisionView;
};
export type PersonRecord = {
	id: string;
	name: string;
	otherNames: string[];
	familyOnly: boolean;
	version: number;
};
export type PlaceRecord = {
	id: string;
	name: string;
	otherNames: string[];
	latitude: number | null;
	longitude: number | null;
	version: number;
};
type Target = { id: string; expectedVersion: number };
type Tx = Prisma.TransactionClient;
type ItemRow = {
	id: string;
	state: "active" | "archived";
	visibility: "private" | "public";
	version: number;
	origin: "family" | "internet";
	rightsStatus: RightsValue;
	workingRevisionId: string | null;
	publishedRevisionId: string | null;
};

const unpublishedEdits = (item: ItemRow) =>
	item.visibility === "public" &&
	item.workingRevisionId !== item.publishedRevisionId;

// Which actions each state allows, and what they change. Clearing
// publishedRevisionId on make-private and archive is what stops a later
// publish or restore from bringing an older public version back.
function transition(
	item: ItemRow,
	action: EditorialAction,
): Prisma.ItemUncheckedUpdateManyInput | null {
	if (action === "restore")
		return item.state === "archived" ? { state: "active" } : null;
	if (item.state !== "active") return null;
	if (action === "publish") {
		if (item.visibility !== "private" && !unpublishedEdits(item)) return null;
		// Internet items are already public at their source (Yoram, 2026-11-05).
		if (item.origin === "family" && item.rightsStatus !== "cleared")
			throw new Error("RIGHTS_NOT_CLEARED");
		return {
			visibility: "public",
			publishedRevisionId: item.workingRevisionId,
			publishedAt: new Date(),
		};
	}
	if (action === "make-private")
		return item.visibility === "public"
			? { visibility: "private", publishedRevisionId: null, publishedAt: null }
			: null;
	if (action === "archive")
		return {
			state: "archived",
			visibility: "private",
			publishedRevisionId: null,
			publishedAt: null,
		};
	return null;
}

function revisionData(parsed: ParsedItem, authorId: string) {
	return {
		title: parsed.title,
		description: parsed.description,
		types: parsed.types,
		tags: parsed.tags,
		authorId,
		...dateToRow(parsed.date),
		people: { create: parsed.personIds.map((personId) => ({ personId })) },
		places: { create: parsed.placeIds.map((placeId) => ({ placeId })) },
	};
}

export function createEditorialService(
	db: Database,
	requireMember: () => Promise<MemberContext>,
) {
	async function run<T>(work: (tx: Tx, actor: MemberContext) => Promise<T>) {
		const actor = await requireMember();
		return db.$transaction(async (tx) => {
			const current = await tx.user.findUnique({ where: { id: actor.id } });
			if (
				current?.status !== "active" ||
				!current.emailVerified ||
				current.accessVersion !== actor.accessVersion
			)
				throw new Error("FORBIDDEN");
			return work(tx, actor);
		});
	}
	const audit = (
		tx: Tx,
		actorId: string,
		targetType: string,
		targetId: string,
		action: string,
	) =>
		tx.editorialAudit.create({
			data: { actorId, targetType, targetId, action },
		});
	async function checkReferences(tx: Tx, parsed: ParsedItem) {
		const [people, places] = await Promise.all([
			tx.person.count({ where: { id: { in: parsed.personIds } } }),
			tx.place.count({ where: { id: { in: parsed.placeIds } } }),
		]);
		if (people !== parsed.personIds.length || places !== parsed.placeIds.length)
			throw new Error("INVALID_REFERENCE");
	}
	// Loads the item, then claims it with a version-guarded update. Under
	// concurrency the second claimant waits on the row lock, then matches
	// zero rows and fails with CONFLICT; its transaction changes nothing.
	async function claim(
		tx: Tx,
		id: string,
		expectedVersion: number,
		change: (item: ItemRow) => Prisma.ItemUncheckedUpdateManyInput | null,
	) {
		const item = await tx.item.findUnique({ where: { id } });
		if (!item) throw new Error("NOT_FOUND");
		const data = item.version === expectedVersion ? change(item) : null;
		if (!data) throw new Error("CONFLICT");
		const { count } = await tx.item.updateMany({
			where: { id, version: expectedVersion },
			data: { ...data, version: { increment: 1 } },
		});
		if (count !== 1) throw new Error("CONFLICT");
		return item;
	}
	async function summaries(tx: Tx, state: "active" | "archived") {
		const items = await tx.item.findMany({
			where: { state },
			include: { workingRevision: true },
			orderBy: { updatedAt: "desc" },
		});
		return items.map(
			(item): ItemSummary => ({
				id: item.id,
				title: item.workingRevision?.title ?? "",
				visibility: item.visibility,
				hasUnpublishedEdits: unpublishedEdits(item),
			}),
		);
	}

	// People and places share this shape: create, or update only if the row
	// still has the expected version. Two explicit copies keep the Prisma
	// delegates fully typed.
	async function savePersonRecord(
		tx: Tx,
		actorId: string,
		data: PersonInput,
		target?: Target,
	) {
		if (!target) {
			const created = await tx.person.create({ data });
			await audit(tx, actorId, "person", created.id, "create");
			return { id: created.id, version: 1 };
		}
		const { count } = await tx.person.updateMany({
			where: { id: target.id, version: target.expectedVersion },
			data: { ...data, version: { increment: 1 } },
		});
		if (count !== 1) {
			const exists = await tx.person.count({ where: { id: target.id } });
			throw new Error(exists ? "CONFLICT" : "NOT_FOUND");
		}
		await audit(tx, actorId, "person", target.id, "save");
		return { id: target.id, version: target.expectedVersion + 1 };
	}
	async function savePlaceRecord(
		tx: Tx,
		actorId: string,
		data: PlaceInput,
		target?: Target,
	) {
		if (!target) {
			const created = await tx.place.create({ data });
			await audit(tx, actorId, "place", created.id, "create");
			return { id: created.id, version: 1 };
		}
		const { count } = await tx.place.updateMany({
			where: { id: target.id, version: target.expectedVersion },
			data: { ...data, version: { increment: 1 } },
		});
		if (count !== 1) {
			const exists = await tx.place.count({ where: { id: target.id } });
			throw new Error(exists ? "CONFLICT" : "NOT_FOUND");
		}
		await audit(tx, actorId, "place", target.id, "save");
		return { id: target.id, version: target.expectedVersion + 1 };
	}

	return {
		createItem: (input: ItemInput) => {
			const parsed = itemInputSchema.parse(input);
			return run(async (tx, actor) => {
				await checkReferences(tx, parsed);
				const item = await tx.item.create({ data: {} });
				const revision = await tx.itemRevision.create({
					data: { itemId: item.id, ...revisionData(parsed, actor.id) },
				});
				await tx.item.update({
					where: { id: item.id },
					data: { workingRevisionId: revision.id },
				});
				await audit(tx, actor.id, "item", item.id, "create");
				return { id: item.id, version: item.version };
			});
		},
		updateItem: (id: string, expectedVersion: number, input: ItemInput) => {
			const parsed = itemInputSchema.parse(input);
			return run(async (tx, actor) => {
				const item = await claim(tx, id, expectedVersion, (current) =>
					current.state === "active" ? {} : null,
				);
				await checkReferences(tx, parsed);
				const data = revisionData(parsed, actor.id);
				if (
					!item.workingRevisionId ||
					item.workingRevisionId === item.publishedRevisionId
				) {
					// The published revision is never edited: start a new working one.
					const revision = await tx.itemRevision.create({
						data: { itemId: id, ...data },
					});
					await tx.item.update({
						where: { id },
						data: { workingRevisionId: revision.id },
					});
				} else {
					const revisionId = item.workingRevisionId;
					await tx.itemRevisionPerson.deleteMany({ where: { revisionId } });
					await tx.itemRevisionPlace.deleteMany({ where: { revisionId } });
					await tx.itemRevision.update({ where: { id: revisionId }, data });
				}
				await audit(tx, actor.id, "item", id, "save");
				return { id, version: expectedVersion + 1 };
			});
		},
		transitionItem: (
			id: string,
			expectedVersion: number,
			action: EditorialAction,
		) =>
			run(async (tx, actor) => {
				await claim(tx, id, expectedVersion, (item) =>
					transition(item, action),
				);
				await audit(tx, actor.id, "item", id, action);
				return { id, version: expectedVersion + 1 };
			}),
		setRightsStatus: (id: string, expectedVersion: number, status: RightsValue) =>
			run(async (tx, actor) => {
				await claim(tx, id, expectedVersion, (item) =>
					item.state === "active" ? { rightsStatus: status } : null,
				);
				await audit(tx, actor.id, "item", id, `rights-${status}`);
				return { id, version: expectedVersion + 1 };
			}),
		setReviewStatus: (id: string, expectedVersion: number, status: ReviewValue) =>
			run(async (tx, actor) => {
				await claim(tx, id, expectedVersion, (item) =>
					item.state === "active" ? { reviewStatus: status } : null,
				);
				await audit(tx, actor.id, "item", id, `review-${status}`);
				return { id, version: expectedVersion + 1 };
			}),
		getItem: (id: string) =>
			run(async (tx): Promise<FamilyItem> => {
				const item = await tx.item.findUnique({
					where: { id },
					include: { workingRevision: { include: revisionInclude } },
				});
				if (!item?.workingRevision) throw new Error("NOT_FOUND");
				return {
					id: item.id,
					state: item.state,
					visibility: item.visibility,
					version: item.version,
					hasUnpublishedEdits: unpublishedEdits(item),
					origin: item.origin,
					rightsStatus: item.rightsStatus,
					reviewStatus: item.reviewStatus,
					working: toRevisionView(item.workingRevision, { publicOnly: false }),
				};
			}),
		listItems: () => run((tx) => summaries(tx, "active")),
		listArchived: () => run((tx) => summaries(tx, "archived")),
		listPeople: (): Promise<PersonRecord[]> =>
			run((tx) =>
				tx.person.findMany({
					select: {
						id: true,
						name: true,
						otherNames: true,
						familyOnly: true,
						version: true,
					},
					orderBy: { name: "asc" },
				}),
			),
		savePerson: (input: PersonInput, target?: Target) => {
			const parsed = personInputSchema.parse(input);
			return run((tx, actor) =>
				savePersonRecord(tx, actor.id, parsed, target),
			);
		},
		listPlaces: (): Promise<PlaceRecord[]> =>
			run((tx) =>
				tx.place.findMany({
					select: {
						id: true,
						name: true,
						otherNames: true,
						latitude: true,
						longitude: true,
						version: true,
					},
					orderBy: { name: "asc" },
				}),
			),
		savePlace: (input: PlaceInput, target?: Target) => {
			const parsed = placeInputSchema.parse(input);
			return run((tx, actor) => savePlaceRecord(tx, actor.id, parsed, target));
		},
	};
}
