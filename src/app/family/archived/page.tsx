import Link from "next/link";
import { redirect } from "next/navigation";
import { editorialService } from "@/services/editorial-runtime";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function Archived() {
	let items: Awaited<ReturnType<ReturnType<typeof editorialService>["listArchived"]>>;
	try {
		items = await editorialService().listArchived();
	} catch (error) {
		if (error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message))
			redirect("/sign-in");
		throw new Error(copy.error);
	}
	return (
		<>
			<Link href="/family">{copy.items.backToList}</Link>
			<h1>{copy.items.archived}</h1>
			{items.length === 0 ? (
				<p>{copy.items.none}</p>
			) : (
				<ul>
					{items.map((item) => (
						<li key={item.id}>
							<Link href={`/family/items/${item.id}/edit`}>{item.title}</Link>
						</li>
					))}
				</ul>
			)}
		</>
	);
}
