import "server-only";
import { after } from "next/server";
import { readServerConfig } from "./config";
import { createDatabase, type Database } from "./database";
import { createAuthSystem } from "./auth-system";
import { clientAddressFrom } from "./client-address";
import { createResendSender } from "./email";
import { createLinkSender } from "./link-sender";
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
		clientAddress: clientAddressFrom,
		// Live mail is sent after the response (see link-sender), so the member
		// sees the same confirmation, in the same time, as a non-member.
		sendLink: createLinkSender({
			env: process.env,
			schedule: after,
			makeSender: createResendSender,
		}),
		// Reached only when delivery is not configured: scheduled deliveries
		// report their own failures after the response.
		onDeliveryError: () => {
			console.error("[email] delivery not configured");
		},
	});
	return instance;
}
