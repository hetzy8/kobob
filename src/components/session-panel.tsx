"use client";
import { useState } from "react";
import { copy } from "@/locales/development";
import { useClientReady } from "./use-client-ready";
export function SessionPanel({ children }: { children: React.ReactNode }) {
	const [locked, setLocked] = useState(false);
	const [pending, setPending] = useState(false);
	const ready = useClientReady();
	async function signOut() {
		setLocked(true);
		setPending(true);
		try {
			const response = await fetch("/api/access/sign-out", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			});
			if (response.ok) {
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
