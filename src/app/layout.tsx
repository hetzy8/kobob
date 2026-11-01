import type { Metadata } from "next";
import Link from "next/link";
import { copy } from "@/locales/development";
import "./globals.css";
export const metadata: Metadata = {
	title: "Kobob — development preview",
	robots: { index: false, follow: false },
};
export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="he" dir="rtl">
			<body>
				<a className="skip-link" href="#main">
					Skip to content
				</a>
				<div className="preview" lang="en">
					{copy.preview}
				</div>
				<header className="site-header" lang="en">
					<Link href="/" className="wordmark">
						{copy.title}
					</Link>
					<nav aria-label="Main navigation">
						{copy.navigation.map((item) => (
							<Link key={item.href} href={item.href}>
								{item.label}
							</Link>
						))}
					</nav>
					<Link href="/sign-in" className="utility">
						{copy.signIn}
					</Link>
				</header>
				<main id="main" lang="en">
					{children}
				</main>
			</body>
		</html>
	);
}
