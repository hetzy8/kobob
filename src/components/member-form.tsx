"use client";
import { useActionState, useState } from "react";
import { manageMember } from "@/app/admin/members/actions";
import { copy } from "@/locales/he";
export function MemberForm({
	action,
	id,
	label,
	email = false,
}: {
	action: string;
	id?: string;
	label: string;
	email?: boolean;
}) {
	const [address, setAddress] = useState("");
	const [message, submit, pending] = useActionState(manageMember, "");
	return (
		<form action={submit}>
			<input type="hidden" name="action" value={action} />
			{id && <input type="hidden" name="id" value={id} />}
			{email && (
				<label>
					{copy.email}
					<input
						name="email"
						value={address}
						onChange={(event) => setAddress(event.target.value)}
						type="email"
						required
						maxLength={254}
						dir="ltr"
					/>
				</label>
			)}
			<button type="submit" disabled={pending}>
				{label}
			</button>
			<p role="status">{message}</p>
		</form>
	);
}
