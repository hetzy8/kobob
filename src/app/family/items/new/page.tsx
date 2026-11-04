import Link from "next/link";
import { redirect } from "next/navigation";
import { editorialService } from "@/services/editorial-runtime";
import { ItemForm } from "@/components/item-form";
import { SessionPanel } from "@/components/session-panel";
import { copy } from "@/locales/he";
import { isAccessError, logoutPending } from "../../access";
export const dynamic = "force-dynamic";
export default async function NewItem() {
	let people: { id: string; name: string; familyOnly: boolean }[];
	let places: { id: string; name: string }[];
	try {
		[people, places] = await Promise.all([
			editorialService().listPeople(),
			editorialService().listPlaces(),
		]);
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		throw new Error(copy.error);
	}
	const locked = await logoutPending();
	return (
		<SessionPanel logoutPending={locked}>
			{!locked && (
				<>
					<Link href="/family">{copy.items.backToList}</Link>
					<h1>{copy.items.add}</h1>
					<ItemForm people={people} places={places} />
				</>
			)}
		</SessionPanel>
	);
}
