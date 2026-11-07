# Ops and Backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Website data survives the loss of Neon, shown by a real restore, and the findings that block inviting people are closed: the sign-in lockout, the missing runbook and the development wording.

**Architecture:** A scheduled GitHub workflow in a protected Environment runs a tested shell script that streams `pg_dump` through `gzip` and `age` to a private, Object-Locked Backblaze B2 bucket. An operator script verifies a restore read-only against scratch and production. Sign-in gains a per-client address and a read before any counter moves.

**Tech Stack:** GitHub Actions, bash, `pg_dump` 17, `age`, `rclone`, Backblaze B2, Next.js 16, Prisma 7, Vitest, Playwright.

**Spec:** [2026-11-06-ops-backups-design.md](../specs/2026-11-06-ops-backups-design.md), approved by Yoram with its Hebrew wording on 2026-11-06.

## Global Constraints

- This repository is public: no real names, filenames, URLs, Drive ids, connection strings, bucket contents or exports in Git, tests or logs. Use synthetic fixtures. Reports go outside the repository.
- Workflow logs are public: print sizes and object names only, never row data or connection strings.
- Encryption is required. A run with no `AGE_PUBLIC_KEY` fails instead of uploading plain data.
- A dump under half the previous size is uploaded anyway and the run fails.
- No CI key can delete. Expiry is done by B2 lifecycle rules: `daily/` 32 days, `monthly/` 366 days, hide then delete one day later. Default Object Lock 30 days.
- Secrets live in GitHub Environment `backup`, limited to `main`. Actions are pinned by commit, as in `ci.yml`. The job has `contents: read` only.
- Yoram generates and enters every secret value in Yoram's own terminal; agents never see them. Agents do not provision services, change Vercel, push to `dev`/`main`, or touch `.env*` files; give Yoram the exact commands.
- The refusal shown to users at sign-in does not change. Only the three Hebrew changes in the spec are approved; any other Hebrew needs Yoram's approval.
- Commands for Yoram use short lines, one per line, because long pastes get split in Yoram's terminal.
- Run `npx biome format --write` on new TypeScript files before committing; the plan's code shows content, not final wrapping.
- Do not stage `next-env.d.ts`. In Bash avoid `$VAR` expansion, computed program names and inline `node -e`. Pin exact dependency versions.
- Test commands need the isolated database: `npm run db:test:up`, `TEST_DATABASE_URL='postgresql://kobob_test:synthetic-local-test-only@127.0.0.1:55439/kobob_test' npm run db:test:migrate`, and the same prefix on tests.
- Branch from `origin/dev`: `feat/ops-backups`, after PR #41 merges, because Task 5 edits rows that PR adds. This plan file is the branch's first commit. PR with `gh pr create --base dev`. No migration in this work. Never request a Copilot review.

## Decisions the spec left to this plan

- **The backup logic is a script, not inline YAML:** `scripts/db-backup.sh`, tested with stubbed tools, because silent failure is the main risk. The workflow checks out `main` and runs it.
- **A dump under 1,000 bytes is refused and not uploaded:** it cannot be a real database. The half-size rule applies above that.
- **`pg_dump` stderr is not printed,** since it can contain the host. The script reports only a class: permission denied, or a generic failure.
- **Object Lock mode is Governance:** it stops the CI key and mistakes, and only the owner's master key could override it.
- **A size check that cannot run fails the run (changed during Task 3 review):** the dump is still uploaded, and only an empty listing or rclone's "directory not found" status counts as a first run. If real B2 reports an empty prefix differently, the first run goes red with the dump in place; Task 7's first dump (step 8) checks this. Known `pg_dump` failure classes stop at once with fixed messages. The repository's `scripts/db-backup.sh`, `scripts/verify-restore.ts` and `docs/OPERATIONS.md` supersede the code and text in Tasks 3 to 5 below.
- **The `hetzy8/ops` tooling writes repository secrets only.** Task 6 adds an optional `environment` to GitHub targets, as a separate ops PR.
- **`x-vercel-forwarded-for` is confirmed by a probe after release** (Task 7, step 9). A failed probe weakens the client limit but not the global limit, so it does not block the release; it comes back to Yoram.
- **Recovery also repoints the backup role (found in final review, not in the spec):** otherwise backups keep dumping the old database and stay green.

## File map

| File | Responsibility |
|---|---|
| `src/lib/client-address.ts` | Read the client address from Vercel's header; IPv6 reduced to /64 |
| `src/lib/auth-system.ts`, `src/lib/runtime.ts` | Refuse an over-limit client before any counter moves; pass the address |
| `src/locales/he.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `tests/fixtures/he-interface.json` | Remove development wording |
| `scripts/db-backup.sh`, `.github/workflows/db-backup.yml` | Dump, encrypt, upload |
| `src/ops/verify-restore.ts`, `scripts/verify-restore.ts` | Read-only restore report and its invariants |
| `docs/OPERATIONS.md`, `.claude/security-audit.md` | Runbook, setup, drill, evidence rule, corrected routes |
| `hetzy8/ops`: `scripts/secrets/map.mjs`, `scripts/secrets/platforms.mjs`, `secrets/targets.json` | Environment secrets |

---

### Task 1: Per-client sign-in limit

**Files:**
- Create: `src/lib/client-address.ts`, `tests/unit/client-address.test.ts`
- Modify: `src/lib/auth-system.ts:177-205`, `src/lib/runtime.ts`, `tests/integration/sign-in.test.ts`

**Interfaces:**
- Produces: `clientAddressFrom(request: Request): string`, empty when no usable address exists. `createAuthSystem` already accepts `clientAddress?: (request: Request) => string` and falls back to a shared bucket on an empty string.

- [ ] **Step 1: Write the failing unit test.** `tests/unit/client-address.test.ts`:

```ts
import { expect, it } from "vitest";
import { clientAddressFrom } from "../../src/lib/client-address";

const from = (value?: string) =>
	clientAddressFrom(
		new Request("https://valid.example/", {
			headers: value ? { "x-vercel-forwarded-for": value } : {},
		}),
	);

