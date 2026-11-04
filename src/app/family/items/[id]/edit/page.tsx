import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { editorialService } from "@/services/editorial-runtime";
import type { FamilyItem } from "@/services/editorial";
import { ItemForm } from "@/components/item-form";
import { ItemActions } from "@/components/item-actions";
import { SessionPanel } from "@/components/session-panel";
import { copy } from "@/locales/he";
import { isAccessError, logoutPending } from "../../../access";
export const dynamic = "force-dynamic";
export default async function EditItem({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	let item: FamilyItem;
	let people: { id: string; name: string }[];
	let places: { id: string; name: string }[];
	try {
		[item, people, places] = await Promise.all([
			editorialService().getItem(id),
			editorialService().listPeople(),
			editorialService().listPlaces(),
		]);
	} catch (error) {
		if (error instanceof Error && error.message === "NOT_FOUND") notFound();
		if (isAccessError(error)) redirect("/sign-in");
		throw new Error(copy.error);
	}
	const locked = await logoutPending();
	return (
		<SessionPanel logoutPending={locked}>
			{!locked && (
				<>
					<Link href="/family">{copy.items.backToList}</Link>
					<h1>{copy.items.edit}</h1>
					<p>
						{item.visibility === "public" ? copy.items.public : copy.items.private}
						{item.hasUnpublishedEdits && ` · ${copy.items.unpublishedEdits}`}
					</p>
					{item.state === "active" && (
						<ItemForm
							id={item.id}
							version={item.version}
							initial={item.working}
							people={people}
							places={places}
						/>
					)}
					{item.state === "archived" && <h2>{item.working.title}</h2>}
					<ItemActions item={item} />
				</>
			)}
		</SessionPanel>
	);
}
