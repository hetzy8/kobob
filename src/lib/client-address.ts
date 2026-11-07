import { isIP } from "node:net";

function ipv6Prefix(address: string) {
	const [head, tail] = address.split("%")[0].toLowerCase().split("::");
	const left = head ? head.split(":") : [];
	const right = tail ? tail.split(":") : [];
	const groups =
		tail === undefined
			? left
			: [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
	const prefix = groups
		.slice(0, 4)
		.map((group) => Number.parseInt(group, 16).toString(16));
	return `${prefix.join(":")}::/64`;
}

// Vercel sets this header itself; confirmed on production by the probe in
// the ops plan. Empty means the caller's shared fallback bucket, which only
// local runs reach. A whole /64 counts as one client, since one household can
// hold all of it.
export function clientAddressFrom(request: Request): string {
	const first =
		request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "";
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(first)?.[1] ?? first;
	const version = isIP(mapped);
	if (version === 4) return mapped;
	if (version === 6) return ipv6Prefix(mapped);
	return "";
}