it("reads an IPv4 address", () => {
	expect(from("203.0.113.9")).toBe("203.0.113.9");
});
it("takes the first address in a list", () => {
	expect(from("203.0.113.9, 10.0.0.1")).toBe("203.0.113.9");
});
it("reduces IPv6 to its /64, however it is written", () => {
	const expected = "2001:db8:1:2::/64";
	expect(from("2001:db8:1:2:3:4:5:6")).toBe(expected);
	expect(from("2001:db8:1:2::9")).toBe(expected);
	expect(from("2001:0DB8:0001:0002::9")).toBe(expected);
	expect(from("2001:db8::1")).toBe("2001:db8:0:0::/64");
	expect(from("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
});
it("treats an IPv4-mapped address as IPv4", () => {
	expect(from("::ffff:203.0.113.9")).toBe("203.0.113.9");
});
it.each([undefined, "", "not-an-address", "999.1.1.1"])(
	"returns nothing for %s",
	(value) => {
		expect(from(value)).toBe("");
	},
);
it("ignores x-forwarded-for", () => {
	const request = new Request("https://valid.example/", {
		headers: { "x-forwarded-for": "203.0.113.9" },
	});
	expect(clientAddressFrom(request)).toBe("");
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/unit/client-address.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Create `src/lib/client-address.ts`:**

```ts
import { isIP } from "node:net";

function ipv6Prefix(address: string) {
	const [head, tail] = address.split("%")[0].toLowerCase().split("::");
	const left = head ? head.split(":") : [];
	const right = tail ? tail.split(":") : [];
	const groups =
		tail === undefined
			? left
			: [
					...left,
					...Array(8 - left.length - right.length).fill("0"),
					...right,
				];
	const prefix = groups
		.slice(0, 4)
		.map((group) => Number.parseInt(group, 16).toString(16));
	return `${prefix.join(":")}::/64`;
}

// Vercel sets this header itself; confirmed on production by the probe in
// the ops plan. Empty means the caller's shared fallback bucket, which only
// local runs reach. A whole /64 counts as one client, since one household can
// hold all of it.
export function clientAddressFrom(request: Request): string {
	const first =
		request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "";
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(first)?.[1] ?? first;
	const version = isIP(mapped);
	if (version === 4) return mapped;
	if (version === 6) return ipv6Prefix(mapped);
	return "";
}
```

- [ ] **Step 4: Run it.** Same command. Expected: PASS.

- [ ] **Step 5: Write the failing integration tests.** Append to `tests/integration/sign-in.test.ts`:

```ts
describe("per-client issuance limits", () => {
	const perClient = () =>
		createAuthSystem({
			db,
			config,
			sendLink: async (message) => {
				deliveries.push(message);
			},
			clientAddress: (request) => request.headers.get("x-test-client") ?? "",
		});
	function from(client: string, email: string) {
		const request = post("/api/access/request", { email });
		request.headers.set("x-test-client", client);
		return request;
	}
	const globalCount = async () =>
		(await db.rateLimit.findFirst({ where: { key: { startsWith: "global:" } } }))
			?.count;

	it("lets another client sign in after one client goes far over its limit", async () => {
		await invite();
		for (let n = 0; n < 60; n++)
			await perClient().handle(from("stranger", `unknown${n}@example.test`));
		expect(await globalCount()).toBe(20);
		await perClient().handle(from("relative", "family@example.test"));
		expect(deliveries.map(({ email }) => email)).toEqual([
			"family@example.test",
		]);
	});

	it("creates no rows for a client already over its limit", async () => {
		for (let n = 0; n < 40; n++)
			await perClient().handle(from("stranger", `unknown${n}@example.test`));
		expect(await db.rateLimit.count()).toBe(22);
	});

	it("still refuses at the client limit", async () => {
		await db.user.createMany({
			data: Array.from({ length: 22 }, (_, n) => ({
				email: `family${n}@example.test`,
			})),
		});
		for (let n = 0; n < 22; n++)
			await perClient().handle(from("one-client", `family${n}@example.test`));
		expect(deliveries).toHaveLength(20);
	});

	it("still refuses at the global limit across many clients", async () => {
		await db.user.createMany({
			data: Array.from({ length: 52 }, (_, n) => ({
				email: `family${n}@example.test`,
			})),
		});
		for (let n = 0; n < 52; n++)
			await perClient().handle(from(`client${n}`, `family${n}@example.test`));
		expect(deliveries).toHaveLength(50);
	});

	it("still refuses at the per-address limit across clients", async () => {
		await invite();
		for (let n = 0; n < 5; n++)
			await perClient().handle(from(`client${n}`, "family@example.test"));
		expect(deliveries).toHaveLength(3);
	});

	it("shares one bucket when no address is available", async () => {
		await db.user.createMany({
			data: Array.from({ length: 22 }, (_, n) => ({
				email: `family${n}@example.test`,
			})),
		});
		for (let n = 0; n < 22; n++)
			await perClient().handle(from("", `family${n}@example.test`));
		expect(deliveries).toHaveLength(20);
	});
});
```

- [ ] **Step 6: Run them.** `TEST_DATABASE_URL='...' npx vitest run tests/integration/sign-in.test.ts`. Expected: only the first new test FAILS (the global count reaches 60, and the relative gets no link). The others pass already; they guard the change.

- [ ] **Step 7: Implement in `src/lib/auth-system.ts`.** Replace the start of `issueAllowed`:

```ts
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
```

Leave the loop after it unchanged.

- [ ] **Step 8: Pass the address in `src/lib/runtime.ts`.** Add `import { clientAddressFrom } from "./client-address";` and, in the `createAuthSystem` call after `config,`, add `clientAddress: clientAddressFrom,`.

- [ ] **Step 9: Run the whole sign-in suite.** `TEST_DATABASE_URL='...' npx vitest run tests/integration/sign-in.test.ts tests/unit/client-address.test.ts`. Expected: PASS, including the existing `bounds throttle storage` test.

- [ ] **Step 10: Commit.** Stage the listed files. `git commit -m "fix: stop one client exhausting the sign-in limit for everyone"`.

### Task 2: Remove development wording

**Files:**
- Modify: `tests/fixtures/he-interface.json:14`, `tests/e2e/sign-in.spec.ts`, `src/locales/he.ts:18,21,23`, `src/app/layout.tsx:19-21`, `src/app/globals.css:31-37`

- [ ] **Step 1: Write the failing browser expectation.** In `tests/fixtures/he-interface.json` change `"title"` to `"יקי חץ"`. In `tests/e2e/sign-in.spec.ts`, in the test `public foundation has Hebrew RTL root...`, directly after `await page.goto("/");`, add:

```ts
	await expect(page.locator("body")).not.toContainText("גרסת פיתוח");
```

- [ ] **Step 2: Run it.** `TEST_DATABASE_URL='...' npm run test:e2e -- tests/e2e/sign-in.spec.ts`. Expected: FAIL on the banner text.

- [ ] **Step 3: Change the wording, exactly as approved.** In `src/locales/he.ts`:

```ts
	memberHelp:
		"הוספה וחידוש גישה מחייבים אימות דוא״ל. שינוי כתובת או ביטול גישה מבטלים חיבורים וקישורי כניסה קודמים.",
```

Delete the `preview` line. Set `documentTitle: "יקי חץ",`.

In `src/app/layout.tsx` delete:

```tsx
				<div className="preview" lang="he">
					{copy.preview}
				</div>
```

In `src/app/globals.css` delete the whole `.preview { ... }` block.

- [ ] **Step 4: Run it and typecheck.** Same test command, then `npm run typecheck`. Expected: PASS. If another browser test fails on the title, it reads the fixture and passes after this change; investigate anything else.

- [ ] **Step 5: Commit.** Stage the listed files. `git commit -m "fix: remove development wording from the site"`.

### Task 3: Backup script and workflow

**Files:**
- Create: `scripts/db-backup.sh`, `.github/workflows/db-backup.yml`, `tests/unit/db-backup-script.test.ts`

**Interfaces:**
- Produces: `bash scripts/db-backup.sh`, reading `BACKUP_DATABASE_URL`, `B2_KEY_ID`, `B2_KEY`, `B2_BUCKET`, `AGE_PUBLIC_KEY`. Optional, for tests: `PG_DUMP_BIN`, `BACKUP_RETRY_SECONDS`. Exit 0 only when the dump uploaded and its size looked normal.

- [ ] **Step 1: Write the failing test.** `tests/unit/db-backup-script.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

const DATABASE_URL = "postgresql://role:synthetic-password@db.example.test/kobob";
const month = new Date().toISOString().slice(0, 7);
let dir: string;

function stub(name: string, body: string) {
	const path = join(dir, name);
	writeFileSync(path, `#!/bin/sh\n${body}\n`);
	chmodSync(path, 0o755);
}
const log = () => {
	const path = join(dir, "rclone.log");
	return existsSync(path) ? readFileSync(path, "utf8") : "";
};
const uploads = () =>
	log()
		.split("\n")
		.filter((line) => line.startsWith("copyto"))
		.map((line) => line.split(" ")[2]);

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "db-backup-"));
	stub(
		"rclone",
		`echo "$*" >> "$STUB_DIR/rclone.log"
case "$1 $2" in
  lsf*daily/) [ -f "$STUB_DIR/daily.txt" ] && cat "$STUB_DIR/daily.txt" ;;
  lsf*monthly/) [ -f "$STUB_DIR/monthly.txt" ] && cat "$STUB_DIR/monthly.txt" ;;
esac
exit 0`,
	);
	stub("age", 'echo "$*" > "$STUB_DIR/age.args"\ncat');
	// 5,000 random bytes barely compress, so the size is known.
	stub(
		"pg_dump",
		`count=$(cat "$STUB_DIR/attempts" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$STUB_DIR/attempts"
if [ "$count" -le "\${STUB_DUMP_FAILS:-0}" ]; then
  echo "\${STUB_DUMP_ERROR:-could not connect to $1}" >&2
  exit 1
fi
head -c "\${STUB_DUMP_BYTES:-5000}" /dev/urandom`,
	);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(env: Record<string, string> = {}) {
	const result = spawnSync("bash", ["scripts/db-backup.sh"], {
		encoding: "utf8",
		env: {
			PATH: `${dir}:${process.env.PATH}`,
			STUB_DIR: dir,
			PG_DUMP_BIN: join(dir, "pg_dump"),
			BACKUP_RETRY_SECONDS: "0",
			BACKUP_DATABASE_URL: DATABASE_URL,
			B2_KEY_ID: "synthetic-key-id",
			B2_KEY: "synthetic-key",
			B2_BUCKET: "synthetic-bucket",
			AGE_PUBLIC_KEY: "age1synthetic",
			...env,
		},
	});
	return {
		status: result.status,
		output: `${result.stdout}${result.stderr}`,
	};
}

it("encrypts and uploads to daily and, when the month has none, to monthly", () => {
	const { status, output } = run();
	expect(status).toBe(0);
	const [daily, monthly] = uploads();
	expect(daily).toMatch(
		new RegExp(
			`^b2:synthetic-bucket/daily/kobob-${month}-\\d{2}T\\d{2}-\\d{2}-\\d{2}Z\\.sql\\.gz\\.age$`,
		),
	);
	expect(monthly).toBe(daily.replace("/daily/", "/monthly/"));
	expect(readFileSync(join(dir, "age.args"), "utf8").trim()).toBe(
		"-r age1synthetic",
	);
	expect(output).toContain("Uploaded daily/kobob-");
});

it("skips monthly when the month already has a dump", () => {
	writeFileSync(
		join(dir, "monthly.txt"),
		`kobob-${month}-01T03-00-00Z.sql.gz.age\n`,
	);
	expect(run().status).toBe(0);
	expect(uploads()).toHaveLength(1);
});

it("uploads to monthly when only earlier months have a dump", () => {
	writeFileSync(
		join(dir, "monthly.txt"),
		"kobob-2001-01-01T03-00-00Z.sql.gz.age\n",
	);
	expect(run().status).toBe(0);
	expect(uploads()).toHaveLength(2);
});

it.each([
	"BACKUP_DATABASE_URL",
	"B2_KEY_ID",
	"B2_KEY",
	"B2_BUCKET",
	"AGE_PUBLIC_KEY",
])("fails without %s and uploads nothing", (name) => {
	const { status, output } = run({ [name]: "" });
	expect(status).toBe(1);
	expect(output).toContain(`missing secret ${name}`);
	expect(uploads()).toEqual([]);
	expect(existsSync(join(dir, "attempts"))).toBe(false);
});

it("retries while Neon wakes", () => {
	const { status } = run({ STUB_DUMP_FAILS: "5" });
	expect(status).toBe(0);
	expect(readFileSync(join(dir, "attempts"), "utf8").trim()).toBe("6");
});

it("fails after six attempts, uploads nothing and never prints the database address", () => {
	const { status, output } = run({ STUB_DUMP_FAILS: "6" });
	expect(status).toBe(1);
	expect(uploads()).toEqual([]);
	expect(output).not.toContain("synthetic-password");
	expect(output).not.toContain("db.example.test");
});

it("stops at once when the role cannot read a table", () => {
	const { status, output } = run({
		STUB_DUMP_FAILS: "6",
		STUB_DUMP_ERROR: "ERROR: permission denied for table SomeTable",
	});
	expect(status).toBe(1);
	expect(output).toContain("permission denied");
	expect(output).not.toContain("SomeTable");
	expect(readFileSync(join(dir, "attempts"), "utf8").trim()).toBe("1");
	expect(uploads()).toEqual([]);
});

it("refuses a dump too small to be real", () => {
	const { status } = run({ STUB_DUMP_BYTES: "10" });
	expect(status).toBe(1);
	expect(uploads()).toEqual([]);
});

it("uploads a dump under half the previous size, then fails", () => {
	writeFileSync(
		join(dir, "daily.txt"),
		"1000000 kobob-2001-01-01T03-00-00Z.sql.gz.age\n",
	);
	const { status, output } = run();
	expect(status).toBe(1);
	expect(uploads().length).toBeGreaterThan(0);
	expect(output).toContain("under half");
});

it("compares with the newest previous dump, not the largest", () => {
	writeFileSync(
		join(dir, "daily.txt"),
		"1000000 kobob-2001-01-01T03-00-00Z.sql.gz.age\n6000 kobob-2001-01-02T03-00-00Z.sql.gz.age\n",
	);
	expect(run().status).toBe(0);
});

it("logs no secrets on success", () => {
	const { output } = run();
	for (const secret of ["synthetic-password", "synthetic-key"])
		expect(output).not.toContain(secret);
});
```

- [ ] **Step 2: Run it.** `npx vitest run tests/unit/db-backup-script.test.ts`. Expected: FAIL, the script does not exist.

- [ ] **Step 3: Create `scripts/db-backup.sh`,** then `chmod +x scripts/db-backup.sh`:

```bash
#!/usr/bin/env bash
# Encrypted database dump to Backblaze B2 (spec 2026-11-06). Workflow logs are
# public: print sizes and object names only. pg_dump's stderr stays in a file,
# because it can name the host.
set -euo pipefail

missing=0
for name in BACKUP_DATABASE_URL B2_KEY_ID B2_KEY B2_BUCKET AGE_PUBLIC_KEY; do
	if [ -z "${!name:-}" ]; then
		echo "::error::missing secret $name"
		missing=1
	fi
done
[ "$missing" = "0" ] || exit 1

pg_dump_bin="${PG_DUMP_BIN:-/usr/lib/postgresql/17/bin/pg_dump}"
retry_seconds="${BACKUP_RETRY_SECONDS:-20}"
export PGCONNECT_TIMEOUT=20
export RCLONE_CONFIG_B2_TYPE=b2
export RCLONE_CONFIG_B2_ACCOUNT="$B2_KEY_ID"
export RCLONE_CONFIG_B2_KEY="$B2_KEY"

stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
month="${stamp:0:7}"
name="kobob-${stamp}.sql.gz.age"
remote="b2:${B2_BUCKET}"
umask 077
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
dump="$workdir/$name"
errors="$workdir/errors"

# `lsf` can exit non-zero on a prefix with no files yet. An unreadable listing
# costs only a skipped size check or an extra monthly copy, and a real access
# problem fails the upload below.
daily="$(rclone lsf "$remote/daily/" --files-only --format sp --separator ' ' 2>/dev/null || true)"
previous="$(printf '%s\n' "$daily" | sort -k2 | tail -1 | cut -d' ' -f1)"

ok=0
for attempt in 1 2 3 4 5 6; do
	if "$pg_dump_bin" "$BACKUP_DATABASE_URL" --no-owner --no-privileges 2>"$errors" |
		gzip -9 | age -r "$AGE_PUBLIC_KEY" >"$dump"; then
		ok=1
		break
	fi
	if grep -qi "permission denied" "$errors"; then
		echo "::error::the backup role cannot read every table (permission denied)"
		exit 1
	fi
	echo "Dump attempt $attempt failed (Neon may be waking)"
	sleep "$retry_seconds"
done
if [ "$ok" != "1" ]; then
	echo "::error::dump failed after 6 attempts"
	exit 1
fi

bytes="$(wc -c <"$dump" | tr -d ' ')"
echo "Dump size: $bytes bytes (previous: ${previous:-none})"
if [ "$bytes" -lt 1000 ]; then
	echo "::error::dump is only $bytes bytes; not uploaded"
	exit 1
fi

rclone copyto "$dump" "$remote/daily/$name"
echo "Uploaded daily/$name"

monthly="$(rclone lsf "$remote/monthly/" --files-only 2>/dev/null || true)"
case "$monthly" in
*"kobob-${month}-"*) ;;
*)
	rclone copyto "$dump" "$remote/monthly/$name"
	echo "Uploaded monthly/$name"
	;;
