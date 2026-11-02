import { afterEach, describe, expect, it, vi } from "vitest";
import { createLinkSender } from "../../src/lib/link-sender";

const message = {
	email: "member@family.example.net.il",
	url: "https://kobob.example.org/verify#token=abc",
};
const validEnv = {
	NODE_ENV: "production",
	RESEND_API_KEY: "re_synthetic",
	EMAIL_FROM: "קובוב <no-reply@mail.kobob.example>",
};

function setup(
	env: Record<string, string | undefined>,
	deliverImpl?: () => Promise<void>,
) {
	const tasks: Array<() => Promise<void>> = [];
	const deliver = vi.fn(async (_message: { email: string; url: string }) => {
		await deliverImpl?.();
	});
	const makeSender = vi.fn(
		(_config: { apiKey: string; from: string }) => deliver,
	);
	const sender = createLinkSender({
		env,
		schedule: (task) => {
			tasks.push(task);
		},
		makeSender,
	});
	return { sender, tasks, deliver, makeSender };
}

afterEach(() => vi.restoreAllMocks());

describe("createLinkSender", () => {
	it("in production resolves before delivery runs, then delivers", async () => {
		const { sender, tasks, deliver, makeSender } = setup(validEnv);
		await sender(message);
		expect(deliver).not.toHaveBeenCalled();
		expect(tasks).toHaveLength(1);
		expect(makeSender).toHaveBeenCalledWith({
			apiKey: "re_synthetic",
			from: "קובוב <no-reply@mail.kobob.example>",
		});
		await tasks[0]();
		expect(deliver).toHaveBeenCalledWith(message);
	});

	it("logs a failed scheduled delivery without address or link", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const { sender, tasks } = setup(validEnv, async () => {
			throw new Error("EMAIL_DELIVERY_FAILED");
		});
		await sender(message);
		await expect(tasks[0]()).resolves.toBeUndefined();
		expect(log.mock.calls).toEqual([["[email] sign-in link not delivered"]]);
		const logged = JSON.stringify(log.mock.calls);
		expect(logged).not.toContain(message.email);
		expect(logged).not.toContain("token=abc");
	});

	it("rejects and logs when production settings are invalid", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const { sender, tasks, makeSender } = setup({ NODE_ENV: "production" });
		expect(makeSender).not.toHaveBeenCalled();
		await expect(sender(message)).rejects.toThrow(
			/^EMAIL_DELIVERY_NOT_CONFIGURED$/,
		);
		expect(log).toHaveBeenCalledWith("[email] delivery not configured");
		expect(tasks).toHaveLength(0);
	});

	it.each(["test", undefined])(
		"never delivers live outside production (NODE_ENV=%s)",
		async (nodeEnv) => {
			const { sender, tasks, makeSender } = setup({
				...validEnv,
				NODE_ENV: nodeEnv,
			});
			await expect(sender(message)).rejects.toThrow(
				/^EMAIL_DELIVERY_NOT_CONFIGURED$/,
			);
			expect(makeSender).not.toHaveBeenCalled();
			expect(tasks).toHaveLength(0);
		},
	);
});
