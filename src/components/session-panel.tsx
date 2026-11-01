"use client";
import { useState } from "react";
import { copy } from "@/locales/he";
import { useClientReady } from "./use-client-ready";
export function SessionPanel({
	children,
	logoutPending = false,
}: {
	children: React.ReactNode;
	logoutPending?: boolean;
}) {
	const [locked, setLocked] = useState(logoutPending);
	const [pending, setPending] = useState(false);
	const ready = useClientReady();
	async function signOut() {
		document.cookie = "kobob_logout_pending=1; Path=/; SameSite=Strict";
		setLocked(true);
		setPending(true);
		try {
			const response = await fetch("/api/access/sign-out", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			});
			if (response.ok) {
				document.cookie =
					"kobob_logout_pending=; Path=/; Max-Age=0; SameSite=Strict";
				window.location.replace("/");
				return;
			}
		} catch {
			/* Keep private UI locked; server revocation is not confirmed. */
		}
		setPending(false);
	}
	return (
		<>
			{locked ? <p role="alert">{copy.locked}</p> : children}
			<button type="button" onClick={signOut} disabled={!ready || pending}>
				{locked ? copy.retrySignOut : copy.signOut}
			</button>
		</>
	);
}
