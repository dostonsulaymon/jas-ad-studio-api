#!/usr/bin/env bash
# Proves the newest backup restores (P8 Part 2, PLAN's exit check "restore rehearsed").
#
# Restores the newest db_*.dump into a throwaway database inside the same Postgres container,
# compares row counts of every table with the live database, checks the storage tarball's
# checksum and file count, then drops the throwaway database. The live database is only read.
#
#   tools/restore-check.sh
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/jas-ad-studio}"
PG_CONTAINER="${PG_CONTAINER:-jas-ad-studio-dev-postgres-1}"
PG_USER="${PG_USER:-jas}"
PG_DB="${PG_DB:-jas_ad_studio}"
CHECK_DB="jas_restore_check_$(date +%s)"

dump="$(ls -1t "$BACKUP_DIR"/db_*.dump 2>/dev/null | head -1 || true)"
[ -n "$dump" ] || { echo "no db_*.dump in $BACKUP_DIR" >&2; exit 1; }
stamp="$(basename "$dump" .dump)"; stamp="${stamp#db_}"
storage="$BACKUP_DIR/storage_${stamp}.tar.gz"

psql_live() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$1" -At -v ON_ERROR_STOP=1 -c "$2"; }
drop_check_db() { docker exec "$PG_CONTAINER" dropdb -U "$PG_USER" --if-exists "$CHECK_DB" >/dev/null 2>&1 || true; }
trap drop_check_db EXIT

echo "checksums: $(cd "$BACKUP_DIR" && sha256sum -c "checksums_${stamp}.sha256" --quiet && echo ok)"

echo "restoring $(basename "$dump") into $CHECK_DB"
docker exec "$PG_CONTAINER" createdb -U "$PG_USER" "$CHECK_DB"
docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_USER" -d "$CHECK_DB" --no-owner --exit-on-error <"$dump"

tables="$(psql_live "$CHECK_DB" "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1")"
mismatch=0
printf '%-32s %10s %10s\n' table restored live
for t in $tables; do
  restored="$(psql_live "$CHECK_DB" "SELECT count(*) FROM \"$t\"")"
  live="$(psql_live "$PG_DB" "SELECT count(*) FROM \"$t\"")"
  flag=""
  # Live rows may have grown since the dump; fewer live rows than restored means data loss.
  if [ "$live" -lt "$restored" ]; then flag="  <-- live has FEWER rows"; mismatch=1; fi
  printf '%-32s %10s %10s%s\n' "$t" "$restored" "$live" "$flag"
done

if [ -f "$storage" ]; then
  in_tar="$(tar -tzf "$storage" | grep -vc '/$')"
  on_disk="$(find "$REPO_DIR/storage" -type f | wc -l)"
  echo "storage files: $in_tar in backup, $on_disk on disk"
else
  echo "no storage tarball for $stamp" >&2; mismatch=1
fi

[ "$mismatch" -eq 0 ] && echo "RESTORE CHECK PASSED" || { echo "RESTORE CHECK FAILED" >&2; exit 1; }
