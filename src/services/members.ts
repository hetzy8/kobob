import "server-only";
import type { Prisma } from "../generated/prisma/client";
import { z } from "zod";
import type { Database } from "../lib/database";
import type { MemberContext } from "../lib/auth-system";
const emailSchema = z.string().trim().toLowerCase().max(254).email();
// Serialize all membership changes, including bootstrap and last-admin checks.
const lock = (tx: Prisma.TransactionClient) =>
	tx.$executeRaw`SELECT pg_advisory_xact_lock(673214890)`;
export async function bootstrapAdmin(db: Database, email: string) {
	const normalized = emailSchema.parse(email);
	return db.$transaction(async (tx) => {
		await lock(tx);
		if (await tx.user.count({ where: { role: "admin" } }))
			throw new Error("ADMIN_ALREADY_EXISTS");
		if (await tx.user.findUnique({ where: { email: normalized } }))
			throw new Error("MEMBER_ALREADY_EXISTS");
		const member = await tx.user.create({
			data: { email: normalized, role: "admin" },
		});
		await tx.membershipAudit.create({
			data: { targetId: member.id, action: "bootstrap" },
		});
		return member.id;
	});
}
export function createMemberService(
	db: Database,
	requireAdmin: () => Promise<MemberContext>,
) {
	async function run<T>(
		work: (tx: Prisma.TransactionClient, actor: MemberContext) => Promise<T>,
	) {
		const actor = await requireAdmin();
		return db.$transaction(async (tx) => {
			await lock(tx);
			const current = await tx.user.findUnique({ where: { id: actor.id } });
			if (
				current?.role !== "admin" ||
				current.status !== "active" ||
				!current.emailVerified ||
				current.accessVersion !== actor.accessVersion
			)
				throw new Error("FORBIDDEN");
			return work(tx, actor);
		});
	}
	async function mutate(
		id: string,
		action: "revoke" | "restore" | "email",
		email?: string,
	) {
		const normalized =
			action === "email" ? emailSchema.parse(email) : undefined;
		return run(async (tx, actor) => {
			const target = await tx.user.findUniqueOrThrow({ where: { id } });
			if (
				(action === "revoke" || action === "email") &&
				target.role === "admin" &&
				target.status === "active" &&
				(await tx.user.count({
					where: { role: "admin", status: "active", emailVerified: true },
				})) <= 1
			)
				throw new Error("LAST_ADMIN");
			if (action === "restore" && target.status !== "revoked")
				throw new Error("INVALID_STATE");
			if (action === "revoke" && target.status !== "active")
				throw new Error("INVALID_STATE");
			await tx.user.update({
				where: { id },
				data: {
					...(action === "email"
						? { email: normalized }
						: { status: action === "revoke" ? "revoked" : "active" }),
					emailVerified: false,
					accessVersion: { increment: 1 },
				},
			});
			await tx.session.deleteMany({ where: { userId: id } });
			await tx.verification.deleteMany({ where: { memberId: id } });
			await tx.membershipAudit.create({
				data: { actorId: actor.id, targetId: id, action },
			});
		});
	}
	return {
		list: () =>
			run((tx) =>
				tx.user.findMany({
					select: {
						id: true,
						email: true,
						status: true,
						role: true,
						emailVerified: true,
					},
					orderBy: { createdAt: "asc" },
				}),
			),
		add: (email: string) =>
			run(async (tx, actor) => {
				const user = await tx.user.create({
					data: { email: emailSchema.parse(email) },
				});
				await tx.membershipAudit.create({
					data: { actorId: actor.id, targetId: user.id, action: "add" },
				});
				return user.id;
			}),
		revoke: (id: string) => mutate(id, "revoke"),
		restore: (id: string) => mutate(id, "restore"),
		changeEmail: (id: string, email: string) => mutate(id, "email", email),
	};
}
