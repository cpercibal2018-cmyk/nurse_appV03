#!/bin/bash
# gate1-kit/scripts/rebuild.sh [--clean]
#
# Cold-start rebuild of the whole Gate 1 sandbox in one command: keyrings,
# cluster + schema + synthetic data, encrypted base backup, and the timed
# provable-PITR drill ending in gate1-evidence.md.
#
# With --clean it first stops any running sandbox clusters and deletes their
# data directories, the restore directory and the backup set. Everything it
# deletes is regenerable, which is what makes this kit safe to prune: the
# cluster data directories are ~300 MB of preallocated 16 MB WAL segments and
# do not need to be carried between sessions.
#
# NOTE: setup-cluster.sh bakes an absolute path to wal-archive.sh into
# postgresql.conf, derived from the working directory at setup time. This
# script therefore cd's to the kit root first; run it from anywhere, but do not
# move the kit afterwards without rebuilding.

set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${KIT_DIR}"

ROOT="${ROOT:-/home/user/gate1-drill}"
RESTORE_PARENT="${RESTORE_PARENT:-/home/user/gate1-restore}"
SOURCE_PORT="${SOURCE_PORT:-5515}"
RESTORE_PORT="${RESTORE_PORT:-5516}"
DB_NAME="${DB_NAME:-nurseapp}"

export PGBIN="${PGBIN:-/usr/lib/postgresql/15/bin}"
export ROOT RESTORE_PARENT SOURCE_PORT RESTORE_PORT DB_NAME

export BACKUP_STORAGE_PATH="${BACKUP_STORAGE_PATH:-${ROOT}/backup}"
export BACKUP_ENCRYPTION_KEY_PATH="${BACKUP_ENCRYPTION_KEY_PATH:-${ROOT}/backup.pub}"
export BACKUP_LOG_FILE="${BACKUP_LOG_FILE:-${ROOT}/backup.log}"
export GNUPGHOME="${GNUPGHOME:-${ROOT}/gpg-backup}"
export BACKUP_GPG_HOME="${BACKUP_GPG_HOME:-${ROOT}/gpg-restore}"
export EVIDENCE_FILE="${EVIDENCE_FILE:-${ROOT}/gate1-evidence.md}"
export RTO_MINUTES="${RTO_MINUTES:-240}"

export DB_HOST="${DB_HOST:-${ROOT}/sock}"
export DB_PORT="${DB_PORT:-${SOURCE_PORT}}"
export DB_BACKUP_USER="${DB_BACKUP_USER:-postgres}"
export SOURCE_SOCK="${ROOT}/sock"

export PGPORT="${SOURCE_PORT}"

# ── Optional clean slate ────────────────────────────────────────────────────
if [ "${1:-}" = "--clean" ]; then
  echo "── clean slate ──"
  for d in "${ROOT}/pgdata" "${RESTORE_PARENT}/pgdata"; do
    if [ -f "${d}/PG_VERSION" ]; then
      "${PGBIN}/pg_ctl" -D "${d}" stop -m fast -w >/dev/null 2>&1 || true
      echo "  stopped cluster at ${d}"
    fi
  done
  rm -rf "${ROOT}/pgdata" "${ROOT}/sock" "${ROOT}/backup" \
         "${ROOT}/gpg-backup" "${ROOT}/gpg-restore" "${ROOT}/backup.pub" \
         "${ROOT}/backup.log" "${ROOT}/postgres.log" "${ROOT}/gate1-evidence.md" \
         "${RESTORE_PARENT}"
  echo "  removed regenerable state (cluster data, backups, keyrings)"
else
  # Even without --clean, a stale restore instance would hold the socket dir.
  if [ -f "${RESTORE_PARENT}/pgdata/PG_VERSION" ]; then
    "${PGBIN}/pg_ctl" -D "${RESTORE_PARENT}/pgdata" stop -m fast -w >/dev/null 2>&1 || true
  fi
fi

mkdir -p "${ROOT}" "${RESTORE_PARENT}"

# ── 1. Keyrings ─────────────────────────────────────────────────────────────
echo "── 1/4 keyrings (public on backup host, private on restore host) ──"
bash scripts/setup-gpg.sh "${ROOT}" | sed 's/^/  /'

# ── 2. Cluster, schema, synthetic data ──────────────────────────────────────
echo "── 2/4 cluster + schema + synthetic workforce ──"
PGPORT="${SOURCE_PORT}" bash scripts/setup-cluster.sh "${ROOT}" | sed 's/^/  /'

# ── 3. Base backup ──────────────────────────────────────────────────────────
echo "── 3/4 encrypted base backup ──"
BASE="$(bash scripts/nightly-backup.sh 2>&1 | tail -1)"
echo "  ${BASE}"

# ── 4. Provable PITR drill ──────────────────────────────────────────────────
echo "── 4/4 provable PITR drill ──"
bash scripts/pitr-proof.sh

echo
echo "── rebuild complete ──"
echo "evidence: ${EVIDENCE_FILE}"
echo
echo "To free the ~300 MB of regenerable cluster data while keeping the result:"
echo "  ${PGBIN}/pg_ctl -D ${ROOT}/pgdata stop -m fast"
echo "  ${PGBIN}/pg_ctl -D ${RESTORE_PARENT}/pgdata stop -m fast"
echo "  rm -rf ${ROOT}/pgdata ${ROOT}/sock ${RESTORE_PARENT}"
echo "Rebuild at any time with: bash scripts/rebuild.sh --clean"
