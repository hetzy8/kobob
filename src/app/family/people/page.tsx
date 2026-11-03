import Link from "next/link";
import { redirect } from "next/navigation";
import { editorialService } from "@/services/editorial-runtime";
import type { PersonRecord } from "@/services/editorial";
import { PersonForm } from "@/components/person-form";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function People() {
	let people: PersonRecord[];
	try {
		people = await editorialService().listPeople();
	} catch (error) {
		if (error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message))
			redirect("/sign-in");
		throw new Error(copy.error);
	}
	return (
		<>
			<Link href="/family">{copy.items.backToList}</Link>
			<h1>{copy.items.people}</h1>
			<PersonForm />
			{people.map((person) => (
				<section className="panel" key={`${person.id}:${person.version}`}>
					<PersonForm person={person} />
				</section>
			))}
		</>
	);
}
