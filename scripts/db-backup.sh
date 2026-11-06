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