esac

if [ -n "$previous" ] && [ "$previous" -gt 0 ] && [ "$bytes" -lt $((previous / 2)) ]; then
	echo "::error::dump is under half the previous size ($bytes of $previous bytes); uploaded anyway, please check it"
	exit 1
fi
```

- [ ] **Step 4: Run the test.** Same command. Expected: PASS. It must pass on macOS bash 3.2 and on the CI runner.

- [ ] **Step 5: Create `.github/workflows/db-backup.yml`.** Use the same `actions/checkout` commit as `ci.yml` (check it with `grep -n "actions/checkout" .github/workflows/ci.yml`; `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5` when this was written):

```yaml
name: DB Backup
# Daily encrypted dump to Backblaze B2 (docs/OPERATIONS.md → Database backup).
# Schedules run only from main, and the backup Environment admits only main.
on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch: {}
permissions:
  contents: read
concurrency:
  group: db-backup
  cancel-in-progress: false
jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: backup
    steps:
      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5
        with:
          persist-credentials: false
      - name: Install tools
        run: |
          set -euo pipefail
          # pg_dump refuses a server newer than itself; matches Neon's major.
          sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
          curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
          sudo apt-get update -qq
          sudo apt-get install -y -qq postgresql-client-17 age rclone
          /usr/lib/postgresql/17/bin/pg_dump --version
      - name: Dump, encrypt and upload
        env:
          BACKUP_DATABASE_URL: ${{ secrets.BACKUP_DATABASE_URL }}
          B2_KEY_ID: ${{ secrets.B2_KEY_ID }}
          B2_KEY: ${{ secrets.B2_KEY }}
          B2_BUCKET: ${{ secrets.B2_BUCKET }}
          AGE_PUBLIC_KEY: ${{ secrets.AGE_PUBLIC_KEY }}
        run: bash scripts/db-backup.sh
