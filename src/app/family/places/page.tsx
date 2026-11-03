import Link from "next/link";
import { redirect } from "next/navigation";
import { editorialService } from "@/services/editorial-runtime";
import type { PlaceRecord } from "@/services/editorial";
import { PlaceForm } from "@/components/place-form";
import { SessionPanel } from "@/components/session-panel";
import { copy } from "@/locales/he";
import { isAccessError, logoutPending } from "../access";
export const dynamic = "force-dynamic";
export default async function Places() {
	let places: PlaceRecord[];
	try {
		places = await editorialService().listPlaces();
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
					<h1>{copy.items.places}</h1>
					<PlaceForm />
					{places.map((place) => (
						<section className="panel" key={place.id}>
							<PlaceForm place={place} />
						</section>
					))}
				</>
			)}
		</SessionPanel>
	);
}
