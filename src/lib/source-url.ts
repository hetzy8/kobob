// External links come from the catalog; only plain web links may be rendered.
export function isSafeSourceUrl(value: string): boolean {
	if (!URL.canParse(value)) return false;
	const url = new URL(value);
	return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}
