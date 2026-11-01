import { spawnSync } from "node:child_process";
import { requireTestDatabaseUrl } from "../src/lib/config";
const url = requireTestDatabaseUrl(process.env);
const result = spawnSync("prisma", ["migrate", "deploy"], {
	stdio: "inherit",
	env: { ...process.env, DATABASE_URL: url },
	shell: false,
});
process.exit(result.status ?? 1);
