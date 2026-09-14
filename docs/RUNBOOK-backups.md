# Runbook: backups and restore

P8 Part 2. What the live site cannot recreate: the Postgres database in the Docker container
`jas-ad-studio-dev-postgres-1`, and `storage/` (seller photos in `storage/photos`, gallery
media in `storage/gallery`). Redis holds only queue state and is not backed up: a lost
queue means a queued generation must be re-requested, not lost money.

## What runs

| | |
|---|---|
| Script | `tools/backup.sh` |
| Schedule | Doston's user crontab, nightly at 03:15 local time |
| Output | `~/backups/jas-ad-studio/`: `db_<stamp>.dump` (pg_dump custom format), `storage_<stamp>.tar.gz`, `checksums_<stamp>.sha256` |
| Retention | 14 days (`RETENTION_DAYS`) |
| Log | `~/backups/jas-ad-studio/backup.log` |

The backups sit on the same disk as the data. **An off-machine copy is Doston's decision**
(D-027): copy the folder to another disk or cloud storage if the machine itself is the risk.

## Check that backups work

```bash
tools/restore-check.sh
```

Restores the newest dump into a throwaway database in the same container, compares every
table's row count with live, checks the checksums and the storage file count, and drops the
throwaway database. Prints `RESTORE CHECK PASSED` or exits non-zero. It only reads live data.

Run it after any schema migration, and once a month.

## Restore for real

Only when the live data is actually lost or corrupted. **Stop the app first**, so nothing
writes while restoring.

```bash
PM2=~/.nvm/versions/node/v22.17.1/bin/pm2
$PM2 stop jas-api jas-worker

# 1. Pick the backup (newest shown first).
ls -1t ~/backups/jas-ad-studio/db_*.dump | head
DUMP=~/backups/jas-ad-studio/db_<stamp>.dump

# 2. Keep the broken database for investigation, then restore into a fresh one.
docker exec jas-ad-studio-dev-postgres-1 psql -U jas -d postgres -c 'ALTER DATABASE jas_ad_studio RENAME TO jas_ad_studio_broken'
docker exec jas-ad-studio-dev-postgres-1 createdb -U jas jas_ad_studio
docker exec -i jas-ad-studio-dev-postgres-1 pg_restore -U jas -d jas_ad_studio --no-owner --exit-on-error < "$DUMP"

# 3. Storage: move the current folder aside and unpack the matching tarball.
cd ~/projects/jas-ad-studio-api
mv storage storage.broken
tar -xzf ~/backups/jas-ad-studio/storage_<stamp>.tar.gz

$PM2 start jas-api jas-worker
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3040/health/ready
```

Anything created after the backup's stamp is gone, including orders and credits. Check
`credit_orders` and the owner panel against payment records before telling sellers it is fixed.
