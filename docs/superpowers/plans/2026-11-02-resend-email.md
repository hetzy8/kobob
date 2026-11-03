# Sign-in Email Delivery (Resend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one-time sign-in links by email through Resend in production, per [the design](../specs/2026-11-02-resend-email-design.md).

**Architecture:** A new `src/lib/email.ts` builds a sender with the existing `sendLink({ email, url })` contract, so `auth-system.ts` is untouched. `readEmailConfig` in `src/lib/config.ts` validates `RESEND_API_KEY` and `EMAIL_FROM` independently of the server config. `runtime.ts` picks the Resend sender only in production with valid email config; `/api/health` reports email validity as booleans.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), `resend` SDK v6, Vitest, Playwright, Biome. Node 24.

## Global Constraints

- Work on branch `feat/resend-email` (from `dev`); the PR targets `dev`. Never push to `dev` or `main`.
- Never log, throw or return an email address, a sign-in link, an API key or a provider message. Logs carry codes only (`failureCodes`, `statusCode`).
- Sender display name: `קובוב`; production sender `קובוב <no-reply@mail.kobob.org>` (set in Vercel, never in code or docs as a default).
- Subject: `קישור כניסה לקובוב`. All Hebrew copy lives in `src/locales/he.ts`.
- Reserved test domains are never sent to: `example.com`, `example.net`, `example.org`, `test.com`, and TLDs `.test`, `.example`, `.invalid`, `.localhost`, `.local`.
- Development and CI never construct the Resend client; no test sends real mail.
- `/api/health` `status` depends on the database only.
- Do not touch `next-env.d.ts` (it is regenerated locally; never commit it). After `npm run format`-style tools, revert any unrelated file they changed (e.g. `tests/e2e/sign-in.spec.ts`).
- Imports inside `src/lib` use relative paths (Vitest has no `@/` alias).
- Run e2e only via `npm run test:e2e` (it sets the `react-server` condition), with the local test database up per `docs/DEVELOPMENT.md`.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/config.ts` (modify) | `readEmailConfig`, `emailConfigValidity` |
| `src/lib/email.ts` (create) | `isReservedTestAddress`, `signInMessage`, `createResendSender` |
| `src/locales/he.ts` (modify) | `signInEmail` copy; remove `deliveryNotice` |
| `src/lib/runtime.ts` (modify) | choose sender; code-only delivery logging |
| `src/app/api/health/route.ts` (modify) | email flags become validity |
| `src/app/sign-in/page.tsx` (modify) | drop the "not available" notice |
| `tests/unit/config.test.ts` (modify) | email config tests |
| `tests/unit/email.test.ts` (create) | sender and message tests |
| `docs/DEVELOPMENT.md`, `docs/OPERATIONS.md` (modify) | live email and provisioning steps |

---

### Task 1: Email configuration validation

**Files:**
- Modify: `src/lib/config.ts` (append after `serverConfigValidity`)
- Test: `tests/unit/config.test.ts`

**Interfaces:**
- Produces: `readEmailConfig(env: Record<string, string | undefined>): Readonly<{ apiKey: string; from: string }>` (throws `Error("Missing or invalid RESEND_API_KEY" | "Missing or invalid EMAIL_FROM")`); `emailConfigValidity(env): { resend: boolean; emailFrom: boolean }`.

- [x] **Step 1: Write the failing tests.** In `tests/unit/config.test.ts`, extend the import to:

```ts
import {
	emailConfigValidity,
	readEmailConfig,
	readServerConfig,
	requireTestDatabaseUrl,
	serverConfigValidity,
	validConfigBaseline,
} from "../../src/lib/config";
```

and append:

```ts
describe("email configuration", () => {
	const good = {
		RESEND_API_KEY: "re_synthetic_key_123",
		EMAIL_FROM: "קובוב <no-reply@mail.example.org>",
	};
	it("accepts a named sender and a bare address", () => {
		expect(readEmailConfig(good)).toEqual({
			apiKey: "re_synthetic_key_123",
			from: "קובוב <no-reply@mail.example.org>",
		});
		expect(
			readEmailConfig({ ...good, EMAIL_FROM: "no-reply@mail.example.org" }).from,
		).toBe("no-reply@mail.example.org");
	});
	it.each([
		["RESEND_API_KEY", undefined],
		["RESEND_API_KEY", "sk_synthetic"],
		["RESEND_API_KEY", "re_has space"],
		["EMAIL_FROM", undefined],
		["EMAIL_FROM", "no-reply"],
		["EMAIL_FROM", "no-reply@localhost"],
		["EMAIL_FROM", "קובוב <no-reply@mail.example.org"],
		["EMAIL_FROM", "קובוב\n<no-reply@mail.example.org>"],
		["EMAIL_FROM", "a@b@mail.example.org"],
	])("rejects %s=%s without leaking the value", (name, value) => {
		const env = { ...good, [name]: value };
		expect(() => readEmailConfig(env)).toThrow(name);
		try {
			readEmailConfig(env);
		} catch (error) {
			expect(String(error)).not.toContain("synthetic");
			expect(String(error)).not.toContain("mail.example.org");
		}
	});
	it("reports each email setting's validity in isolation", () => {
		expect(emailConfigValidity(good)).toEqual({ resend: true, emailFrom: true });
		expect(emailConfigValidity({ ...good, RESEND_API_KEY: "" })).toEqual({
			resend: false,
			emailFrom: true,
		});
		expect(emailConfigValidity({ ...good, EMAIL_FROM: "x" })).toEqual({
			resend: true,
			emailFrom: false,
		});
		expect(emailConfigValidity({})).toEqual({ resend: false, emailFrom: false });
	});
});
```

- [x] **Step 2: Run to verify failure.** Run: `npx vitest run tests/unit/config.test.ts`. Expected: FAIL, `readEmailConfig is not a function` (or a missing-export type error).

- [x] **Step 3: Implement.** Append to `src/lib/config.ts` after `serverConfigValidity`:

```ts
// Email settings are validated apart from readServerConfig so a missing sender
// never blocks pages or the database. Errors name the setting, never its value.
const senderForm = /^(?:[^<>\r\n]+<([^<>\s]+)>|([^<>\s]+))$/;
const address = /^[^@\s]+@[^@\s]+\.[^@\s.]+$/;
export function readEmailConfig(env: Environment) {
	const apiKey = setting(env, "RESEND_API_KEY");
	if (!/^re_\S+$/.test(apiKey))
		throw new Error("Missing or invalid RESEND_API_KEY");
	const from = setting(env, "EMAIL_FROM");
	const match = /[\r\n]/.test(from) ? null : senderForm.exec(from);
	const sender = match?.[1] ?? match?.[2];
	if (!sender || !address.test(sender))
		throw new Error("Missing or invalid EMAIL_FROM");
	return Object.freeze({ apiKey, from });
}
const validEmailBaseline = Object.freeze({
	RESEND_API_KEY: "re_valid",
	EMAIL_FROM: "valid@mail.valid.example",
});
export function emailConfigValidity(env: Environment) {
	const passes = (name: string) => {
		try {
			readEmailConfig({ ...validEmailBaseline, [name]: env[name] });
			return true;
		} catch {
			return false;
		}
	};
	return {
		resend: passes("RESEND_API_KEY"),
		emailFrom: passes("EMAIL_FROM"),
	};
}
```

- [x] **Step 4: Run to verify pass.** Run: `npx vitest run tests/unit/config.test.ts`. Expected: all tests PASS.

- [x] **Step 5: Commit.**

```bash
git add src/lib/config.ts tests/unit/config.test.ts
git commit -m "feat: validate Resend email settings"
```

---

### Task 2: Resend sender and Hebrew sign-in message

**Files:**
- Modify: `package.json`, `package-lock.json` (add `resend`)
- Modify: `src/locales/he.ts` (add `signInEmail`)
- Create: `src/lib/email.ts`
- Test: `tests/unit/email.test.ts`

**Interfaces:**
- Consumes: `failureCodes(error: unknown): string[]` from `src/lib/failure-codes.ts`.
- Produces:
  - `type EmailClient = { emails: { send(options: { from: string; to: string; subject: string; text: string; html: string }): Promise<{ error: { name?: string; statusCode?: number | null } | null }> } }`
  - `isReservedTestAddress(email: string): boolean`
  - `signInMessage(url: string): { subject: string; text: string; html: string }`
  - `createResendSender(options: { apiKey: string; from: string; client?: EmailClient }): (message: { email: string; url: string }) => Promise<void>`; throws `Error("EMAIL_DELIVERY_FAILED")`.

- [x] **Step 1: Add the dependency.** Run: `npm install resend@^6`. Expected: `resend` appears under `dependencies` in `package.json`.

- [x] **Step 2: Add the copy.** In `src/locales/he.ts`, add this property inside `copy` directly after `sent`:

```ts
	signInEmail: {
		subject: "קישור כניסה לקובוב",
		intro: "ביקשתם להיכנס לאזור המשפחה של קובוב. לכניסה יש לפתוח את הקישור:",
		expiry: "הקישור פועל פעם אחת בלבד ותקף ל־15 דקות.",
		ignore: "אם לא ביקשתם להיכנס, אפשר להתעלם מהודעה זו.",
	},
