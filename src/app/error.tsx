"use client";
import Link from "next/link";
import { copy } from "@/locales/he";
export default function ErrorPage({ reset }: { reset: () => void }) {
	return (
		<section role="alert">
			<h1>{copy.error}</h1>
			<p>{copy.errorHelp}</p>
			<button type="button" onClick={reset}>
				{copy.retry}
			</button>{" "}
			<Link href="/">{copy.home}</Link>
		</section>
	);
}
