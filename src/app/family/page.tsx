import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMember } from "@/services/access";
import { editorialService } from "@/services/editorial-runtime";
import { SessionPanel } from "@/components/session-panel";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function Family() {
	let member: Awaited<ReturnType<typeof requireMember>>;
	let items: Awaited<ReturnType<ReturnType<typeof editorialService>["listItems"]>>;
	try {
		member = await requireMember();
		items = await editorialService().listItems();
	} catch (error) {
		if (
			error instanceof Error &&
			["UNAUTHORIZED", "FORBIDDEN"].includes(error.message)
		)
			redirect("/sign-in");
		throw new Error(copy.error);
	}
	const logoutPending =
		(await cookies()).get("kobob_logout_pending")?.value === "1";
	return (
		<SessionPanel logoutPending={logoutPending}>
			{!logoutPending && (
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
					{items.length === 0 ? (
						<p>{copy.items.none}</p>
					) : (
						<ul>
							{items.map((item) => (
								<li key={item.id}>
									<Link href={`/family/items/${item.id}/edit`}>{item.title}</Link>{" "}
									· {item.visibility === "public" ? copy.items.public : copy.items.private}
									{item.hasUnpublishedEdits && ` · ${copy.items.unpublishedEdits}`}
								</li>
							))}
						</ul>
					)}
				</>
			)}
		</SessionPanel>
	);
}