```

- [ ] **Step 6: Lint the workflow.** `docker run --rm -v "$(pwd):/repo" -w /repo rhysd/actionlint:1.7.7 -color .github/workflows/db-backup.yml`. Expected: no output, exit 0. (If the command guard objects to `$(pwd)`, give the absolute path.)

- [ ] **Step 7: Commit.** Stage `scripts/db-backup.sh`, `.github/workflows/db-backup.yml` and the test. `git commit -m "feat: add the encrypted daily database backup"`.

### Task 4: Restore verification

**Files:**
- Create: `src/ops/verify-restore.ts`, `scripts/verify-restore.ts`, `tests/integration/verify-restore.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createArchiveReader(db).getPublicItem(id)`, `createDatabase(url)`.
- Produces: `verifyRestore(db: Database, migrationNames: string[]): Promise<RestoreReport>`; `type RestoreReport = { latestAppliedMigration: string | null; newestMigration: string | null; tables: Record<string, number>; itemsByOriginAndVisibility: Record<string, number>; problems: string[] }`; `npm run verify:restore`.

- [ ] **Step 1: Write the failing test.** `tests/integration/verify-restore.test.ts`:

```ts
import { readdirSync } from "node:fs";
import { afterAll, beforeEach, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../../src/lib/config";
import { createDatabase } from "../../src/lib/database";
import { verifyRestore } from "../../src/ops/verify-restore";

const db = createDatabase(requireTestDatabaseUrl(process.env));
const migrations = readdirSync("prisma/migrations", {
	withFileTypes: true,
})
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name);

beforeEach(async () => {
	await db.item.deleteMany();
});
afterAll(async () => {
	await db.item.deleteMany();
	await db.$disconnect();
});

async function item(visibility: "public" | "private", published: boolean) {
	const created = await db.item.create({ data: { visibility } });
	const revision = await db.itemRevision.create({
		data: {
			itemId: created.id,
			title: "Synthetic title",
			types: ["other"],
			authorId: "synthetic",
		},
	});
	return db.item.update({
		where: { id: created.id },
		data: {
			workingRevisionId: revision.id,
			...(published
				? { publishedRevisionId: revision.id, publishedAt: new Date() }
				: {}),
		},
	});
}

it("reports counts and no problems for a healthy database", async () => {
	await item("public", true);
	await item("private", false);
	const report = await verifyRestore(db, migrations);
	expect(report.problems).toEqual([]);
	expect(report.latestAppliedMigration).toBe(report.newestMigration);
	expect(report.tables.Item).toBe(2);
	expect(report.tables._prisma_migrations).toBeGreaterThan(0);
	expect(report.itemsByOriginAndVisibility).toEqual({
		"family/private": 1,
		"family/public": 1,
	});
});

it("never includes item content", async () => {
	await item("public", true);
	await item("private", false);
	const report = await verifyRestore(db, migrations);
	expect(JSON.stringify(report)).not.toContain("Synthetic title");
});

it("reports a schema behind the newest migration", async () => {
	await item("public", true);
	await item("private", false);
	const report = await verifyRestore(db, [
		...migrations,
		"29990101000000_future",
	]);
	expect(report.newestMigration).toBe("29990101000000_future");
	expect(report.problems).toContainEqual(
		expect.stringContaining("migration"),
	);
});

it("reports a public item with no published revision", async () => {
	await item("public", false);
	await item("private", false);
	const report = await verifyRestore(db, migrations);
	expect(report.problems).toContain(
		"1 public item(s) have no published revision",
	);
});

it("reports a private item with a published revision", async () => {
	await item("public", true);
	await item("private", true);
	const report = await verifyRestore(db, migrations);
	expect(report.problems).toContain(
		"1 private item(s) have a published revision",
	);
});

it("reports when there is nothing to check through the public reader", async () => {
	const report = await verifyRestore(db, migrations);
	expect(report.problems).toContain("no public item to read");
	expect(report.problems).toContain("no private item to read");
});
```

- [ ] **Step 2: Run it.** `TEST_DATABASE_URL='...' npx vitest run tests/integration/verify-restore.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Create `src/ops/verify-restore.ts`:**

