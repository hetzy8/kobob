import "server-only";
import { headers } from "next/headers";
import { accessSystem } from "@/lib/runtime";
export async function requireMember() {
	return accessSystem().requireMember(await headers());
}
export async function requireAdmin() {
	return accessSystem().requireAdmin(await headers());
}
