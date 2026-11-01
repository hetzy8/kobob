import "server-only";
import { createDatabase } from "../lib/database";
import { readServerConfig } from "../lib/config";
import { requireAdmin } from "./access";
import { createMemberService } from "./members";
let service: ReturnType<typeof createMemberService> | undefined;
export function memberService() {
	service ??= createMemberService(
		createDatabase(readServerConfig(process.env).databaseUrl),
		requireAdmin,
	);
	return service;
}
