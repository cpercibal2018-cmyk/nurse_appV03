#!/bin/bash
# gate1-kit/scripts/restore-database.sh "<TARGET_TIME>"
# Point-in-time recovery from the encrypted backup set.
#
# Usage:  TARGET_TIME="2026-09-18 09:30:00+00" ./restore-database.sh "$TARGET_TIME"
# Restores into RESTORE_PARENT/PGDATA on RESTORE_PORT, leaving the source
# cluster untouched so the drill can compare before/after.
#
# F-23 FIX 3: decryption uses a dedicated keyring holding the PRIVATE key
#   (restore host only). A passphrase file cannot decrypt a public-key
#   encrypted message — the reviewed baseline mixed the two.
# F-23 FIX 4: restore_command is routed through wal-restore.sh, which returns
#   non-zero without creating %p when a segment is missing.

set -euo pipefail

TARGET_TIME="${1:?usage: restore-database.sh '<YYYY-MM-DD HH:MM:SS+00>'}"
: "${BACKUP_STORAGE_PATH:?}"
: "${BACKUP_GPG_HOME:?}"
: "${RESTORE_PARENT:?}"
: "${RESTORE_PORT:?}"

PGBIN="${PGBIN:-/usr/lib/postgresql/15/bin}"
BACKUP_DIR="${BACKUP_STORAGE_PATH}/full"
WAL_DIR="${BACKUP_STORAGE_PATH}/wal"
RESTORE_DIR="${RESTORE_PARENT}/pgdata"
SOCK_DIR="${RESTORE_PARENT}/sock"
LOG_FILE="${BACKUP_LOG_FILE:-/dev/null}"

log() { printf '%s restore: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE" >&2; }

# 1. Locate the newest base backup taken BEFORE the target time
BACKUP_FILE=""
TARGET_EPOCH="$(date -u -d "${TARGET_TIME}" +%s)"
for f in $(ls -1 "${BACKUP_DIR}"/basebackup_*.gpg 2>/dev/null | sort); do
  ts="$(basename "$f" | sed 's/^basebackup_//; s/\.tar\.gz\.gpg$//')"
  # backup names are UTC: YYYYmmdd_HHMMSS
  epoch="$(date -u -d "${ts:0:8} ${ts:9:2}:${ts:11:2}:${ts:13:2}" +%s)"
  if [ "${epoch}" -le "${TARGET_EPOCH}" ]; then BACKUP_FILE="$f"; fi
done

if [ -z "${BACKUP_FILE}" ]; then
  log "ERROR: no base backup before ${TARGET_TIME}"
  exit 1
fi
log "using base backup $(basename "${BACKUP_FILE}") for target ${TARGET_TIME}"

# 2. Unpack: outer archive, then base.tar.gz + pg_wal.tar.gz into PGDATA
# Stop any instance left over from a previous run BEFORE touching its data
# directory. Deleting a live data directory under a running postmaster makes it
# die messily ("data directory lock file is invalid") and can leave the port
# bound, which then breaks this restore for reasons that look unrelated.
if [ -f "${RESTORE_DIR}/postmaster.pid" ]; then
  "${PGBIN}/pg_ctl" -D "${RESTORE_DIR}" stop -m immediate -w >/dev/null 2>&1 || true
fi

rm -rf "${RESTORE_DIR}" "${SOCK_DIR}"
mkdir -p "${RESTORE_DIR}" "${SOCK_DIR}"

UNPACK_DIR="${RESTORE_PARENT}/unpack"
rm -rf "${UNPACK_DIR}"; mkdir -p "${UNPACK_DIR}"

log "decrypting and unpacking"
gpg --batch --quiet --homedir "${BACKUP_GPG_HOME}" --decrypt "${BACKUP_FILE}" \
  | tar -xzf - -C "${UNPACK_DIR}"

INNER="${UNPACK_DIR}/$(basename "${BACKUP_FILE}" .tar.gz.gpg)"
[ -d "${INNER}" ] || { log "ERROR: unexpected backup layout in ${INNER}"; exit 1; }

tar -xzf "${INNER}/base.tar.gz" -C "${RESTORE_DIR}"
mkdir -p "${RESTORE_DIR}/pg_wal"
[ -f "${INNER}/pg_wal.tar.gz" ] && tar -xzf "${INNER}/pg_wal.tar.gz" -C "${RESTORE_DIR}/pg_wal"
chmod 700 "${RESTORE_DIR}"

# 3. Recovery configuration
touch "${RESTORE_DIR}/recovery.signal"
cat >> "${RESTORE_DIR}/postgresql.auto.conf" <<EOF
# Point-in-time recovery (drill)
restore_command = '${PWD}/scripts/wal-restore.sh ${WAL_DIR} ${BACKUP_GPG_HOME} %f %p'
recovery_target_time = '${TARGET_TIME}'
recovery_target_action = 'promote'
EOF

# 4. Start on a separate port and wait for promotion
#
# -c archive_mode=off: the drill target must NEVER write into the archive it is
#   recovering from. On promotion it would otherwise try to archive its new
#   timeline history file straight back into the production WAL archive.
log "starting recovery instance on port ${RESTORE_PORT}"
"${PGBIN}/pg_ctl" -D "${RESTORE_DIR}" -l "${RESTORE_PARENT}/recovery.log" \
  -o "-p ${RESTORE_PORT} -c unix_socket_directories=${SOCK_DIR} -c hot_standby=off -c archive_mode=off" \
  start -w -t 120 >/dev/null

for _ in $(seq 1 120); do
  STATE="$("${PGBIN}/psql" -U postgres -h "${SOCK_DIR}" -p "${RESTORE_PORT}" -d postgres -tAc \
    'SELECT pg_is_in_recovery()' 2>/dev/null || echo 't')"
  # -U postgres is REQUIRED. Without it psql assumes the OS user, the connection
  # fails, the `|| echo 't'` fallback reports "still in recovery", and the drill
  # burns its full timeout and then reports a false "did not reach target".
  [ "${STATE}" = "f" ] && break
  sleep 2
done

if [ "${STATE}" != "f" ]; then
  log "ERROR: recovery did not reach the target time"
  tail -30 "${RESTORE_PARENT}/recovery.log" >&2 || true
  exit 1
fi

log "recovery complete — database promoted"
echo "${RESTORE_DIR}"