```ts
import type { Database } from "../lib/database";
import { createArchiveReader } from "../services/archive";

export type RestoreReport = {
	latestAppliedMigration: string | null;
	newestMigration: string | null;
	tables: Record<string, number>;
	itemsByOriginAndVisibility: Record<string, number>;
	problems: string[];
};

// Counts and identifiers of migrations only: the report is compared by hand
// and must never carry content.
export async function verifyRestore(
	db: Database,
	migrationNames: string[],
): Promise<RestoreReport> {
	const problems: string[] = [];

	const [applied] = await db.$queryRaw<{ migration_name: string }[]>`
		SELECT migration_name FROM "_prisma_migrations"
		WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
		ORDER BY migration_name DESC LIMIT 1`;
	const latestAppliedMigration = applied?.migration_name ?? null;
	const newestMigration = [...migrationNames].sort().at(-1) ?? null;
	if (latestAppliedMigration !== newestMigration)
		problems.push(
			`latest applied migration ${latestAppliedMigration} is not the newest ${newestMigration}`,
		);

	const names = await db.$queryRaw<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
	const tables: Record<string, number> = {};
	for (const { tablename } of names) {
		// Names come from the catalog, not from input.
		const [row] = await db.$queryRawUnsafe<{ count: number }[]>(
			`SELECT count(*)::int AS count FROM "${tablename.replaceAll('"', '""')}"`,
		);
		tables[tablename] = row.count;
	}

	const groups = await db.item.groupBy({
		by: ["origin", "visibility"],
		_count: { _all: true },
		orderBy: [{ origin: "asc" }, { visibility: "asc" }],
	});
	const itemsByOriginAndVisibility = Object.fromEntries(
		groups.map((group) => [
			`${group.origin}/${group.visibility}`,
			group._count._all,
		]),
	);

	const unpublishedPublic = await db.item.count({
		where: { visibility: "public", publishedRevisionId: null },
	});
	if (unpublishedPublic)
		problems.push(`${unpublishedPublic} public item(s) have no published revision`);
	const publishedPrivate = await db.item.count({
		where: { visibility: "private", publishedRevisionId: { not: null } },
	});
	if (publishedPrivate)
		problems.push(`${publishedPrivate} private item(s) have a published revision`);

	const reader = createArchiveReader(db);
	const publicItem = await db.item.findFirst({
		where: {
			state: "active",
			visibility: "public",
			publishedRevisionId: { not: null },
		},
		orderBy: { id: "asc" },
		select: { id: true },
	});
	if (!publicItem) problems.push("no public item to read");
	else if (!(await reader.getPublicItem(publicItem.id)))
		problems.push("the public reader did not return a public item");
	const privateItem = await db.item.findFirst({
		where: { visibility: "private" },
		orderBy: { id: "asc" },
		select: { id: true },
	});
	if (!privateItem) problems.push("no private item to read");
	else if (await reader.getPublicItem(privateItem.id))
		problems.push("the public reader returned a private item");

	return {
		latestAppliedMigration,
		newestMigration,
		tables,
		itemsByOriginAndVisibility,
		problems,
	};
}
```

- [ ] **Step 4: Run the test.** Same command. Expected: PASS.

- [ ] **Step 5: Create `scripts/verify-restore.ts`:**

```ts
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../src/lib/database";
import { verifyRestore } from "../src/ops/verify-restore";

// Operator command for the restore drill (docs/OPERATIONS.md). The session is
// read-only. Prints the host and counts, never content. Use a direct URL: the
// pooled endpoint rejects the session option.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("Needs DATABASE_URL");
	process.exit(2);
}
const url = new URL(databaseUrl);
url.searchParams.set("options", "-c default_transaction_read_only=on");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = readdirSync(resolve(root, "prisma/migrations"), {
	withFileTypes: true,
})
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name);
const db = createDatabase(url.toString());
try {
	// Fail closed: this runs against production, so do not assume the option
	// above took effect.
	const [mode] = await db.$queryRaw<{ default_transaction_read_only: string }[]>`
		SHOW default_transaction_read_only`;
	if (mode?.default_transaction_read_only !== "on")
		throw new Error("The session is not read-only");
	const report = await verifyRestore(db, migrations);
	console.log(JSON.stringify({ host: url.host, ...report }, null, 2));
	if (report.problems.length) process.exitCode = 1;
} finally {
	await db.$disconnect();
}
```

Add to `package.json`: `"verify:restore": "node --conditions=react-server --import tsx scripts/verify-restore.ts"`.

- [ ] **Step 6: Try the script on the test database.** `DATABASE_URL='postgresql://kobob_test:synthetic-local-test-only@127.0.0.1:55439/kobob_test' npm run verify:restore`. Expected: JSON with host `127.0.0.1:55439`, table counts and the `no public item to read` problem, exit 1. Reaching the report proves the driver applied the read-only option, since the script stops otherwise.

- [ ] **Step 7: Commit.** Stage the listed files. `git commit -m "feat: add a read-only restore verification script"`.

### Task 5: Runbook and docs

**Files:**
- Modify: `docs/OPERATIONS.md`, `.claude/security-audit.md`, `docs/DEVELOPMENT.md`, `docs/SESSION-HANDOFF.md`, `docs/README.md`

- [ ] **Step 1: Replace the first two paragraphs under `## Preservation and recovery` in `docs/OPERATIONS.md`,** keeping the final paragraph about the administrator's email, with:

````markdown
Decision (Yoram, 2026-11-06, after the
[panel review](reviews/2026-11-06-panel-review.md)): backups with a rehearsed
restore come before any family editing and before the first invitation. Design:
[ops and backups](superpowers/specs/2026-11-06-ops-backups-design.md). Target: RPO
24 hours, RTO 1 working day. Never commit backup payloads to GitHub. Media is not
backed up here: R2 holds copies, and Drive holds the originals. Media backup must
be added before family uploads exist.

### Database backup

`DB Backup` (`.github/workflows/db-backup.yml`) runs daily at 03:00 UTC from `main`
in the `backup` Environment, and writes `daily/` and `monthly/` in a private B2
bucket. The dump is encrypted before upload. Object Lock (Governance, 30 days)
protects recent dumps; lifecycle rules expire `daily/` at 32 days and `monthly/` at
366. Failed runs email Yoram through GitHub's notifications, and the ops monitor
reports dump age. GitHub disables schedules after 60 days without repository
activity; when the monitor reports an old dump, check that first and run
`gh workflow enable db-backup.yml --repo hetzy8/kobob`.

| Secret in Environment `backup` | Source | Map name |
|---|---|---|
| `BACKUP_DATABASE_URL` | Direct, non-pooled URL of the read-only role `kobob_backup` | `KOBOB_BACKUP_DATABASE_URL` |
| `B2_KEY_ID`, `B2_KEY` | Bucket-scoped key: `listBuckets,listFiles,writeFiles` | `KOBOB_B2_BACKUP_KEY_ID`, `KOBOB_B2_BACKUP_KEY` |
| `B2_BUCKET` | Bucket name | `KOBOB_B2_BACKUP_BUCKET` |
| `AGE_PUBLIC_KEY` | Public half of the age key | `KOBOB_BACKUP_AGE_PUBLIC_KEY` |

The private age key, `KOBOB_BACKUP_AGE_PRIVATE_KEY`, is in Bitwarden only. Losing it
makes every dump unreadable. Cost: not yet measured; recorded here after the first
dump.

### Restore drill

Status: not rehearsed.

Run on the operator Mac after the first dump, after any material schema change or
key change, and at least every six months. Download the newest dump from the
Backblaze console into a new private folder outside the repository. Then, from
`~/kobob` on current `main`, one line at a time:

