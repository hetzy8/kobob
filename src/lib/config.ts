import "server-only";
type Environment = Record<string, string | undefined>;
const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);

function setting(env: Environment, name: string): string {
	const value = env[name]?.trim();
	if (!value) throw new Error(`Missing or invalid ${name}`);
	return value;
}
function parseUrl(value: string, name: string): URL {
	try {
		return new URL(value);
	} catch {
		throw new Error(`Missing or invalid ${name}`);
	}
}
export function readServerConfig(env: Environment) {
	const origin = parseUrl(setting(env, "SITE_ORIGIN"), "SITE_ORIGIN");
	const localHttp =
		env.NODE_ENV !== "production" &&
		loopback.has(origin.hostname) &&
		origin.protocol === "http:";
	if (
		(!localHttp && origin.protocol !== "https:") ||
		origin.username ||
		origin.password ||
		origin.pathname !== "/" ||
		origin.search ||
		origin.hash
	) {
		throw new Error("Missing or invalid SITE_ORIGIN");
	}
	const databaseUrl = setting(env, "DATABASE_URL");
	const database = parseUrl(databaseUrl, "DATABASE_URL");
	if (!["postgres:", "postgresql:"].includes(database.protocol))
		throw new Error("Missing or invalid DATABASE_URL");
	const authSecret = setting(env, "AUTH_SECRET");
	if (authSecret.length < 32) throw new Error("Missing or invalid AUTH_SECRET");
	return Object.freeze({ origin: origin.origin, databaseUrl, authSecret });
}

export function requireTestDatabaseUrl(env: Environment): string {
	const value = setting(env, "TEST_DATABASE_URL");
	const url = parseUrl(value, "TEST_DATABASE_URL");
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		!loopback.has(url.hostname) ||
		url.pathname !== "/kobob_test" ||
		url.username !== "kobob_test" ||
		url.search ||
		url.hash
	) {
		throw new Error(
			"TEST_DATABASE_URL must select the dedicated local kobob_test database and user",
		);
	}
	return value;
}
