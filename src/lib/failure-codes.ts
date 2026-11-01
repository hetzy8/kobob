// Reduces an error to identifying codes that are safe to log. Driver and
// library messages can contain hostnames, usernames or connection strings, so
// only short code-like fields along the `cause` chain are kept, never text.
const fields = ["name", "code", "kind", "originalCode"] as const;
const codeLike = /^[\w.-]{1,40}$/;
export function failureCodes(error: unknown): string[] {
	const codes: string[] = [];
	let current: unknown = error;
	for (let depth = 0; depth < 5; depth++) {
		if (!current || typeof current !== "object") break;
		const record = current as Record<string, unknown>;
		for (const key of fields) {
			const value = record[key];
			if (typeof value === "string" && codeLike.test(value))
				codes.push(`${key}=${value}`);
		}
		const meta = record.meta;
		if (meta && typeof meta === "object") {
			const code = (meta as Record<string, unknown>).code;
			if (typeof code === "string" && codeLike.test(code))
				codes.push(`meta.code=${code}`);
		}
		current = record.cause;
	}
	return codes;
}
