import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { FullConfig } from "@playwright/test";
// `next dev` compiles each route on its first request and then tells every
// open page to rebuild; about half a second later those pages reload, which
// aborts any navigation they have in flight (ERR_ABORTED). The full suite
// hid this because early tests compiled every route; a subset does not. So
// request every route once before any test runs. Routes come from the app
// directory, so a new page is covered without touching this file.
const appDir = join(process.cwd(), "src", "app");
function routes(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return routes(path);
		if (!/^(page|route)\.tsx?$/.test(entry.name)) return [];
		const segments = relative(appDir, dir)
			.split(sep)
			.filter(Boolean)
			.map((segment) => (segment.startsWith("[") ? "warm-up" : segment));
		return [`/${segments.join("/")}`];
	});
}
export default async function warmUp(config: FullConfig) {
	const origin = config.projects[0]?.use.baseURL;
	if (!origin) throw new Error("No baseURL to warm up");
	// The not-found page is a route of its own; an unknown path compiles it.
	const paths = [...routes(appDir), "/warm-up-missing"];
	for (const path of paths) {
		await fetch(`${origin}${path}`, { redirect: "manual" });
	}
}
