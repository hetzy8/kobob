import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMember } from "@/services/access";
import { SessionPanel } from "@/components/session-panel";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function Family() {
	let member: Awaited<ReturnType<typeof requireMember>>;
	try {
		member = await requireMember();
	} catch (error) {
		if (error instanceof Error && error.message === "UNAUTHORIZED")
			redirect("/sign-in");
		throw new Error(copy.error);
	}
	const logoutPending =
		(await cookies()).get("kobob_logout_pending")?.value === "1";
	return (
		<SessionPanel logoutPending={logoutPending}>
			{!logoutPending && <h1>{copy.family}</h1>}
			{!logoutPending && <p>{copy.foundation}</p>}
			{!logoutPending && member.role === "admin" && (
				<Link href="/admin/members">{copy.members}</Link>
			)}
		</SessionPanel>
	);
}
