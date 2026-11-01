import Link from "next/link";
import { copy } from "@/locales/he";
export default function Home() {
	return (
		<>
			<h1>{copy.title}</h1>
			<p>{copy.empty}</p>
			<div className="section-links">
				{copy.navigation.slice(1).map((item) => (
					<Link key={item.href} href={item.href}>
						{item.label}
					</Link>
				))}
			</div>
		</>
	);
}