```zsh
D=<that folder>
DUMP=<the dump file's path>
PW=synthetic-local-restore-only
docker run -d --name kobob-restore \
  -e POSTGRES_PASSWORD="$PW" \
  -e POSTGRES_DB=restore \
  -p 127.0.0.1:55441:5432 \
  --tmpfs /var/lib/postgresql/data \
  postgres:17.7-alpine
sleep 10
export BWS_ACCESS_TOKEN="$(security find-generic-password -s ops-secrets-bws -w)"
P="$(bws project list --output json | jq -r '.[]|select(.name=="shared").id')"
S="$(bws secret list "$P" --output json)"
K='.[]|select(.key=="KOBOB_BACKUP_AGE_PRIVATE_KEY").value'
jq -r "$K" <<<"$S" |
  age -d -i - "$DUMP" |
  gunzip |
  docker exec -i kobob-restore \
    psql -v ON_ERROR_STOP=1 -q -U postgres -d restore >/dev/null
L="postgresql://postgres:$PW@127.0.0.1:55441/restore"
DATABASE_URL="$L" npm run -s verify:restore > "$D/restored.json"
K='.[]|select(.key=="KOBOB_BACKUP_DATABASE_URL").value'
U="$(jq -r "$K" <<<"$S")"
DATABASE_URL="$U" npm run -s verify:restore > "$D/production.json"
diff "$D/restored.json" "$D/production.json"
docker rm -f kobob-restore
unset BWS_ACCESS_TOKEN P S K L U PW DUMP
```

The restore must finish with no error, and both reports must exit 0. Production is
read through the read-only backup role. The host always differs. Any other
difference is acceptable only if explained by activity after the dump, such as
`Session` or `RateLimit` rows.

**Evidence rule.** Record a drill only with the dump's date and size, the script's
counts and migration, and who ran it. Without those, the status stays "not
rehearsed". The first drill records revoked-member denial as not applicable, since
no revoked member exists; integration tests cover the behavior.

### Runbook

**Takedown request.** Make the item private in the interface. As a signed-out
visitor, confirm its page answers 404 and search no longer finds it. Log the date
and a private reference outside the repository. Tell the requester the truth:
encrypted backups keep the record until they expire, up to 366 days. After any
restore, reapply every takedown logged since that dump.

**Recovery from backup.** Restore to a new Neon branch or project with
`psql -v ON_ERROR_STOP=1` as in the drill. Run `npm run verify:restore` against it.
Reapply takedowns and member revocations made since the dump. Repoint
`KOBOB_DATABASE_URL` and `KOBOB_DIRECT_URL` with
`node scripts/secrets.mjs rotate <names> --apply` from `~/ops`. Rotate
`KOBOB_AUTH_SECRET` the same way, so old sessions and links die. Only then reopen
traffic, and check that a revoked member is denied. Do not resurrect stale public
visibility or access: an item recovered individually returns to private.

**Leaked secret.** `secrets/targets.json` in `hetzy8/ops` shows which secret reaches
which target. Revoke and replace it at the provider, rotate it with
`node scripts/secrets.mjs rotate <name> --apply`, run
`node scripts/secrets.mjs audit`, and check the provider's logs for what it could
have reached. The Bitwarden-only keys (R2 write and development keys, the private age
key) are replaced by hand. A leaked private age key exposes every dump still in the
bucket: generate a new key, and treat the old dumps as exposed until they expire.

**Lost administrator email.** Yoram verifies the owner's identity outside the site,
then runs `npm run admin:recover` (added after review: `admin:bootstrap` refuses once
any administrator exists). There is no public reset path.

**Site down.** Check `/api/health` first: a 503 with `databaseUrl` true points at the
database, and `commit` shows what is live. Then the latest `Vercel Deploy
(production)` run, Neon's and Vercel's status pages, and the rollback rules in Branch
and release flow. Do not run a destructive down migration to make old code start.
````

- [ ] **Step 2: Correct the routes in `.claude/security-audit.md:19`.** Replace `` (`/`, `/about`, `/achievements`, `/archive`, `/sign-in`, `/verify`) `` with `` (`/`, `/about`, `/search`, `/items/[id]`, `/sign-in`, `/verify`) ``. Read the sentence around it and check `src/app` for any other route it misses, including `/api/media/[id]`, which must be listed as member-only.

- [ ] **Step 3: Check the other stale references.** Run `grep -n "/achievements\|/archive\b\|גרסת פיתוח" docs/*.md`. `docs/DEVELOPMENT.md:30,40` and `docs/SESSION-HANDOFF.md` already mark these as history; correct only lines that describe a removed route or the banner as current.

- [ ] **Step 4: Update statuses.** `docs/README.md`: add this plan's row after the ops and backups design, and mark the design "Implemented on `feat/ops-backups`; drill pending". `docs/SESSION-HANDOFF.md`: add a dated line saying the same.

- [ ] **Step 5: Run everything.** `TEST_DATABASE_URL='...' npm run check`. Expected: exit 0. Then `npm run db:test:down`.

- [ ] **Step 6: Commit.** Stage the listed files. `git commit -m "docs: add the backup procedures, restore drill and runbook"`.

### Gate A: stop for Yoram

- [ ] PR into `dev`; Codex review on Yoram's word; reply; merge on Yoram's word.

### Task 6: Environment secrets in `hetzy8/ops`

Yoram's ops checkout may have other work in it, so use a worktree from `origin/main`. Agents may not run shell commands that name the guarded secret flag; edit these files with the editor tools.

**Files (in `hetzy8/ops`):**
- Modify: `scripts/secrets/map.mjs:21`, `scripts/secrets/platforms.mjs:55,64`, `scripts/secrets/adapters.test.mjs`, `secrets/targets.json`

- [ ] **Step 1: Write the failing test.** Append to `scripts/secrets/adapters.test.mjs`:

```js
test("github targets can write to and list an Environment", () => {
  const { run, calls } = fakeRun(() => ({ status: 0, stdout: "[]", stderr: "" }));
  const pf = makePlatforms(run, {});
  const target = { type: "github", repo: "hetzy8/ops", environment: "backup" };
  pf.write.github(target, "X", VALUE);
  pf.listNames.github(target);
  assert.deepEqual(calls[0].args, ["secret", "set", "X", "--repo", "hetzy8/ops", "--env", "backup"]);
  assert.equal(calls[0].input, VALUE);
  assert.deepEqual(calls[1].args, ["secret", "list", "--repo", "hetzy8/ops", "--env", "backup", "--json", "name"]);
});
```

Append to `scripts/secrets/map.test.mjs`, adding `targetId` to its import from `./map.mjs` if it is not there:

```js
test("a github Environment is a separate place", () => {
  assert.equal(targetId({ type: "github", repo: "a/b" }), "github:a/b");
  assert.equal(targetId({ type: "github", repo: "a/b", environment: "backup" }), "github:a/b:backup");
});
```

- [ ] **Step 2: Run them.** `node --test scripts/secrets/*.test.mjs`. Expected: the two new tests FAIL.

- [ ] **Step 3: Implement.** In `map.mjs` line 21:

```js
    case "github": return t.environment ? `github:${t.repo}:${t.environment}` : `github:${t.repo}`;
```

In `platforms.mjs`, above `listNames`:

```js
  const ghScope = (t) => ["--repo", t.repo, ...(t.environment ? ["--env", t.environment] : [])];
```

and the two adapters:

```js
    github: (t) => json(run("gh", ["secret", "list", ...ghScope(t), "--json", "name"]), `gh secret list ${targetId(t)}`).map((x) => x.name),
```

```js
      github: (t, name, value) => must(run("gh", ["secret", "set", name, ...ghScope(t)], { input: value }), `gh secret set ${name} (${targetId(t)})`),
```

Import `targetId` from `./map.mjs` in `platforms.mjs`. If a test asserts the old message text, keep the plain-repo message identical, which this does for a target with no environment apart from the `github:` prefix; update that assertion if so.

- [ ] **Step 4: Add the map.** In `secrets/targets.json`, add the place `{ "type": "github", "repo": "hetzy8/kobob", "environment": "backup" }` and, after `KOBOB_R2_READ_SECRET_ACCESS_KEY`, these entries. Each uses `"bitwarden": { "project": "shared" }`, `"targets": [{ "type": "github", "repo": "hetzy8/kobob", "environment": "backup", "as": "<as>" }]`, and `"providerFirst": true`:

