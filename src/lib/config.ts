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

// Which production settings pass readServerConfig's own rules, as booleans
// only (for the public health check). Each setting is checked in isolation by
// substituting known-good synthetic values for the others. A unit test asserts
// this baseline passes readServerConfig, so a newly required setting must be
// added here or every flag would read false and blame valid settings.
export const validConfigBaseline = Object.freeze({
	SITE_ORIGIN: "https://valid.example",
	DATABASE_URL: "postgresql://valid.example/db",
	AUTH_SECRET: "x".repeat(32),
});
export function serverConfigValidity(env: Environment) {
	const valid: Environment = { ...validConfigBaseline, NODE_ENV: env.NODE_ENV };
	const passes = (name: string) => {
		try {
			readServerConfig({ ...valid, [name]: env[name] });
			return true;
		} catch {
			return false;
		}
	};
	return {
		siteOrigin: passes("SITE_ORIGIN"),
		databaseUrl: passes("DATABASE_URL"),
		authSecret: passes("AUTH_SECRET"),
	};
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
