import "server-only";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { accessSystem } from "@/lib/runtime";
export async function requireMember() {
	return accessSystem().requireMember(await headers());
}
export async function requireAdmin() {
	return accessSystem().requireAdmin(await headers());
}

// Header only: decides whether to show the Archive tab. Not an authorization
// check; every family page and action calls requireMember itself. Any failure
// (no session, revoked, database down) shows the visitor tabs.
export async function isMemberForNavigation() {
	try {
		await requireMember();
		return true;
	} catch (error) {
		// Let Next's own control-flow errors (e.g. dynamic-rendering bailout) through.
		unstable_rethrow(error);
		return false;
	}
}
