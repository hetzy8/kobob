"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { copy } from "@/locales/he";
export function ConfirmSignIn() {
	const [token, setToken] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		function readFragment() {
			const hash = window.location.hash;
			if (!hash) return;
			const value = new URLSearchParams(hash.slice(1)).get("token");
			setToken(value);
			setError("");
			window.history.replaceState(null, "", window.location.pathname);
		}
		readFragment();
		window.addEventListener("hashchange", readFragment);
		return () => window.removeEventListener("hashchange", readFragment);
	}, []);
	if (!token)
		return (
			<>
				<p>{copy.invalid}</p>
				<Link href="/sign-in">{copy.requestAnother}</Link>
			</>
		);
	return (
		<>
			<p>{copy.confirmHelp}</p>
			<form
				method="post"
				action="/api/access/confirm"
				onSubmit={async (event) => {
					event.preventDefault();
					setPending(true);
					setError("");
					try {
						const response = await fetch("/api/access/confirm", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ token }),
						});
						if (response.ok && new URL(response.url).pathname === "/family") {
							document.cookie =
								"kobob_logout_pending=; Path=/; Max-Age=0; SameSite=Strict";
							window.location.replace("/family");
							return;
						}
						setError(copy.invalid);
					} catch {
						setError(copy.requestFailed);
					}
					setPending(false);
				}}
			>
				<button type="submit" disabled={pending}>
					{copy.confirm}
				</button>
				<p role="alert">{error}</p>
			</form>
		</>
	);
}
