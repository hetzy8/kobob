import Link from "next/link";
import { copy } from "@/locales/he";
export default function NotFound() {
	return (
		<>
			<h1>{copy.notFound}</h1>
			<p>{copy.notFoundHelp}</p>
			<Link href="/">{copy.home}</Link>
		</>
	);
}
