import type { Metadata } from "next";
import Link from "next/link";
import { copy } from "@/locales/he";
import "./globals.css";
export const metadata: Metadata = {
	title: copy.documentTitle,
	robots: { index: false, follow: false },
};
export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="he" dir="rtl">
			<body>
				<a className="skip-link" href="#main">
					{copy.skip}
				</a>
				<div className="preview" lang="he">
					{copy.preview}
				</div>
				<header className="site-header" lang="he">
					<Link href="/" className="wordmark">
						{copy.title}
					</Link>
					<nav aria-label={copy.navigationLabel}>
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
				<main id="main" lang="he">
					{children}
				</main>
			</body>
		</html>
	);
}
