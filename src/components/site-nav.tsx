import Link from "next/link";
import { logoutPending } from "@/app/family/access";
import { copy } from "@/locales/he";
import { isMemberForNavigation } from "@/services/access";

export async function SiteNav() {
	const member = !(await logoutPending()) && (await isMemberForNavigation());
	const links = member ? [...copy.navigation, copy.memberNavigation] : copy.navigation;
	return (
		<nav aria-label={copy.navigationLabel}>
			{links.map((item) => (
				<Link key={item.href} href={item.href}>
					{item.label}
				</Link>
			))}
		</nav>
	);
}
