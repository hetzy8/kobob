import { redirect } from "next/navigation";
import { memberService } from "@/services/member-runtime";
import { MemberForm } from "@/components/member-form";
import { SessionPanel } from "@/components/session-panel";
import { cookies } from "next/headers";
import { copy } from "@/locales/he";
export const dynamic = "force-dynamic";
export default async function Members() {
	let members: Awaited<ReturnType<ReturnType<typeof memberService>["list"]>>;
	try {
		members = await memberService().list();
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
					<h1>{copy.members}</h1>
					<p>{copy.memberHelp}</p>
					<MemberForm action="add" label={copy.addMember} email />
					<div className="member-list">
						{members.map((member) => (
							<section className="panel" key={member.id}>
								<h2 dir="ltr">{member.email}</h2>
								<p>
									{member.status === "active"
										? copy.activeMember
										: copy.revokedMember}{" "}
									·{" "}
									{member.emailVerified
										? copy.verifiedMember
										: copy.unverifiedMember}
								</p>
								<MemberForm
									action={member.status === "active" ? "revoke" : "restore"}
									id={member.id}
									label={
										member.status === "active"
											? copy.revokeMember
											: copy.restoreMember
									}
								/>
								{member.role === "admin" ? (
									<p>{copy.adminEmailLocked}</p>
								) : (
									<MemberForm
										action="email"
										id={member.id}
										label={copy.changeMemberEmail}
										email
									/>
								)}
							</section>
						))}
					</div>
				</>
			)}
		</SessionPanel>
	);
}
