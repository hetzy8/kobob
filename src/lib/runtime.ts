import "server-only";
import { readServerConfig } from "./config";
import { createDatabase } from "./database";
import { createAuthSystem } from "./auth-system";
let instance: ReturnType<typeof createAuthSystem> | undefined;
export function accessSystem() {
	if (instance) return instance;
	const config = readServerConfig(process.env);
	const db = createDatabase(config.databaseUrl);
	instance = createAuthSystem({
		db,
		config,
		// Live delivery is intentionally unavailable in this local foundation.
		// Configure approved sender/provider integration in an authorized follow-up.
		sendLink: async () => {
			throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
		},
		onDeliveryError: () => {
			console.error("Email delivery unavailable; no session issued.");
		},
	});
	return instance;
}