| `name` | `as` | `origin.provider` | `origin.console` |
|---|---|---|---|
| `KOBOB_BACKUP_DATABASE_URL` | `BACKUP_DATABASE_URL` | `neon` | `https://console.neon.tech` |
| `KOBOB_B2_BACKUP_KEY_ID` | `B2_KEY_ID` | `backblaze` | `https://secure.backblaze.com/app_keys.htm` |
| `KOBOB_B2_BACKUP_KEY` | `B2_KEY` | `backblaze` | `https://secure.backblaze.com/app_keys.htm` |
| `KOBOB_B2_BACKUP_BUCKET` | `B2_BUCKET` | `backblaze` | `https://secure.backblaze.com/b2_buckets.htm` |
| `KOBOB_BACKUP_AGE_PUBLIC_KEY` | `AGE_PUBLIC_KEY` | `age` | `https://github.com/FiloSottile/age` |

Give each a `note`: its purpose, that it is kobob-only, and for the two keys `Bucket-scoped: listBuckets,listFiles,writeFiles`. Do not add `KOBOB_BACKUP_AGE_PRIVATE_KEY`: it has no target, and the map rejects an entry without one.

- [ ] **Step 5: Run the tests.** Same command. Expected: PASS, including the test that validates the real map.

- [ ] **Step 6: PR.** `git commit -m "feat(secrets): support GitHub Environments and map kobob's backup secrets"`, push the branch, `gh pr create --repo hetzy8/ops --base main`. Merge is Yoram's.

### Task 7: Yoram provisions and proves it

Agents give these commands and read back results; values never pass through an agent. Each step is Yoram's. Steps 1 to 5 can start at once. The ops PR (Task 6) is merged before step 6, and Gate A is passed before step 7, so the secrets exist before the workflow reaches `main` and the first scheduled run cannot fail on missing secrets.

- [x] **Step 1: Neon.** In the Neon SQL editor, on the kobob project: `SHOW server_version;`. It must start with 17; otherwise stop, since the script and workflow pin 17. Then, with a password from `openssl rand -hex 32`, so nothing in it can break the URL:

```sql
CREATE ROLE kobob_backup WITH LOGIN PASSWORD '<generated>';
GRANT pg_read_all_data TO kobob_backup;
```

Build the direct URL from the existing direct host (no `-pooler`) with `?sslmode=require`, and keep it for step 6.

