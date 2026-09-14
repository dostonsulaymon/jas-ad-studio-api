#!/usr/bin/env bash
# Nightly backup of everything the live site cannot recreate (P8 Part 2):
#   - the Postgres database, as a pg_dump custom-format archive (restorable with pg_restore)
#   - storage/ (seller photos and gallery media), as a gzipped tarball
# Backups older than RETENTION_DAYS are removed. Runbook: docs/RUNBOOK-backups.md
#
#   tools/backup.sh            run a backup now
#
# Fails loudly: any failed step exits non-zero and leaves no half-written file behind.
set -euo pipefail
# cron runs with PATH=/usr/bin:/bin, and docker lives in /usr/local/bin.
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/jas-ad-studio}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PG_CONTAINER="${PG_CONTAINER:-jas-ad-studio-dev-postgres-1}"
PG_USER="${PG_USER:-jas}"
PG_DB="${PG_DB:-jas_ad_studio}"

stamp="$(date +%Y-%m-%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

db_file="$BACKUP_DIR/db_${stamp}.dump"
storage_file="$BACKUP_DIR/storage_${stamp}.tar.gz"

log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
cleanup_partial() { rm -f "$db_file.partial" "$storage_file.partial"; }
trap cleanup_partial ERR

log "database: $PG_DB from $PG_CONTAINER"
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner >"$db_file.partial"
# A custom-format archive that pg_restore cannot list is not a backup.
docker exec -i "$PG_CONTAINER" pg_restore --list >/dev/null <"$db_file.partial"
mv "$db_file.partial" "$db_file"

log "storage: $REPO_DIR/storage"
tar -C "$REPO_DIR" -czf "$storage_file.partial" storage
tar -tzf "$storage_file.partial" >/dev/null
mv "$storage_file.partial" "$storage_file"

(cd "$BACKUP_DIR" && sha256sum "$(basename "$db_file")" "$(basename "$storage_file")" >"checksums_${stamp}.sha256")

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db_*.dump' -o -name 'storage_*.tar.gz' -o -name 'checksums_*.sha256' \) \
  -mtime +"$RETENTION_DAYS" -print -delete | sed 's/^/removed old: /'

log "done: $(du -h "$db_file" | cut -f1) database, $(du -h "$storage_file" | cut -f1) storage -> $BACKUP_DIR"
