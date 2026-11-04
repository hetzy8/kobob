import { notFound } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import { copy } from "@/locales/he";
import { archiveReader } from "@/services/editorial-runtime";
export const dynamic = "force-dynamic";
// Private, archived and unknown ids all get the same not-found page.
export default async function PublicItem({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const item = await archiveReader().getPublicItem(id);
	if (!item) notFound();
	return (
		<article>
			<h1>{item.title}</h1>
			<p>{formatDate(item.date)}</p>
			<p>{item.types.map((type) => copy.items.typeNames[type]).join(", ")}</p>
			{item.description && (
				<p style={{ whiteSpace: "pre-line" }}>{item.description}</p>
			)}
			{item.people.length > 0 && (
				<p>
					{copy.items.people}:{" "}
					{item.people.map((person) => person.name).join(", ")}
				</p>
			)}
			{item.places.length > 0 && (
				<p>
					{copy.items.places}:{" "}
					{item.places.map((place) => place.name).join(", ")}
				</p>
			)}
			{item.tags.length > 0 && <p>{item.tags.join(", ")}</p>}
		</article>
	);
}
