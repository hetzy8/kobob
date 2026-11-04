import Link from "next/link";
import { formatDate } from "@/lib/format-date";
import { copy } from "@/locales/he";
import { archiveReader } from "@/services/editorial-runtime";
export const dynamic = "force-dynamic";
export default async function Archive() {
	const items = await archiveReader().listPublicItems();
	return (
		<>
			<h1>{copy.archive}</h1>
			{items.length === 0 ? (
				<p>{copy.empty}</p>
			) : (
				<ul>
					{items.map((item) => (
						<li key={item.id}>
							<Link href={`/archive/${item.id}`}>{item.title}</Link> ·{" "}
							{formatDate(item.date)} ·{" "}
							{item.types.map((type) => copy.items.typeNames[type]).join(", ")}
						</li>
					))}
				</ul>
			)}
		</>
	);
}
