import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/services/access";
import { editorialService } from "@/services/editorial-runtime";
import { SessionPanel } from "@/components/session-panel";
import { copy } from "@/locales/he";
import { isAccessError, logoutPending } from "./access";
export const dynamic = "force-dynamic";
export default async function Family({
	searchParams,
}: {
	searchParams: Promise<{ page?: string; review?: string }>;
}) {
	const query = await searchParams;
	const needsReview = query.review === "1";
	let member: Awaited<ReturnType<typeof requireMember>>;
	let list: Awaited<ReturnType<ReturnType<typeof editorialService>["listItemsPage"]>>;
	try {
		member = await requireMember();
		list = await editorialService().listItemsPage({ page: Number(query.page ?? "1"), needsReview });
	} catch (error) {
		if (isAccessError(error)) redirect("/sign-in");
		throw new Error(copy.error);
	}
	const href = (page: number, review = needsReview) =>
		`/family?${new URLSearchParams({ ...(page > 1 ? { page: String(page) } : {}), ...(review ? { review: "1" } : {}) })}`;
	const locked = await logoutPending();
	return (
		<SessionPanel logoutPending={locked}>
			{!locked && (
				<>
					<h1>{copy.family}</h1>
					<nav aria-label={copy.items.list}>
						<Link href="/family/items/new">{copy.items.add}</Link>{" "}
						<Link href="/family/archived">{copy.items.archived}</Link>{" "}
						<Link href="/family/people">{copy.items.people}</Link>{" "}
						<Link href="/family/places">{copy.items.places}</Link>
						{member.role === "admin" && (
							<>
								{" "}
								<Link href="/admin/members">{copy.members}</Link>
							</>
						)}
					</nav>
					<h2>{copy.items.list}</h2>
					<p>
						<Link href={href(1, !needsReview)}>
							{needsReview ? copy.items.showAll : copy.items.showNeedsReview}
						</Link>
					</p>
					{list.items.length === 0 ? (
						<p>{copy.items.none}</p>
					) : (
						<ul>
							{list.items.map((item) => (
								<li key={item.id}>
									{item.thumbnailId && (
										// biome-ignore lint/performance/noImgElement: private bytes behind an authenticated route, so not next/image.
										<img src={`/api/media/${item.thumbnailId}`} alt="" width={80} loading="lazy" />
									)}{" "}
									<Link href={`/family/items/${item.id}/edit`}>{item.title}</Link>{" "}
									· {item.visibility === "public" ? copy.items.public : copy.items.private}
									{item.reviewStatus === "needs_review" && ` · ${copy.items.reviewNames.needs_review}`}
									{item.hasUnpublishedEdits && ` · ${copy.items.unpublishedEdits}`}
								</li>
							))}
						</ul>
					)}
					{list.pageCount > 1 && (
						<nav aria-label={copy.items.list}>
							{list.page > 1 && <Link href={href(list.page - 1)}>{copy.items.previousPage}</Link>}{" "}
							{copy.items.pageOf(list.page, list.pageCount)}{" "}
							{list.page < list.pageCount && <Link href={href(list.page + 1)}>{copy.items.nextPage}</Link>}
						</nav>
					)}
				</>
			)}
		</SessionPanel>
	);
}
