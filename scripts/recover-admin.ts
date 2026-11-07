import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDatabase } from "../src/lib/database";
import { readServerConfig } from "../src/lib/config";
import { recoverAdmin } from "../src/services/members";
// Owner-only recovery for a lost administrator mailbox (docs/OPERATIONS.md →
// Runbook). Explicit operator input: addresses never come from arguments, so
// they stay out of shell history, and the new mailbox must still verify.
const known = new Set(["ADMIN_NOT_FOUND", "MEMBER_ALREADY_EXISTS"]);
const prompt = createInterface({ input: stdin, output: stdout });
let db: ReturnType<typeof createDatabase> | undefined;
try {
	if (!stdin.isTTY) throw new Error("INTERACTIVE_TERMINAL_REQUIRED");
	const current = await prompt.question("Lost administrator email: ");
	const replacement = await prompt.question("Replacement email: ");
	const confirmation = await prompt.question(
		"Type RECOVER after verifying the owner outside the site: ",
	);
	if (confirmation !== "RECOVER") throw new Error("CANCELLED");
	db = createDatabase(readServerConfig(process.env).databaseUrl);
	await recoverAdmin(db, current, replacement);
	console.log(
		"Administrator address replaced and old access ended. Sign in from the new mailbox to verify it.",
	);
} catch (error) {
	// Other messages can carry the address or database details.
	const code =
		error instanceof Error && known.has(error.message) ? ` ${error.message}` : "";
	console.error(`Recovery failed or cancelled. Nothing changed.${code}`);
	process.exitCode = 1;
} finally {
	prompt.close();
	await db?.$disconnect();
}
