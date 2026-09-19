#!/bin/bash
# gate1-kit/scripts/nightly-backup.sh
# Full base backup, packed, encrypted and verified.
#
# F-23 FIX 1: `pg_basebackup --format=tar` writes a DIRECTORY containing
#   base.tar.gz (and pg_wal.tar.gz) — there is no single ${BACKUP_FILE}.tar.gz.
#   The reviewed baseline encrypted a path that never existed.
# F-23 FIX 2: `--gzip` is not a pg_basebackup option; bare `--compress=6` is the
#   pre-15 form. PostgreSQL 15 uses `--compress=gzip:6`.
# F-23 FIX 3: encryption is asymmetric (public key). Decryptability is proven
#   from the restore host during the drill — the private key is not here.

set -euo pipefail

: "${BACKUP_STORAGE_PATH:?}"
: "${BACKUP_ENCRYPTION_KEY_PATH:?}"
: "${DB_HOST:?}"; : "${DB_PORT:?}"; : "${DB_BACKUP_USER:?}"

PGBIN="${PGBIN:-/usr/lib/postgresql/15/bin}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_STORAGE_PATH}/full"
BACKUP_FILE="${BACKUP_DIR}/basebackup_${TIMESTAMP}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
LOG_FILE="${BACKUP_LOG_FILE:-/dev/null}"

log() { printf '%s nightly-backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE" >&2; }

mkdir -p "${BACKUP_DIR}"
log "starting backup ${TIMESTAMP}"

# 1. Base backup — PostgreSQL 15 syntax
"${PGBIN}/pg_basebackup" \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_BACKUP_USER}" \
  --pgdata="${BACKUP_FILE}" \
  --format=tar \
  --compress=gzip:6 \
  --checkpoint=fast \
  --write-recovery-conf \
  --no-password \
  >>"${LOG_FILE}" 2>&1 || { log "ERROR: pg_basebackup failed"; exit 1; }

# 2. Pack the backup directory into one archive, then encrypt it
tar -czf "${BACKUP_FILE}.tar.gz" -C "${BACKUP_DIR}" "$(basename "${BACKUP_FILE}")"
gpg --batch --yes --quiet \
    --recipient-file "${BACKUP_ENCRYPTION_KEY_PATH}" \
    --output "${BACKUP_FILE}.tar.gz.gpg" \
    --encrypt "${BACKUP_FILE}.tar.gz" || { log "ERROR: encryption failed"; exit 1; }

# 3. Verify the encrypted envelope is well formed
# Same pipefail trap as wal-archive.sh: capture the packets explicitly.
PKTS="$(gpg --batch --list-packets "${BACKUP_FILE}.tar.gz.gpg" 2>/dev/null || true)"
if ! printf '%s' "${PKTS}" | grep -qE '^(\:pubkey enc packet|\:encrypted data packet|\:public key encrypted data)'; then
  log "ERROR: backup envelope verification failed"
  exit 1
fi
log "envelope verification OK"

# 4. Metadata (no data content, per the backup security rules)
SIZE_BYTES="$(stat -c%s "${BACKUP_FILE}.tar.gz.gpg")"
CHECKSUM="$(sha256sum "${BACKUP_FILE}.tar.gz.gpg" | cut -d' ' -f1)"
WAL_POSITION="$("${PGBIN}/psql" -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_BACKUP_USER}" \
  -tAc 'SELECT pg_current_wal_lsn()' 2>/dev/null || echo 'unknown')"

cat > "${BACKUP_FILE}.meta.json" <<EOF
{
  "timestamp": "${TIMESTAMP}",
  "type": "full_base_backup",
  "pg_version": "$("${PGBIN}/pg_basebackup" --version | awk '{print $3}')",
  "size_bytes": ${SIZE_BYTES},
  "checksum_sha256": "${CHECKSUM}",
  "wal_position": "${WAL_POSITION}",
  "encrypted": true
}
EOF

# 5. Clean up unencrypted artifacts
rm -rf "${BACKUP_FILE}" "${BACKUP_FILE}.tar.gz"

# 6. Retention
find "${BACKUP_DIR}" -name "basebackup_*.gpg" -mtime +"${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -name "basebackup_*.meta.json" -mtime +"${RETENTION_DAYS}" -delete

log "backup complete: $(basename "${BACKUP_FILE}").tar.gz.gpg (${SIZE_BYTES} bytes, sha256 ${CHECKSUM:0:12}…)"
echo "${BACKUP_FILE}.tar.gz.gpg"
