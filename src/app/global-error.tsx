"use client";
import { copy } from "@/locales/he";
export default function GlobalError({ reset }: { reset: () => void }) {
	return (
		<html lang="he" dir="rtl">
			<body>
				<main role="alert">
					<h1>{copy.error}</h1>
					<p>{copy.errorHelp}</p>
					<button type="button" onClick={reset}>
						{copy.retry}
					</button>{" "}
					<a href="/">{copy.home}</a>
				</main>
			</body>
		</html>
	);
}
