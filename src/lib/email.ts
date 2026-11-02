import "server-only";
import { Resend } from "resend";
import { copy } from "../locales/he";
import { failureCodes } from "./failure-codes";

// The slice of the Resend SDK this module uses; injectable for unit tests.
export type EmailClient = {
	emails: {
		send(
			options: {
				from: string;
				to: string;
				subject: string;
				text: string;
				html: string;
			},
			requestOptions?: { signal?: AbortSignal },
		): Promise<{
			error: { name?: string; statusCode?: number | null } | null;
		}>;
	};
};

// RFC 2606 / RFC 6761 names plus test.com (a real domain test fixtures use).
// No member has an address there, so a send is always a mistake; skipping it
// keeps bounces off the sending domain's reputation (the rule Sana uses).
const reservedDomains = new Set([
	"example.com",
	"example.net",
	"example.org",
	"test.com",
]);
const reservedSuffixes = [
	".test",
	".example",
	".invalid",
	".localhost",
	".local",
];
export function isReservedTestAddress(email: string): boolean {
	const domain = email.trim().toLowerCase().split("@").pop() ?? "";
	return (
		reservedDomains.has(domain) ||
		reservedSuffixes.some((suffix) => domain.endsWith(suffix))
	);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export function signInMessage(url: string) {
	const text = copy.signInEmail;
	const link = escapeHtml(url);
	return {
		subject: text.subject,
		text: [text.intro, url, text.expiry, text.ignore].join("\n\n"),
		html: `<!doctype html><html lang="he" dir="rtl"><body dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6"><p>${escapeHtml(text.intro)}</p><p><a href="${link}">${link}</a></p><p>${escapeHtml(text.expiry)}</p><p>${escapeHtml(text.ignore)}</p></body></html>`,
	};
}

// Implements auth-system's sendLink contract. Failures throw a fixed code:
// provider messages can echo the recipient, so only names and status codes
// reach the log.
export function createResendSender({
	apiKey,
	from,
	client,
}: {
	apiKey: string;
	from: string;
	client?: EmailClient;
}) {
	let resend = client;
	return async ({ email, url }: { email: string; url: string }) => {
		if (isReservedTestAddress(email)) return;
		let codes: string[] | undefined;
		try {
			resend ??= new Resend(apiKey);
			// The SDK spreads request options into fetch, so the signal aborts a
			// stalled request instead of holding the after-response task open.
			const { error } = await resend.emails.send(
				{ from, to: email, ...signInMessage(url) },
				{ signal: AbortSignal.timeout(10_000) },
			);
			if (error)
				codes = [
					...failureCodes({ name: error.name }),
					`statusCode=${error.statusCode ?? "none"}`,
				];
		} catch (error) {
			codes = failureCodes(error);
		}
		if (codes) {
			console.error("[email] delivery failed", codes);
			throw new Error("EMAIL_DELIVERY_FAILED");
		}
	};
}