```

- [x] **Step 3: Write the failing tests.** Create `tests/unit/email.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createResendSender,
	isReservedTestAddress,
	signInMessage,
	type EmailClient,
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
		expect(send).toHaveBeenCalledWith({
			from: "קובוב <no-reply@mail.kobob.example>",
			to: email,
			...signInMessage(url),
		});
	});
	it("skips reserved test addresses without calling Resend", async () => {
		const { client, send } = fakeClient();
		const sendLink = createResendSender({ apiKey: "re_x", from: "a@b.example", client });
		await expect(sendLink({ email: "member@family.test", url })).resolves.toBeUndefined();
		expect(send).not.toHaveBeenCalled();
	});
	it("fails generically and logs codes only when Resend rejects", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const { client } = fakeClient({
			error: { name: "validation_error", statusCode: 422, message: `bad ${email} ${url}` } as never,
		});
		const sendLink = createResendSender({ apiKey: "re_x", from: "a@b.example", client });
		const failure = await sendLink({ email, url }).catch((error: unknown) => error);
		expect(String(failure)).toBe("Error: EMAIL_DELIVERY_FAILED");
		const logged = JSON.stringify(log.mock.calls);
		expect(logged).toContain("name=validation_error");
		expect(logged).toContain("statusCode=422");
		for (const secret of [email, "token=abc", "bad "]) expect(logged).not.toContain(secret);
	});
	it("fails generically when the client throws", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const client: EmailClient = {
			emails: {
				send: async () => {
					throw Object.assign(new Error(`fetch failed for ${email}`), { code: "ECONNRESET" });
				},
			},
		};
		const sendLink = createResendSender({ apiKey: "re_x", from: "a@b.example", client });
		await expect(sendLink({ email, url })).rejects.toThrow(/^EMAIL_DELIVERY_FAILED$/);
		const logged = JSON.stringify(log.mock.calls);
		expect(logged).toContain("code=ECONNRESET");
		expect(logged).not.toContain(email);
	});
});
```

- [x] **Step 4: Run to verify failure.** Run: `npx vitest run tests/unit/email.test.ts`. Expected: FAIL, cannot resolve `../../src/lib/email`.

- [x] **Step 5: Implement.** Create `src/lib/email.ts`:

```ts
import "server-only";
import { Resend } from "resend";
import { copy } from "../locales/he";
import { failureCodes } from "./failure-codes";

