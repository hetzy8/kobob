import "server-only";
import { readServerConfig } from "./config";
import { createDatabase, type Database } from "./database";
import { createAuthSystem } from "./auth-system";
let instance: ReturnType<typeof createAuthSystem> | undefined;
let db: Database | undefined;
// One client (and connection pool) per server instance, shared by the access
// system and the health check, so the probe exercises the same driver path.
export function database(): Database {
	if (db) return db;
	db = createDatabase(readServerConfig(process.env).databaseUrl);
	return db;
}
export function accessSystem() {
	if (instance) return instance;
	const config = readServerConfig(process.env);
	instance = createAuthSystem({
		db: database(),
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