**Result of Step 1 (2026-11-07):** the server is PostgreSQL 18.6, so the tooling was re-pinned to 18 (PR #45) instead of stopping. The first dump (run 42372314950) failed with "password authentication failed" for `kobob_backup`: the stored URL was well-formed (direct host, right user) but its password did not match the role. Fixed by resetting the password with `ALTER ROLE`, re-granting `pg_read_all_data`, and pushing only `KOBOB_BACKUP_DATABASE_URL` again from ops; a local `psql` on the stored URL then connected as `kobob_backup`.

- [ ] **Step 2: Bucket.** Backblaze console → Create a Bucket: choose a name and keep it out of Git, files private, Object Lock **enabled**. Then on the bucket:
  - Object Lock: default retention, mode Governance, 30 days.
  - Lifecycle Settings → custom rules: prefix `daily/`, hide after 32 days, delete 1 day after hiding; prefix `monthly/`, hide after 366 days, delete 1 day after hiding.

- [ ] **Step 3: Keys.** The console cannot make a write-and-list key, so use the CLI. `brew install b2-tools age`, `b2 account authorize` with a master key, then:

```zsh
B=<bucket name>
b2 key create --bucket "$B" kobob-backup-ci listBuckets,listFiles,writeFiles
b2 key create --bucket "$B" kobob-backup-monitor listBuckets,listFiles
b2 account clear
unset B
```

Each key is shown only once. Keep both somewhere private: the CI key is needed at steps 5 and 6, the monitor key at step 12. If the CLI's syntax has changed, `b2 key create --help` is the reference; the capabilities must stay exactly these.

- [ ] **Step 4: Age key.** Run `age-keygen` with no file argument, so the key stays off disk. Add the `AGE-SECRET-KEY-…` line to Bitwarden `shared` as `KOBOB_BACKUP_AGE_PRIVATE_KEY` in the web app, and keep the `age1…` public key for step 6. Clear the terminal.

- [x] **Step 5: Rehearse the upload.** This is the first real test of the CI key with the rclone the workflow installs, and a problem found after the release costs another release. From any terminal, pasting the CI key when asked:

```zsh
read -rs "I?CI key id: "; echo
read -rs "K?CI key: "; echo
B=<bucket name>
docker run --rm \
  -e RCLONE_CONFIG_B2_TYPE=b2 \
  -e RCLONE_CONFIG_B2_ACCOUNT="$I" \
  -e RCLONE_CONFIG_B2_KEY="$K" \
  -e B="$B" \
  ubuntu:24.04 sh -c '
    apt-get update -qq
    apt-get install -y -qq rclone ca-certificates >/dev/null
    rclone version | head -1
    rclone lsf "b2:$B/daily/" --files-only --format sp --separator " "
    echo "empty listing status: $?"
    echo synthetic > /tmp/t
    rclone copyto /tmp/t "b2:$B/rehearsal/kobob-rehearsal.txt" --no-check-dest
    echo "upload status: $?"
    rclone lsf "b2:$B/rehearsal/" --files-only --format sp --separator " "
  '
unset I K B
```

Expected: listing status 0 or 3, upload status 0, and the file listed with its size. Any other result stops here and comes back to the agent; `scripts/db-backup.sh` would fail the same way. The rehearsal file holds no data and can be deleted from the console after its 30-day lock. The workflow runs on `ubuntu-latest` and logs its rclone version, so compare that version with this one at step 8.

**Result of Step 5 (2026-11-07):** failed with apt's rclone 1.60.1: `failed to authorize account: ... This request is not currently supported on API version number 1 (400 bad_request)`. Backblaze refuses API v1 for this account, and the workflow installed the same apt package, so it would have failed identically. Fix: `db-backup.yml` installs the pinned release build `v1.75.2` (deb, checksum verified). Rehearse again with the matching image: replace the `ubuntu:24.04` run with `rclone/rclone:1.75.2`, which has rclone as its entrypoint, running the three rclone commands one container each (`lsf` of `daily/`, `copyto` of a one-line file mounted from a temp dir, `lsf` of `rehearsal/`); same expected results.

**Result of the second rehearsal (2026-11-07 13:52):** passed with `rclone/rclone:1.75.2`. `kobob-rehearsal.txt` is in `rehearsal/` at 10 bytes with Object Lock, confirmed in the Backblaze console. The CI key and the pinned rclone work against this account; the apt package was the only cause. Step 8 should log `rclone v1.75.2`.

- [x] **Step 6: Environment and secrets.**

```zsh
E=repos/hetzy8/kobob/environments/backup
B='{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
gh api -X PUT "$E" --input - <<<"$B"
gh api -X POST "$E/deployment-branch-policies" -f name=main -f type=branch
unset E B
```

Then from `~/ops`, on `main`: `node scripts/secrets.mjs rotate KOBOB_BACKUP_DATABASE_URL KOBOB_B2_BACKUP_KEY_ID KOBOB_B2_BACKUP_KEY KOBOB_B2_BACKUP_BUCKET KOBOB_BACKUP_AGE_PUBLIC_KEY` (dry run), again with `--apply`, pasting each value, then `node scripts/secrets.mjs audit`. Confirm the Environment was used: `gh secret list --repo hetzy8/kobob` must show no `B2_*`, `AGE_*` or `BACKUP_*` names. If it shows any, the ops change was missing: delete them and stop.

**Result of Step 6 (2026-11-07):** done. The `backup` Environment exists with a custom branch policy admitting only `main`; its five secrets are `AGE_PUBLIC_KEY`, `B2_BUCKET`, `B2_KEY`, `B2_KEY_ID` and `BACKUP_DATABASE_URL`, written by ops `secrets.mjs rotate --apply` (first write, nothing old to revoke; the five values are now in Bitwarden `shared`). Audit shows only the two pre-existing getmygoals gaps. Repo-level secrets hold only `VERCEL_DEPLOY_HOOK_URL`.

- [x] **Step 7: Release.** Done 2026-11-07 as v0.7.0 (`30ef6a6`, PR #44, deploy run 42361889618 green). Step 1 then found PostgreSQL 18.6 on Neon; PR #45 re-pins the tooling to 18 and needs its own release before step 8. Original text: After Gate A, on Yoram's go: the `dev` → `main` PR per OPERATIONS.md, smoke gate green, tag `v0.7.0`, record it, recreate `dev`. No migration. Confirm on production: the tab title is `יקי חץ` and the banner is gone.

- [x] **Step 8: First dump.** `gh workflow run db-backup.yml --repo hetzy8/kobob --ref main`, then `gh run watch --repo hetzy8/kobob` on it. Expected: green. In the Backblaze console: the new file is in `daily/` and `monthly/` has one file for this month, with Object Lock on them. A 03:00 run may already have added its own files. Read the public log and confirm it shows sizes and object names only. Then confirm a run on another branch is refused: `gh workflow run db-backup.yml --repo hetzy8/kobob --ref dev` must fail at the Environment gate.

**Result of Step 8 (2026-11-07):** run 42374898823 green on `main` with pg_dump 18.6 and rclone v1.75.2: dump 345597 bytes (previous: none), uploaded `daily/kobob-2026-11-07T13-00-15Z.sql.gz.age` and the same name under `monthly/`. The public log shows sizes and object names only. The `dev` dispatch (run 42375012762) failed with no steps run: "Branch \"dev\" is not allowed to deploy to backup due to environment protection rules". The Backblaze console shows `daily/` and `monthly/` at 345.6 KB each, uploaded 15:00 local, beside `rehearsal/`; the bucket has Object Lock enabled.

- [x] **Step 9: Probe the address header.** With a read-only connection to count, and synthetic non-member addresses so no mail is sent:

```zsh
export BWS_ACCESS_TOKEN="$(security find-generic-password -s ops-secrets-bws -w)"
P="$(bws project list --output json | jq -r '.[]|select(.name=="shared").id')"
S="$(bws secret list "$P" --output json)"
K='.[]|select(.key=="KOBOB_BACKUP_DATABASE_URL").value'
U="$(print -r -- "$S" | jq -r "$K")"
Q='select count(*) from "RateLimit"
  where key like $$client:%$$
  and "lastRequest" > extract(epoch from now())*1000 - 900000'
docker run --rm postgres:17.7-alpine psql "$U" -Atc "$Q"
O=https://kobob.vercel.app
for n in 1 2 3; do
  curl -s -o /dev/null -X POST "$O/api/access/request" \
    -H "origin: $O" \
    -H 'content-type: application/json' \
    -H "x-vercel-forwarded-for: 198.51.100.$n" \
    -H "x-forwarded-for: 198.51.100.$n" \
    -d "{\"email\":\"probe$n@example.test\"}"
done
docker run --rm postgres:17.7-alpine psql "$U" -Atc "$Q"
unset BWS_ACCESS_TOKEN P S K U Q O
```

Limit rows are per clock quarter hour, so every count must fall inside one quarter hour (:00-:14, :15-:29, :30-:44, :45-:59). Start just after a mark. If the clock crosses one, wait for the next mark and start over.

From this network, the second count should be at most 1 higher than the first, since all three requests came from one real address. Then switch to another network, such as a phone hotspot, and run the whole block again. Its second count should be exactly 1 higher than its first.

- At most +1, then +1 from the other network: the header works and cannot be spoofed.
- +3 from this network: **the header can be spoofed.** A stranger could escape the client limit, though the global limit still holds. Bring it to Yoram, with the option of reading `x-real-ip` or the last `x-forwarded-for` entry.
- +0 from the other network: **every visitor shares one bucket,** so the lockout fix is not working. Do not record it as confirmed. Fix it before inviting anyone.

**Result of Step 9 (2026-11-07):** confirmed, the header works and cannot be spoofed. Hotspot: exactly +1 (one key, count 3). Home: +2, which is none of the listed outcomes; the rows showed two keys in one quarter with counts 2 and 1, and the home connection turned out to have two public egress addresses (two ISP ranges seen from the same Mac), so Vercel saw two real clients. A second home run at 15:15 settled it: three requests without the spoof headers added one key with count 3, and three with the spoof headers added no key and raised that count to 6. Note for the next run of this probe: a home network with more than one egress address can legitimately give more than +1; only +3 from three requests, or a new key appearing for spoofed requests, means the header is spoofable.

- [ ] **Step 10: Restore drill.** Follow OPERATIONS.md → Restore drill. Share the two reports' counts and migration with the agent, never the host.

- [ ] **Step 11: Record.** A docs PR into `dev` records, under the evidence rule: dump date and size, the script's counts and migration, who ran it. Also the dump size against the 10 GB allowance, the current price from Backblaze's pricing page, and the probe result. Nothing recorded names the production host. Change `Status: not rehearsed` only then. Tick `Restore drill and rollback procedure` in the launch checklist only after step 13.

- [ ] **Step 12: Ops monitor, on Yoram's authorization.** A `hetzy8/ops` PR. Read `.github/monitor/vendors/backblaze.mjs` first, and any workflow that passes `B2_READ_KEY_ID`, to check that a second entry works:
  - `projects.json`, kobob: add `DB Backup` to `workflows`, and `"backupWithinHours": 26`.
  - `services.json`: a second `backblaze` entry with `"projects": ["kobob"]`, the bucket, `"prefix": "daily/"`, `"keyIdEnv": "KOBOB_B2_READ_KEY_ID"`, `"keyEnv": "KOBOB_B2_READ_KEY"`, `"maxAgeHours": 26`, `"shrinkWatchRatio": 0.5`, `"freeTierGb": 10`, and a note that the allowance is shared with Sana's bucket.
  - `secrets/targets.json`: `KOBOB_B2_READ_KEY_ID` and `KOBOB_B2_READ_KEY`, target `{ "type": "github", "repo": "hetzy8/ops" }`, from step 3's monitor key.
  - `.github/workflows/nightly-monitor.yml`: map `KOBOB_B2_READ_KEY_ID` and `KOBOB_B2_READ_KEY` into its env, like the existing `B2_READ_*` lines. Without this the check reads 'not set' every night.
  - Confirm the monitor reports kobob's dump age after its next run.

- [ ] **Step 13: Wait for a scheduled run.** The next 03:00 UTC run is green and adds one more file to `daily/` and none to `monthly/`, unless a new month has begun. Then tick the launch item in a small docs PR.

## Done when

- A scheduled run has uploaded an encrypted dump, and the bucket rules are confirmed in the Backblaze console.
- The drill has been run and recorded under the evidence rule.
- One client over its limit cannot block another client's sign-in, in tests, and the probe confirms the header from both networks.
- The runbook is in `OPERATIONS.md`, and production shows no development wording.
- The ops monitor reports kobob's dump age.
- `Restore drill and rollback procedure` is ticked only then.

## Open for Yoram

A second person who can reach the Bitwarden key. It does not block this work.
