import { defineConfig, devices } from "@playwright/test";
import { requireTestDatabaseUrl } from "./src/lib/config";
const testPort = Number(process.env.KOBOB_TEST_PORT || "3100");
if (!Number.isInteger(testPort) || testPort < 1024 || testPort > 65535)
	throw new Error("Invalid test port");
const testOrigin = `http://127.0.0.1:${testPort}`;
const databaseUrl = requireTestDatabaseUrl(process.env);
export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: false,
	workers: 1,
	use: {
		baseURL: testOrigin,
		locale: "he-IL",
		trace: "off",
		screenshot: "off",
	},
	reporter: "list",
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: `npm run dev -- --hostname 127.0.0.1 --port ${testPort}`,
		url: testOrigin,
		reuseExistingServer: false,
		env: {
			KOBOB_E2E: "1",
			// Test imports need react-server; Next manages its own runtime conditions.
			NODE_OPTIONS: "",
			DATABASE_URL: databaseUrl,
			SITE_ORIGIN: testOrigin,
			AUTH_SECRET: "synthetic-browser-secret-more-than-32-characters",
		},
	},
});
