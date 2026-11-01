import { afterAll, beforeEach, expect, it } from "vitest";
import { createDatabase } from "../../src/lib/database";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import {
	createMemberService,
	bootstrapAdmin,
} from "../../src/services/members";
const db = createDatabase(requireTestDatabaseUrl(process.env));
beforeEach(async () => {
	await db.membershipAudit.deleteMany();
	await db.verification.deleteMany();
	await db.user.deleteMany();
});
afterAll(async () => {
	await db.membershipAudit.deleteMany();
	await db.verification.deleteMany();
	await db.user.deleteMany();
	await db.$disconnect();
});
async function setup(role: "admin" | "member" = "admin") {
	const actor = await db.user.create({
		data: { email: "operator@example.test", role, emailVerified: true },
	});
	const service = createMemberService(db, async () => ({
		id: actor.id,
		role,
		accessVersion: actor.accessVersion,
	}));
	return { actor, service };
}
it("denies anonymous and ordinary members on every management operation", async () => {
	const { service } = await setup("member");
	for (const operation of [
		() => service.list(),
		() => service.add("new@example.test"),
		() => service.revoke("missing"),
		() => service.restore("missing"),
		() => service.changeEmail("missing", "new@example.test"),
	])
		await expect(operation()).rejects.toThrow();
	const anonymous = createMemberService(db, async () => {
		throw new Error("UNAUTHORIZED");
	});
	await expect(anonymous.list()).rejects.toThrow("UNAUTHORIZED");
});
it("normalizes unique emails and never grants verification or administrator role", async () => {
	const { service } = await setup();
	const id = await service.add(" NEW@EXAMPLE.TEST ");
	const user = await db.user.findUniqueOrThrow({ where: { id } });
	expect(user.email).toBe("new@example.test");
	expect(user.emailVerified).toBe(false);
	expect(user.role).toBe("member");
	await expect(service.add("new@example.test")).rejects.toThrow();
});
it("revokes sessions and pending links and restores without reviving old access", async () => {
	const { service } = await setup();
	const id = await service.add("new@example.test");
	await db.session.create({
		data: {
			id: "synthetic-session",
			token: "synthetic-token",
			userId: id,
			accessVersion: 1,
			expiresAt: new Date(Date.now() + 60000),
		},
	});
	await db.verification.create({
		data: {
			identifier: "synthetic-link",
			value: "synthetic",
			memberId: id,
			accessVersion: 1,
			expiresAt: new Date(Date.now() + 60000),
		},
	});
	await service.revoke(id);
	await service.restore(id);
	const user = await db.user.findUniqueOrThrow({ where: { id } });
	expect(user.status).toBe("active");
	expect(user.emailVerified).toBe(false);
	expect(user.accessVersion).toBe(3);
	expect(await db.session.count()).toBe(0);
	expect(await db.verification.count()).toBe(0);
	expect(await db.membershipAudit.count()).toBe(3);
});
it("email changes require fresh verification and invalidate prior access", async () => {
	const { service } = await setup();
	const id = await service.add("old@example.test");
	await db.user.update({ where: { id }, data: { emailVerified: true } });
	await service.changeEmail(id, "NEW@example.test");
	const user = await db.user.findUniqueOrThrow({ where: { id } });
	expect(user.email).toBe("new@example.test");
	expect(user.emailVerified).toBe(false);
	expect(user.accessVersion).toBe(2);
});
it("serializes concurrent attempts to remove the last administrator", async () => {
	const { actor, service } = await setup();
	const second = await db.user.create({
		data: { email: "second@example.test", role: "admin", emailVerified: true },
	});
	const other = createMemberService(db, async () => ({
		id: second.id,
		role: "admin",
		accessVersion: 1,
	}));
	const results = await Promise.allSettled([
		service.revoke(actor.id),
		other.revoke(second.id),
	]);
	expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
	expect(
		await db.user.count({ where: { role: "admin", status: "active" } }),
	).toBe(1);
});
it("bootstrap is explicit, one-time and does not bypass email verification", async () => {
	await expect(bootstrapAdmin(db, "")).rejects.toThrow();
	const id = await bootstrapAdmin(db, "operator@example.test");
	expect(
		(await db.user.findUniqueOrThrow({ where: { id } })).emailVerified,
	).toBe(false);
	await expect(bootstrapAdmin(db, "other@example.test")).rejects.toThrow();
});
it("rejects a revoked actor even if an earlier guard returned its identity", async () => {
	const { actor, service } = await setup();
	await db.user.update({
		where: { id: actor.id },
		data: { status: "revoked", accessVersion: { increment: 1 } },
	});
	await expect(service.add("new@example.test")).rejects.toThrow("FORBIDDEN");
});
