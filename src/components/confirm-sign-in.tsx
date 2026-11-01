"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { copy } from "@/locales/he";
export function ConfirmSignIn() {
	const [token, setToken] = useState<string | null>(null);
	const fragmentRead = useRef(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => {
		if (fragmentRead.current) return;
		fragmentRead.current = true;
		const value = new URLSearchParams(window.location.hash.slice(1)).get(
			"token",
		);
		// This effect synchronizes a browser-only URL fragment; it cannot be read during SSR.
		setToken(value);
		if (window.location.hash)
			window.history.replaceState(null, "", window.location.pathname);
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
