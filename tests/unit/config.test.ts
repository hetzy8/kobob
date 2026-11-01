import { describe, expect, it } from "vitest";
import {
	readServerConfig,
	requireTestDatabaseUrl,
	serverConfigValidity,
	validConfigBaseline,
} from "../../src/lib/config";

describe("serverConfigValidity", () => {
	const good = {
		NODE_ENV: "production",
		SITE_ORIGIN: "https://memorial.example.org",
		DATABASE_URL: "postgresql://runtime:synthetic@db.example.org/kobob",
		AUTH_SECRET: "synthetic-test-secret-that-is-long-enough",
	};
	it("keeps a baseline that passes production validation", () => {
		expect(() =>
			readServerConfig({ ...validConfigBaseline, NODE_ENV: "production" }),
		).not.toThrow();
	});
	it("follows the environment's loopback-http rule", () => {
		const local = { ...good, SITE_ORIGIN: "http://localhost:3000" };
		expect(
			serverConfigValidity({ ...local, NODE_ENV: "development" }).siteOrigin,
		).toBe(true);
		expect(serverConfigValidity(local).siteOrigin).toBe(false);
	});
	it("reports each valid setting", () => {
		expect(serverConfigValidity(good)).toEqual({
			siteOrigin: true,
			databaseUrl: true,
			authSecret: true,
		});
	});
	it.each([
		["SITE_ORIGIN", "kobob.example.org", "siteOrigin"],
		["SITE_ORIGIN", "http://kobob.example.org", "siteOrigin"],
		["DATABASE_URL", "psql 'postgresql://x@h/db'", "databaseUrl"],
		["AUTH_SECRET", "short", "authSecret"],
		["SITE_ORIGIN", undefined, "siteOrigin"],
		["DATABASE_URL", undefined, "databaseUrl"],
	])("isolates an invalid %s", (name, value, key) => {
		const result = serverConfigValidity({ ...good, [name]: value });
		expect(result[key as keyof typeof result]).toBe(false);
		const others = Object.entries(result).filter(([k]) => k !== key);
		for (const [, ok] of others) expect(ok).toBe(true);
	});
});

const env = {
	SITE_ORIGIN: "https://memorial.example.org",
	DATABASE_URL: "postgresql://runtime:synthetic@db.example.org/kobob",
	AUTH_SECRET: "synthetic-test-secret-that-is-long-enough",
};

describe("server configuration", () => {
	it("uses a configured canonical origin, independent of deployment host", () => {
		expect(
			readServerConfig({ ...env, SITE_ORIGIN: "https://new.example.org/" })
				.origin,
		).toBe("https://new.example.org");
	});
	it.each([
		"http://example.org",
		"https://example.org/path",
		"https://user:pass@example.org",
		"https://example.org/?token=x",
		"//example.org",
		"https://example.org/#x",
	])("rejects unsafe origin %s", (origin) => {
		expect(() => readServerConfig({ ...env, SITE_ORIGIN: origin })).toThrow();
	});
	it("permits plain HTTP only for local development", () => {
		expect(
			readServerConfig({ ...env, SITE_ORIGIN: "http://127.0.0.1:3000" }).origin,
		).toBe("http://127.0.0.1:3000");
		expect(() =>
			readServerConfig({
				...env,
				NODE_ENV: "production",
				SITE_ORIGIN: "http://localhost:3000",
			}),
		).toThrow();
	});
	it("rejects absent settings without exposing values", () => {
		for (const key of ["SITE_ORIGIN", "DATABASE_URL", "AUTH_SECRET"]) {
			const values = { ...env, [key]: "" };
			expect(() => readServerConfig(values)).toThrow(key);
			try {
				readServerConfig(values);
			} catch (error) {
				expect(String(error)).not.toContain("synthetic");
				expect(String(error)).not.toContain("runtime:");
			}
		}
	});
	it("rejects weak secrets and non-PostgreSQL connections without leaking values", () => {
		expect(() => readServerConfig({ ...env, AUTH_SECRET: "short" })).toThrow(
			"AUTH_SECRET",
		);
		expect(() =>
			readServerConfig({
				...env,
				DATABASE_URL: "https://user:synthetic@example.org",
			}),
		).toThrow("DATABASE_URL");
	});
});

describe("isolated test database guard", () => {
	it("accepts only an explicitly supplied local dedicated test database", () => {
		expect(
			requireTestDatabaseUrl({
				TEST_DATABASE_URL:
					"postgresql://kobob_test:synthetic@127.0.0.1:55439/kobob_test",
			}),
		).toBe("postgresql://kobob_test:synthetic@127.0.0.1:55439/kobob_test");
	});
	it.each([
		{},
		{ DATABASE_URL: "postgresql://kobob_test:synthetic@localhost/kobob_test" },
		{
			TEST_DATABASE_URL:
				"postgresql://kobob_test:synthetic@prod.example.org/kobob_test",
		},
		{
			TEST_DATABASE_URL:
				"postgresql://kobob_test:synthetic@localhost/production",
		},
		{ TEST_DATABASE_URL: "postgresql://admin:synthetic@localhost/kobob_test" },
		{
			TEST_DATABASE_URL:
				"postgresql://kobob_test:synthetic@localhost.evil.org/kobob_test",
		},
		{
			TEST_DATABASE_URL:
				"postgresql://kobob_test:synthetic@localhost/kobob_test?host=prod.example.org",
		},
	])("refuses non-isolated targets before any connection", (values) => {
		expect(() => requireTestDatabaseUrl(values)).toThrow("TEST_DATABASE_URL");
	});
});
