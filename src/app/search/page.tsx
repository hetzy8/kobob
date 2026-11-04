import Link from "next/link";
import { formatDate } from "@/lib/format-date";
import { copy } from "@/locales/he";
import { archiveReader } from "@/services/editorial-runtime";

export const dynamic = "force-dynamic";

// Public search over published items only (spec 2026-11-05). A GET form keeps
// every search a shareable address.
export default async function Search({
	searchParams,
}: {
	searchParams: Promise<{ q?: string | string[] }>;
}) {
	const { q } = await searchParams;
	const text = (Array.isArray(q) ? q[0] : q) ?? "";
	const reader = archiveReader();
	const items = await reader.searchPublicItems(text);
	const anyPublished = text.trim() === "" ? items.length > 0 : (await reader.listPublicItems()).length > 0;
	return (
		<>
			<h1>{copy.searchPage.title}</h1>
			<search>
				<form action="/search" method="get">
					<label htmlFor="q">{copy.searchPage.label}</label>{" "}
					<input id="q" name="q" type="search" defaultValue={text} maxLength={200} />{" "}
					<button type="submit">{copy.searchPage.submit}</button>
				</form>
			</search>
			{!anyPublished ? (
				<p>{copy.empty}</p>
			) : items.length === 0 ? (
				<p>{copy.searchPage.noResults}</p>
			) : (
				<ul>
					{items.map((item) => (
						<li key={item.id}>
							<Link href={`/items/${item.id}`}>{item.title}</Link> ·{" "}
							{formatDate(item.date)} ·{" "}
							{item.types.map((type) => copy.items.typeNames[type]).join(", ")}
						</li>
					))}
				</ul>
			)}
		</>
	);
}
