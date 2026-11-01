import Image from "next/image";
import Link from "next/link";
import { copy } from "@/locales/he";
export default function Home() {
	return (
		<>
			<h1>{copy.title}</h1>
			<Image
				src="/images/home-collage.webp"
				alt={copy.homeCollageAlt}
				width={1600}
				height={1600}
				sizes="(max-width: 1056px) 100vw, 1008px"
				preload
				className="home-collage"
			/>
			<div className="section-links">
				{copy.navigation.map((item) => (
					<Link key={item.href} href={item.href}>
						{item.label}
					</Link>
				))}
			</div>
		</>
	);
}
