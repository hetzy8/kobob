import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins";
import { z } from "zod";
import type { Database } from "./database";
import type { readServerConfig } from "./config";

export type MemberContext = {
	id: string;
	role: "member" | "admin";
	accessVersion: number;
};
type Options = {
	db: Database;
	config: ReturnType<typeof readServerConfig>;
	sendLink: (message: { email: string; url: string }) => Promise<void>;
	onDeliveryError?: () => void;
	// Only a server-owned resolver may identify a client. Without a verified
	// proxy integration, all requests share a conservative anonymous bucket.
	clientAddress?: (request: Request) => string;
};
const emailSchema = z.string().trim().toLowerCase().max(254).email();
const requestSchema = z.object({ email: emailSchema }).strict();
const confirmSchema = z.object({ token: z.string().min(20).max(256) }).strict();
const sevenDays = 7 * 86400;
const privateHeaders = {
	"Cache-Control": "private, no-store",
	"Referrer-Policy": "no-referrer",
};

export function createAuthSystem({
	db,
	config,
	sendLink,
	onDeliveryError,
	clientAddress,
}: Options) {
	const issuance = new AsyncLocalStorage<{ identifier?: string }>();
	const consumed = new AsyncLocalStorage<{ member?: MemberContext }>();
	const auth = betterAuth({
		baseURL: config.origin,
		basePath: "/internal-auth",
		secret: config.authSecret,
		// Provider/library errors may contain database details. Our public adapter
		// reports generic failures; operational reporting must use codes only.
		logger: { disabled: true },
		trustedOrigins: [config.origin],
		database: prismaAdapter(db, { provider: "postgresql", transaction: true }),
		emailAndPassword: { enabled: false },
		session: {
			expiresIn: sevenDays,
			disableSessionRefresh: true,
			cookieCache: { enabled: false },
			additionalFields: {
				accessVersion: {
					type: "number",
					required: true,
					input: false,
					returned: false,
				},
			},
		},
		verification: {
			additionalFields: {
				memberId: {
					type: "string",
					required: false,
					input: false,
					returned: false,
				},
				accessVersion: {
					type: "number",
					required: false,
					input: false,
					returned: false,
				},
			},
		},
		user: {
			additionalFields: {
				role: { type: "string", input: false, returned: false },
				status: { type: "string", input: false, returned: false },
				accessVersion: { type: "number", input: false, returned: false },
			},
		},
		databaseHooks: {
			user: { create: { before: async () => false } },
			verification: {
				create: {
					before: async (record) => {
						const value: unknown = JSON.parse(record.value);
						const parsed = z
							.object({ type: z.literal("magic-link"), email: emailSchema })
							.safeParse(value);
						if (!parsed.success) return false;
						const member = await db.user.findUnique({
							where: { email: parsed.data.email },
						});
						if (member?.status !== "active") return false;
						const scope = issuance.getStore();
						if (scope) scope.identifier = record.identifier;
						return {
							data: {
								...record,
								memberId: member.id,
								accessVersion: member.accessVersion,
							},
						};
					},
				},
				delete: {
					before: async (record) => {
						// Expired rows may be deleted, but never establish session proof.
						if (new Date(record.expiresAt).getTime() <= Date.now()) return;
						if (
							typeof record.memberId !== "string" ||
							typeof record.accessVersion !== "number"
						)
							return false;
						const member = await db.user.findUnique({
							where: { id: record.memberId },
						});
						if (
							member?.status !== "active" ||
							member.accessVersion !== record.accessVersion
						)
							return false;
						const scope = consumed.getStore();
						if (!scope) return false;
						scope.member = {
							id: member.id,
							role: member.role,
							accessVersion: record.accessVersion,
						};
					},
				},
			},
			session: {
				create: {
					before: async (session) => {
						const proof = consumed.getStore()?.member;
						if (!proof || proof.id !== session.userId) return false;
						const member = await db.user.findUnique({
							where: { id: proof.id },
						});
						if (
							member?.status !== "active" ||
							!member.emailVerified ||
							member.accessVersion !== proof.accessVersion
						)
							return false;
						return { data: { ...session, accessVersion: proof.accessVersion } };
					},
				},
			},
		},
		plugins: [
			magicLink({
				disableSignUp: true,
				storeToken: "hashed",
				expiresIn: 900,
				sendMagicLink: async ({ email, token }) => {
					const url = new URL("/verify", config.origin);
					url.hash = new URLSearchParams({ token }).toString();
					await sendLink({ email, url: url.toString() });
				},
			}),
		],
		// HTTP rate limits are enforced atomically by our public adapter below.
		// The library's raw HTTP handler is never exported by this module.
		rateLimit: { enabled: false },
	});

	async function issueAllowed(email: string, request: Request) {
		const bucket = Math.floor(Date.now() / 900000);
		const hash = (value: string) =>
			createHmac("sha256", config.authSecret).update(value).digest("hex");
		const clientKey = `client:${hash(clientAddress?.(request) || "unresolved-client")}:${bucket}`;
		const clientMax = 20;
		// A client at its limit is refused before any counter moves, so one
		// stranger cannot use up the global limit for everyone. Concurrent
		// requests can pass this read together; the atomic sequence below still
		// bounds them, and a slight overshoot of the global count is harmless.
		const client = await db.rateLimit.findUnique({
			where: { key: clientKey },
			select: { count: true },
		});
		if (client && client.count >= clientMax) return false;
		const limits = [
			{ key: `global:${bucket}`, max: 50 },
			{ key: clientKey, max: clientMax },
			{ key: `email:${hash(email)}:${bucket}`, max: 3 },
		];
		// Check coarse limits first, before allocating rows for attacker-controlled
		// addresses. Each counter increment is a native atomic database upsert.
		for (const [index, limit] of limits.entries()) {
			const row = await db.rateLimit.upsert({
				where: { key: limit.key },
				create: { key: limit.key, count: 1, lastRequest: BigInt(Date.now()) },
				update: { count: { increment: 1 }, lastRequest: BigInt(Date.now()) },
			});
			if (index === 0 && row.count === 1) {
				await db.rateLimit.deleteMany({
					where: { lastRequest: { lt: BigInt(Date.now() - 86400000) } },
				});
			}
			if (row.count > limit.max) return false;
		}
		return true;
	}

	async function requireMember(headers: Headers): Promise<MemberContext> {
		const identity = await auth.api.getSession({
			headers,
			query: { disableCookieCache: true },
		});
		if (!identity) throw new Error("UNAUTHORIZED");
		const session = await db.session.findUnique({
			where: { id: identity.session.id },
			include: { user: true },
		});
		const now = Date.now();
		if (
			!session ||
			session.expiresAt.getTime() <= now ||
			now - session.createdAt.getTime() >= sevenDays * 1000 ||
			!session.user.emailVerified ||
			session.user.status !== "active" ||
			session.accessVersion !== session.user.accessVersion
		) {
			throw new Error("UNAUTHORIZED");
		}
		return {
			id: session.user.id,
			role: session.user.role,
			accessVersion: session.user.accessVersion,
		};
	}
	async function requireAdmin(headers: Headers): Promise<MemberContext> {
		const member = await requireMember(headers);
		if (member.role !== "admin") throw new Error("FORBIDDEN");
		return member;
	}
	function json(value: object, status = 200) {
		return Response.json(value, { status, headers: privateHeaders });
	}
	function redirect(path: string, original?: Response) {
		const headers = new Headers(privateHeaders);
		headers.set("Location", new URL(path, config.origin).toString());
		for (const cookie of original?.headers.getSetCookie() ?? [])
			headers.append("Set-Cookie", cookie);
		return new Response(null, { status: 303, headers });
	}
	async function handle(request: Request): Promise<Response> {
		const path = new URL(request.url).pathname;
		if (
			![
				"/api/access/request",
				"/api/access/confirm",
				"/api/access/sign-out",
			].includes(path)
		) {
			return json({ error: "NOT_FOUND" }, 404);
		}
		if (request.method !== "POST")
			return json({ error: "METHOD_NOT_ALLOWED" }, 405);
		if (request.headers.get("origin") !== config.origin)
			return json({ error: "FORBIDDEN" }, 403);
		let input: unknown;
		try {
			const reader = request.body?.getReader();
			const decoder = new TextDecoder();
			let text = "";
			let bytes = 0;
			if (reader) {
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						bytes += value.byteLength;
						if (bytes > 4096) {
							await reader.cancel();
							return json({ error: "INVALID_REQUEST" }, 400);
						}
						text += decoder.decode(value, { stream: true });
					}
					text += decoder.decode();
				} finally {
					reader.releaseLock();
				}
			}
			input = request.headers.get("content-type")?.includes("application/json")
				? JSON.parse(text)
				: Object.fromEntries(new URLSearchParams(text));
		} catch {
			return json({ error: "INVALID_REQUEST" }, 400);
		}

		if (path === "/api/access/request") {
			const parsed = requestSchema.safeParse(input);
			if (!parsed.success) return json({ error: "INVALID_REQUEST" }, 400);
			const { email } = parsed.data;
			if (!(await issueAllowed(email, request)))
				return json({ accepted: true });
			const member = await db.user.findUnique({ where: { email } });
			if (member?.status !== "active") return json({ accepted: true });
			await issuance.run({}, async () => {
				try {
					await auth.api.signInMagicLink({
						body: { email, callbackURL: "/family" },
						headers: request.headers,
					});
				} catch {
					const identifier = issuance.getStore()?.identifier;
					if (identifier)
						await db.verification.deleteMany({
							where: { identifier, memberId: member.id },
						});
					onDeliveryError?.();
				}
			});
			return json({ accepted: true });
		}
		if (path === "/api/access/confirm") {
			const parsed = confirmSchema.safeParse(input);
			if (!parsed.success) return redirect("/verify?error=invalid");
			try {
				const response = await consumed.run({}, () =>
					auth.api.magicLinkVerify({
						query: {
							token: parsed.data.token,
							callbackURL: "/family",
							errorCallbackURL: "/verify?error=invalid",
						},
						headers: request.headers,
						asResponse: true,
					}),
				);
				const location = response.headers.get("location");
				return redirect(
					location === `${config.origin}/family`
						? "/family"
						: "/verify?error=invalid",
					response,
				);
			} catch {
				return redirect("/verify?error=invalid");
			}
		}
		try {
			// Better Auth 1.7.15 swallows deletion errors during sign-out. Confirm
			// removal ourselves before asking it to clear the cookie. Failure must
			// retain the retry cookie and return an honest unavailable response.
			const identity = await auth.api.getSession({
				headers: request.headers,
				query: { disableCookieCache: true },
			});
			if (identity) {
				await db.session.deleteMany({ where: { id: identity.session.id } });
			}
			const response = await auth.api.signOut({
				headers: request.headers,
				asResponse: true,
			});
			const headers = new Headers(response.headers);
			for (const [key, value] of Object.entries(privateHeaders))
				headers.set(key, value);
			return new Response(response.body, { status: response.status, headers });
		} catch {
			return json({ error: "SIGN_OUT_UNCONFIRMED" }, 503);
		}
	}
	return { handle, requireMember, requireAdmin };
}