// The slice of the Resend SDK this module uses; injectable for unit tests.
export type EmailClient = {
	emails: {
		send(options: {
			from: string;
			to: string;
			subject: string;
			text: string;
			html: string;
		}): Promise<{ error: { name?: string; statusCode?: number | null } | null }>;
	};
};

// RFC 2606 / RFC 6761 names plus test.com (a real domain test fixtures use).
// No member has an address there, so a send is always a mistake; skipping it
// keeps bounces off the sending domain's reputation (the rule Sana uses).
const reservedDomains = new Set(["example.com", "example.net", "example.org", "test.com"]);
const reservedSuffixes = [".test", ".example", ".invalid", ".localhost", ".local"];
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
		resend ??= new Resend(apiKey);
		let codes: string[] | undefined;
		try {
			const { error } = await resend.emails.send({
				from,
				to: email,
				...signInMessage(url),
			});
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
```

- [x] **Step 6: Run to verify pass.** Run: `npx vitest run tests/unit/email.test.ts`. Expected: all PASS. Then `npm run typecheck`. Expected: no errors (if `satisfies`/`as never` in the test trips the checker, keep the runtime shape and adjust only the test's typing).

- [x] **Step 7: Lint and format.** Run: `npx biome check --write src/lib/email.ts src/locales/he.ts tests/unit/email.test.ts` then `npm run lint`. Expected: clean. `git status` must show only this task's files plus `package*.json`.

- [x] **Step 8: Commit.**

```bash
git add package.json package-lock.json src/locales/he.ts src/lib/email.ts tests/unit/email.test.ts
git commit -m "feat: Resend sender for Hebrew sign-in links"
```

---

### Task 3: Wire the sender into runtime, health and the sign-in page

**Files:**
- Modify: `src/lib/runtime.ts:14-30`
- Modify: `src/app/api/health/route.ts:19-31`
- Modify: `src/app/sign-in/page.tsx`, `src/locales/he.ts` (remove `deliveryNotice`)
- Test: `tests/e2e/health.spec.ts` (behaviour unchanged; rerun), `tests/e2e/sign-in.spec.ts` (rerun)

**Interfaces:**
- Consumes: `readEmailConfig`, `emailConfigValidity` (Task 1); `createResendSender` (Task 2).
- Produces: no new exports.

- [x] **Step 1: Wire the runtime.** Replace `accessSystem()` in `src/lib/runtime.ts` and its imports so the file reads:

```ts
import "server-only";
import { readEmailConfig, readServerConfig } from "./config";
import { createDatabase, type Database } from "./database";
import { createAuthSystem } from "./auth-system";
import { createResendSender } from "./email";
let instance: ReturnType<typeof createAuthSystem> | undefined;
let db: Database | undefined;
// One client (and connection pool) per server instance, shared by the access
// system and the health check, so the probe exercises the same driver path.
export function database(): Database {
	if (db) return db;
	db = createDatabase(readServerConfig(process.env).databaseUrl);
	return db;
}
// Live mail only in production with valid settings; development and tests
// never construct the Resend client. A missing setting is visible on
// /api/health (resend/emailFrom) and in the log below.
function linkSender() {
	if (process.env.NODE_ENV === "production") {
		try {
			const email = readEmailConfig(process.env);
			return createResendSender({ apiKey: email.apiKey, from: email.from });
		} catch {
			console.error("[email] delivery not configured");
		}
	}
	return async () => {
		throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
	};
}
export function accessSystem() {
	if (instance) return instance;
	const config = readServerConfig(process.env);
	instance = createAuthSystem({
		db: database(),
		config,
		sendLink: linkSender(),
		// The member sees the same confirmation either way (no membership
		// oracle); the sender has already logged codes for a provider failure.
		onDeliveryError: () => {
			console.error("[email] sign-in link not delivered");
		},
	});
	return instance;
}
```

(Keep any lines below `accessSystem()` in the current file unchanged.)

- [x] **Step 2: Health flags become validity.** In `src/app/api/health/route.ts`, change the import to `import { emailConfigValidity, serverConfigValidity } from "@/lib/config";`, replace the comment line `// Email is not wired yet (src/lib/runtime.ts), so its keys are informational.` with `// Email validity never affects status: pages and the database work without it.`, and replace `configPresence` with:

```ts
function configValidity() {
	return {
		...serverConfigValidity(process.env),
		...emailConfigValidity(process.env),
	};
}
```

and in `GET` use `config: configValidity(),`.

- [x] **Step 3: Remove the preview notice.** In `src/app/sign-in/page.tsx` delete the line `<p>{copy.deliveryNotice}</p>`. In `src/locales/he.ts` delete the `deliveryNotice: …,` line. Run `grep -rn deliveryNotice src tests` — expected: no output.

- [x] **Step 4: Verify.** Run, in order:
  - `npm run lint` — expected clean.
  - `npm run typecheck` — expected no errors.
  - `npm run test:unit` — expected all PASS.
  - `npm run test:e2e` — expected all PASS (health still reports booleans; `resend`/`emailFrom` are false in CI because neither is set).
  Then `git status`; if `next-env.d.ts` or `tests/e2e/sign-in.spec.ts` changed without your edit, `git checkout -- <file>`.

- [x] **Step 5: Commit.**

```bash
git add src/lib/runtime.ts src/app/api/health/route.ts src/app/sign-in/page.tsx src/locales/he.ts
git commit -m "feat: send sign-in links through Resend in production"
```

---

### Task 4: Documentation and pull request

**Files:**
- Modify: `docs/DEVELOPMENT.md` (the "Live email is deliberately disconnected" paragraph, around line 77)
- Modify: `docs/OPERATIONS.md` (provisioning table and the closing "Live email (Resend)… later slices" paragraph, around lines 85-121)

- [x] **Step 1: DEVELOPMENT.md.** Replace the paragraph starting "Live email is deliberately disconnected" with:

```markdown
Live email is sent only in production, through Resend, when `RESEND_API_KEY`
and `EMAIL_FROM` pass `readEmailConfig` (`src/lib/runtime.ts`). Development
and tests never construct the Resend client: browser tests issue synthetic
links through an injected mock sender, and there is no test mailbox or
production bypass. Reserved test domains (`example.*`, `test.com`, `.test`,
`.invalid`, `.local`…) are never sent to, even in production. Delivery
failures are logged as codes only; the member always sees the same
confirmation so the form cannot reveal membership.
```

- [x] **Step 2: OPERATIONS.md.** Add two rows to the provisioning table:

```markdown
| `RESEND_API_KEY` | Resend key, sending access only, restricted to `mail.kobob.org` | `KOBOB_RESEND_API_KEY` |
| `EMAIL_FROM` | plain setting: `קובוב <no-reply@mail.kobob.org>` | not a secret |
```

and replace the paragraph "Live email (Resend) and private media (R2) are later slices…" with:

```markdown
### Email delivery (Resend)

Sign-in links go out from `mail.kobob.org` (design:
[2026-11-02-resend-email-design.md](superpowers/specs/2026-11-02-resend-email-design.md)).
After the release that ships the code, Yoram runs:

1. Resend: add domain `mail.kobob.org`; create an API key with sending access
   restricted to it.
2. GoDaddy DNS for `kobob.org`: add the SPF, DKIM and DMARC records Resend
   lists; wait until Resend shows the domain verified.
3. Merge the ops map PR for `KOBOB_RESEND_API_KEY`, then from `~/ops`:
   `node scripts/secrets.mjs rotate KOBOB_RESEND_API_KEY --apply`.
4. Vercel Production: set `EMAIL_FROM` (value in the table above), then
   `gh workflow run vercel-deploy.yml --repo hetzy8/kobob --ref main`.
5. Check `/api/health` shows `resend` and `emailFrom` true.
6. `npm run admin:bootstrap` against production, then sign in with that
   address to prove delivery end to end.

Private media (R2) is a later slice with its own map entries.
```

- [x] **Step 3: Check links.** Run: `ls docs/superpowers/specs/2026-11-02-resend-email-design.md`. Expected: file exists.

- [x] **Step 4: Commit.**

```bash
git add docs/DEVELOPMENT.md docs/OPERATIONS.md
git commit -m "docs: live email delivery and Resend provisioning steps"
```

- [x] **Step 5: Push and open the PR into `dev`.**

```bash
git push -u origin feat/resend-email
gh pr create --repo hetzy8/kobob --base dev --title "feat: sign-in email delivery through Resend" --body "Implements docs/superpowers/specs/2026-11-02-resend-email-design.md (plan: docs/superpowers/plans/2026-11-02-resend-email.md). Summarize what changed, the verification results, and the owner steps from OPERATIONS.md 'Email delivery (Resend)'. End with the session's PR attribution lines."
```

(Write the body as real prose, not this instruction text.)

- [x] **Step 6: Review.** Dispatch a fresh-subagent code review of the PR diff (hetzy8 standards: code PRs get one), address findings, and wait for the `verify` check to pass.
