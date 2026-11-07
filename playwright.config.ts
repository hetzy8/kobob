import { defineConfig, devices } from "@playwright/test";
import { requireTestDatabaseUrl } from "./src/lib/config";
const testPort = Number(process.env.KOBOB_TEST_PORT || "3100");
if (!Number.isInteger(testPort) || testPort < 1024 || testPort > 65535)
	throw new Error("Invalid test port");
const testOrigin = `http://127.0.0.1:${testPort}`;
const databaseUrl = requireTestDatabaseUrl(process.env);
export default defineConfig({
	testDir: "./tests/e2e",
	globalSetup: "./tests/e2e/warm-up.ts",
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
			// `next dev` loads the developer's local env file but keeps variables
			// already set, so blank values keep live email settings out of the tests.
			RESEND_API_KEY: "",
			EMAIL_FROM: "",
			EMAIL_IN_DEVELOPMENT: "",
			R2_ENDPOINT: "",
			R2_BUCKET: "",
			R2_ACCESS_KEY_ID: "",
			R2_SECRET_ACCESS_KEY: "",
		},
	},
});
