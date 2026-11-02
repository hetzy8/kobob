import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createResendSender,
	type EmailClient,
	isReservedTestAddress,
	signInMessage,
} from "../../src/lib/email";

const url = "https://kobob.example.org/verify#token=abc<script>&x=1";
const email = "member@family.example.net.il";
function fakeClient(
	result: Awaited<ReturnType<EmailClient["emails"]["send"]>> = { error: null },
) {
	const send = vi.fn(async () => result);
	return { client: { emails: { send } } satisfies EmailClient, send };
}
afterEach(() => vi.restoreAllMocks());

describe("isReservedTestAddress", () => {
	it.each([
		"a@example.com",
		"a@EXAMPLE.org",
		"a@example.net",
		"a@test.com",
		"a@family.test",
		"a@x.example",
		"a@x.invalid",
		"a@x.localhost",
		"a@x.local",
	])("treats %s as reserved", (address) => {
		expect(isReservedTestAddress(address)).toBe(true);
	});
	it.each(["a@gmail.com", "a@family.example.net.il", "a@mytest.com"])(
		"sends to %s",
		(address) => {
			expect(isReservedTestAddress(address)).toBe(false);
		},
	);
});

describe("signInMessage", () => {
	it("builds a Hebrew RTL message with an escaped link", () => {
		const message = signInMessage(url);
		expect(message.subject).toBe("קישור כניסה לקובוב");
		expect(message.text).toContain(url);
		expect(message.text).toContain("15 דקות");
		expect(message.html).toContain('dir="rtl"');
		expect(message.html).toContain('lang="he"');
		expect(message.html).not.toContain("<script>");
		expect(message.html).toContain(
			"https://kobob.example.org/verify#token=abc&lt;script&gt;&amp;x=1",
		);
	});
});

describe("createResendSender", () => {
	it("sends the sign-in message from the configured sender", async () => {
		const { client, send } = fakeClient();
		const sendLink = createResendSender({
			apiKey: "re_synthetic",
			from: "קובוב <no-reply@mail.kobob.example>",
			client,
		});
		await sendLink({ email, url });
		expect(send).toHaveBeenCalledWith(
			{
				from: "קובוב <no-reply@mail.kobob.example>",
				to: email,
				...signInMessage(url),
			},
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});
	it("skips reserved test addresses without calling Resend", async () => {
		const { client, send } = fakeClient();
		const sendLink = createResendSender({
			apiKey: "re_x",
			from: "a@b.example",
			client,
		});
		await expect(
			sendLink({ email: "member@family.test", url }),
		).resolves.toBeUndefined();
		expect(send).not.toHaveBeenCalled();
	});
	it("fails generically and logs codes only when Resend rejects", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const { client } = fakeClient({
			error: {
				name: "validation_error",
				statusCode: 422,
				message: `bad ${email} ${url}`,
			} as never,
		});
		const sendLink = createResendSender({
			apiKey: "re_x",
			from: "a@b.example",
			client,
		});
		const failure = await sendLink({ email, url }).catch(
			(error: unknown) => error,
		);
		expect(String(failure)).toBe("Error: EMAIL_DELIVERY_FAILED");
		const logged = JSON.stringify(log.mock.calls);
		expect(logged).toContain("name=validation_error");
		expect(logged).toContain("statusCode=422");
		for (const secret of [email, "token=abc", "bad "])
			expect(logged).not.toContain(secret);
	});
	it("fails generically when the client throws", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const client: EmailClient = {
			emails: {
				send: async () => {
					throw Object.assign(new Error(`fetch failed for ${email}`), {
						code: "ECONNRESET",
					});
				},
			},
		};
		const sendLink = createResendSender({
			apiKey: "re_x",
			from: "a@b.example",
			client,
		});
		await expect(sendLink({ email, url })).rejects.toThrow(
			/^EMAIL_DELIVERY_FAILED$/,
		);
		const logged = JSON.stringify(log.mock.calls);
		expect(logged).toContain("code=ECONNRESET");
		expect(logged).not.toContain(email);
	});
});
