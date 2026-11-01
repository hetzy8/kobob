"use server";
import { revalidatePath } from "next/cache";
import { memberService } from "@/services/member-runtime";
import { copy } from "@/locales/he";
export async function manageMember(_previous: string, data: FormData) {
	try {
		const service = memberService();
		const action = data.get("action");
		const id = String(data.get("id") ?? "");
		const email = String(data.get("email") ?? "");
		if (action === "add") await service.add(email);
		else if (action === "revoke") await service.revoke(id);
		else if (action === "restore") await service.restore(id);
		else if (action === "email") await service.changeEmail(id, email);
		else return copy.memberFailure;
		revalidatePath("/admin/members");
		return copy.memberSuccess;
	} catch {
		return copy.memberFailure;
	}
}
