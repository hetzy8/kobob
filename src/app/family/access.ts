import "server-only";
import { cookies } from "next/headers";

// Shared by the family pages; "use server" actions keep their own helper.
export const isAccessError = (error: unknown) =>
	error instanceof Error && ["UNAUTHORIZED", "FORBIDDEN"].includes(error.message);

export async function logoutPending() {
	return (await cookies()).get("kobob_logout_pending")?.value === "1";
}
