import { redirect } from "next/navigation";
import { requireMember } from "@/services/access";
import { SessionPanel } from "@/components/session-panel";
import { copy } from "@/locales/development";
export const dynamic = "force-dynamic";
export default async function Family() {
	try {
		await requireMember();
	} catch (error) {
		if (error instanceof Error && error.message === "UNAUTHORIZED")
			redirect("/sign-in");
		throw new Error("Family access is unavailable. Please retry later.");
	}
	return (
		<SessionPanel>
			<h1>{copy.family}</h1>
			<p>{copy.foundation}</p>
		</SessionPanel>
	);
}
