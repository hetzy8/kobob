// Reduces an error to identifying codes that are safe to log. Driver and
// library messages can contain hostnames, usernames or connection strings, so
// only short code-like fields are kept, never text. Allowed characters exclude
// "." and "-" so a hostname or dotted value placed in a code field is dropped.
const fields = ["name", "code", "kind", "originalCode"] as const;
const codeLike = /^[A-Za-z0-9_]{1,40}$/;
const maxNodes = 8;
export function failureCodes(error: unknown): string[] {
	const codes: string[] = [];
	// Prisma 7 driver adapters keep the database detail (SQLSTATE, `kind`) in
	// meta.driverAdapterError and its cause, not only in `.cause`.
	const queue: unknown[] = [error];
	for (let seen = 0; queue.length && seen < maxNodes; seen++) {
		const current = queue.shift();
		if (!current || typeof current !== "object") continue;
		const record = current as Record<string, unknown>;
		for (const key of fields) {
			const value = record[key];
			if (typeof value === "string" && codeLike.test(value))
				codes.push(`${key}=${value}`);
		}
		const meta = record.meta;
		if (meta && typeof meta === "object") {
			const metaRecord = meta as Record<string, unknown>;
			if (typeof metaRecord.code === "string" && codeLike.test(metaRecord.code))
				codes.push(`meta.code=${metaRecord.code}`);
			queue.push(metaRecord.driverAdapterError);
		}
		queue.push(record.cause);
	}
	return codes;
}
