import Link from "next/link";
import { redirect } from "next/navigation";
import { editorialService } from "@/services/editorial-runtime";
import { ItemForm } from "@/components/item-form";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function NewItem() {
	let people: { id: string; name: string }[];
	let places: { id: string; name: string }[];
	try {
		[people, places] = await Promise.all([
			editorialService().listPeople(),
			editorialService().listPlaces(),
		]);
	} catch (error) {
		if (error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message))
			redirect("/sign-in");
		throw new Error(copy.error);
	}
	return (
		<>
			<Link href="/family">{copy.items.backToList}</Link>
			<h1>{copy.items.add}</h1>
			<ItemForm people={people} places={places} />
		</>
	);
}
