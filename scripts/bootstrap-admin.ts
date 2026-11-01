import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDatabase } from "../src/lib/database";
import { readServerConfig } from "../src/lib/config";
import { bootstrapAdmin } from "../src/services/members";
// Explicit operator input: never default an address or mark mailbox verified.
const prompt = createInterface({ input: stdin, output: stdout });
let db: ReturnType<typeof createDatabase> | undefined;
try {
	if (!stdin.isTTY) throw new Error("INTERACTIVE_TERMINAL_REQUIRED");
	const email = await prompt.question(
		"Administrator email (not stored in Git): ",
	);
	const confirmation = await prompt.question(
		"Type BOOTSTRAP to authorize this initial administrator: ",
	);
	if (confirmation !== "BOOTSTRAP") throw new Error("CANCELLED");
	db = createDatabase(readServerConfig(process.env).databaseUrl);
	await bootstrapAdmin(db, email);
	console.log(
		"Administrator membership created. Email verification is still required before access.",
	);
} catch {
	console.error(
		"Bootstrap failed or cancelled. No automatic administrator access was granted.",
	);
	process.exitCode = 1;
} finally {
	prompt.close();
	await db?.$disconnect();
}
