import "server-only";
import { readEmailConfig, readServerConfig } from "./config";
import { createDatabase, type Database } from "./database";
import { createAuthSystem } from "./auth-system";
import { createResendSender } from "./email";
let instance: ReturnType<typeof createAuthSystem> | undefined;
let db: Database | undefined;
// One client (and connection pool) per server instance, shared by the access
// system and the health check, so the probe exercises the same driver path.
export function database(): Database {
	if (db) return db;
	db = createDatabase(readServerConfig(process.env).databaseUrl);
	return db;
}
// Live mail only in production with valid settings; development and tests
// never construct the Resend client. A missing setting is visible on
// /api/health (resend/emailFrom) and in the log below.
function linkSender() {
	if (process.env.NODE_ENV === "production") {
		try {
			const email = readEmailConfig(process.env);
			return createResendSender({ apiKey: email.apiKey, from: email.from });
		} catch {
			console.error("[email] delivery not configured");
		}
	}
	return async () => {
		throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
	};
}
export function accessSystem() {
	if (instance) return instance;
	const config = readServerConfig(process.env);
	instance = createAuthSystem({
		db: database(),
		config,
		sendLink: linkSender(),
		// The member sees the same confirmation either way (no membership
		// oracle); the sender has already logged codes for a provider failure.
		onDeliveryError: () => {
			console.error("[email] sign-in link not delivered");
		},
	});
	return instance;
}
