import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
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
				<header className="site-header" lang="he">
					<Link href="/" className="wordmark">
						{copy.title}
					</Link>
					<SiteNav />
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
