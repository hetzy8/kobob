import { defineConfig, devices } from "@playwright/test";
import { requireTestDatabaseUrl } from "./src/lib/config";
const databaseUrl = requireTestDatabaseUrl(process.env);
export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: false,
	workers: 1,
	use: { baseURL: "http://127.0.0.1:3100", trace: "off", screenshot: "off" },
	reporter: "list",
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: {
		command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
		url: "http://127.0.0.1:3100",
		reuseExistingServer: false,
		env: {
			DATABASE_URL: databaseUrl,
			SITE_ORIGIN: "http://127.0.0.1:3100",
			AUTH_SECRET: "synthetic-browser-secret-more-than-32-characters",
		},
	},
});
