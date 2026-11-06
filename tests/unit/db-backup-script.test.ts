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

const DATABASE_URL =
	"postgresql://role:synthetic-password@db.example.test/kobob";
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
  lsf*daily/)
    [ -f "$STUB_DIR/daily.txt" ] && cat "$STUB_DIR/daily.txt"
    exit "\${STUB_LSF_DAILY_EXIT:-0}" ;;
  copyto*) exit "\${STUB_COPY_EXIT:-0}" ;;
  lsf*monthly/) [ -f "$STUB_DIR/monthly.txt" ] && cat "$STUB_DIR/monthly.txt" ;;
esac
exit 0`,
	);
	stub(
		"age",
		'echo "$*" > "$STUB_DIR/age.args"\n[ -z "$STUB_AGE_EXIT" ] || exit "$STUB_AGE_EXIT"\ncat',
	);
	// 5,000 random bytes barely compress, so the size is known.
	stub(
		"pg_dump",
		`count=$(cat "$STUB_DIR/attempts" 2>/dev/null || echo 0)
count=$((count + 1))
echo "$count" > "$STUB_DIR/attempts"
if [ "$count" -le "\${STUB_DUMP_FAILS:-0}" ]; then
  echo "\${STUB_DUMP_ERROR:-could not connect to $1}" >&2
  [ -z "\${STUB_DUMP_PARTIAL:-}" ] || head -c 3000 /dev/urandom
  exit 1
fi
head -c "\${STUB_DUMP_BYTES:-5000}" /dev/urandom`,
	);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(env: Record<string, string> = {}) {
	const childEnv: Record<string, string> = {
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
	};
	const result = spawnSync("bash", ["scripts/db-backup.sh"], {
		encoding: "utf8",
		env: childEnv as NodeJS.ProcessEnv,
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

it("passes --no-check-dest to every upload", () => {
	expect(run().status).toBe(0);
	const copies = log()
		.split("\n")
		.filter((line) => line.startsWith("copyto"));
	expect(copies).toHaveLength(2);
	for (const line of copies) expect(line).toContain("--no-check-dest");
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

it("uploads, then fails, when the previous dump cannot be listed", () => {
	const { status, output } = run({ STUB_LSF_DAILY_EXIT: "1" });
	expect(status).toBe(1);
	expect(uploads().length).toBeGreaterThan(0);
	expect(output).toContain("previous: unreadable");
	expect(output).toContain("could not compare");
});

it("treats a missing daily folder as a first run", () => {
	const { status, output } = run({ STUB_LSF_DAILY_EXIT: "3" });
	expect(status).toBe(0);
	expect(uploads().length).toBeGreaterThan(0);
	expect(output).not.toContain("could not compare");
});

it("uploads, then fails, when the previous size is not a number", () => {
	writeFileSync(
		join(dir, "daily.txt"),
		"garbage kobob-2001-01-01T03-00-00Z.sql.gz.age\n",
	);
	const { status, output } = run();
	expect(status).toBe(1);
	expect(uploads().length).toBeGreaterThan(0);
	expect(output).toContain("could not compare");
});

it("reports no upload when the copy fails", () => {
	const { status, output } = run({ STUB_COPY_EXIT: "1" });
	expect(status).not.toBe(0);
	expect(output).not.toContain("Uploaded");
});

it("uploads nothing when pg_dump fails after writing bytes", () => {
	const { status } = run({ STUB_DUMP_FAILS: "6", STUB_DUMP_PARTIAL: "1" });
	expect(status).toBe(1);
	expect(uploads()).toEqual([]);
});

it("uploads nothing when age fails", () => {
	const { status } = run({ STUB_AGE_EXIT: "1" });
	expect(status).toBe(1);
	expect(uploads()).toEqual([]);
});

it.each([
	[
		"password authentication failed for user SomeRole",
		"the backup role's password was refused",
		"SomeRole",
	],
	[
		"server version mismatch: SomeDetail",
		"pg_dump does not match the server version",
		"SomeDetail",
	],
])("stops at once on %s with a fixed message", (error, message, detail) => {
	const { status, output } = run({
		STUB_DUMP_FAILS: "6",
		STUB_DUMP_ERROR: `pg_dump: error: ${error}`,
	});
	expect(status).toBe(1);
	expect(output).toContain(message);
	expect(output).not.toContain(detail);
	expect(readFileSync(join(dir, "attempts"), "utf8").trim()).toBe("1");
	expect(uploads()).toEqual([]);
});
