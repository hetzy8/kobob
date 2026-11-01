"use client";
import { useState } from "react";
import { copy } from "@/locales/development";
import { useClientReady } from "./use-client-ready";
export function SignInForm() {
	const [pending, setPending] = useState(false);
	const ready = useClientReady();
	const [status, setStatus] = useState("");
	return (
		<form
			method="post"
			action="/api/access/request"
			onSubmit={async (event) => {
				event.preventDefault();
				setPending(true);
				setStatus("");
				const email = new FormData(event.currentTarget).get("email");
				try {
					const response = await fetch("/api/access/request", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ email }),
					});
					setStatus(response.ok ? copy.sent : copy.requestFailed);
				} catch {
					setStatus(copy.requestFailed);
				} finally {
					setPending(false);
				}
			}}
		>
			<label>
				{copy.email}
				<input
					required
					name="email"
					type="email"
					dir="ltr"
					autoComplete="email"
					maxLength={254}
				/>
			</label>
			<button type="submit" disabled={!ready || pending}>
				{copy.requestLink}
			</button>
			<p role="status" aria-live="polite">
				{status}
			</p>
		</form>
	);
}
