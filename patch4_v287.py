#!/usr/bin/env python3
"""Amendment 2.8.7b — closes F-23 (backup/restore script defects).

Fixes four defects in §10.6:
  1. pg_basebackup --format=tar writes a DIRECTORY; the old script encrypted a
     non-existent ${BACKUP_FILE}.tar.gz.
  2. (clarity only) --compress=gzip:6 replaces --gzip / --compress=6. All three
     forms are valid on PG 15.19 -- see F23-note-item2 below, which records
     the verified correction of the earlier, false claim.
  3. Encryption used GPG public-key while decryption used --passphrase-file
     (invalid combination). Restore now uses a dedicated private-key keyring.
  4. restore_command redirected gpg output into %p, which leaves a zero-length
     WAL file on failure and aborts recovery. A wrapper now handles it.

Blocks that contain shell continuations are replaced by ANCHOR SPAN (start and
end markers), so backslash escaping in this script cannot corrupt the match.
Asserts uniqueness; aborts without writing on any mismatch.
"""
import os
import pathlib

# Paths resolve relative to this script's directory (override with AIGH_ROOT).
ROOT = pathlib.Path(os.environ.get('AIGH_ROOT', pathlib.Path(__file__).resolve().parent))

DOC = ROOT / 'AIGH_Nursing_Workforce_Management_System_v2_8_7.md'
text = DOC.read_text(encoding='utf-8')
patches = []


def P(name, old, new, count=1):
    patches.append((name, old, new, count))


def BLOCK(name, start_marker, end_marker, new):
    """Replace the span from start_marker through end_marker (inclusive)."""
    global text
    if text.count(start_marker) != 1:
        patches.append((name, f"@@ANCHOR-START@@{start_marker}", new, 1))
        return
    i = text.index(start_marker)
    j = text.index(end_marker, i + len(start_marker))
    span = text[i:j + len(end_marker)]
    patches.append((name, span, new, 1))


# ------------------------------------------------------------------ header
P("HDR-2.8.7b",
  "KSA region allowlist correction",
  "KSA region allowlist correction; 2.8.7b — backup/restore script corrections (closes review finding F-23)")

# ------------------------------------------------------------------ correction note
P("F23-note",
  "**Implementation — WAL archive script:**",
  """**Correction applied in 2.8.7b (review finding F-23).** Four defects in the backup scripts of earlier revisions are fixed below:

1. `pg_basebackup --format=tar` writes a **directory** containing `base.tar.gz` (plus `pg_wal.tar.gz`), not a single `${BACKUP_FILE}.tar.gz` file. The old script then encrypted a path that never existed. The archive is now packed before encryption.
2. `--gzip` is not a `pg_basebackup` option, and bare `--compress=6` is the pre-15 form. PostgreSQL 15 uses `--compress=gzip:6`.
3. Encryption used GPG **public-key** (`--recipient-file`) while decryption used `--passphrase-file` — an invalid combination. Restore now uses a dedicated keyring holding the private key, on the restore host only.
4. `restore_command` redirected decrypt output straight into `%p`, leaving a zero-length WAL file when a segment was missing. A wrapper script now returns non-zero without creating the file.

**Implementation — WAL archive script:**""")

# ------------------------------------------------------------------ (1) wal-archive.sh
BLOCK("F23-wal-archive",
      "# /usr/local/bin/wal-archive.sh",
      "##WAL-ARCHIVE-END##" if False else "Archived WAL segment: ${WAL_FILENAME}\"",
      r'''# /usr/local/bin/wal-archive.sh
# Archives WAL segments to encrypted backup storage
# Called by PostgreSQL archive_command with %p (source path) and %f (filename).
# PostgreSQL retries archive_command until it succeeds, so this script must
# never leave a partial file behind: encrypt to a temporary path and move it
# into place only after the envelope check passes.

set -euo pipefail

SOURCE_PATH="$1"
WAL_FILENAME="$2"
BACKUP_DIR="${BACKUP_STORAGE_PATH}/wal"
ENCRYPTION_KEY_FILE="${BACKUP_ENCRYPTION_KEY_PATH}"   # public key — backup host only

mkdir -p "${BACKUP_DIR}"

TARGET="${BACKUP_DIR}/${WAL_FILENAME}.gpg"
TMP="${TARGET}.tmp.$$"
trap 'rm -f "${TMP}"' EXIT

# Encrypt to a temporary file
gpg --batch --yes \
    --recipient-file "${ENCRYPTION_KEY_FILE}" \
    --output "${TMP}" \
    --encrypt "${SOURCE_PATH}"

# Envelope check: non-empty and a public-key encrypted message
[ -s "${TMP}" ] || { logger -t wal-archive "ERROR: empty output for ${WAL_FILENAME}"; exit 1; }
gpg --batch --list-packets "${TMP}" 2>/dev/null | grep -q ':public key encrypted data:' \
  || { logger -t wal-archive "ERROR: ${WAL_FILENAME} is not a public-key encrypted file"; exit 1; }

mv -f "${TMP}" "${TARGET}"
trap - EXIT

logger -t wal-archive "Archived WAL segment: ${WAL_FILENAME}"
''')

# ------------------------------------------------------------------ (2) nightly pg_basebackup core
BLOCK("F23-nightly-core",
      "# 1. Full PostgreSQL base backup (compressed, checksummed)",
      'echo "Backup verification: OK"',
      r'''# 1. Full PostgreSQL base backup.
#    With --format=tar, pg_basebackup writes a DIRECTORY at ${BACKUP_FILE}
#    containing base.tar.gz (and pg_wal.tar.gz) — there is no single
#    ${BACKUP_FILE}.tar.gz. PostgreSQL 15 compresses with --compress=gzip:6;
#    --gzip does not exist and bare --compress=6 is the pre-15 syntax.
pg_basebackup \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_BACKUP_USER}" \
  --pgdata="${BACKUP_FILE}" \
  --format=tar \
  --compress=gzip:6 \
  --checkpoint=fast \
  --progress \
  --verbose \
  --write-recovery-conf

# 2. Pack the backup directory into a single archive, then encrypt it.
#    Asymmetric: this host holds only the PUBLIC key. Decryptability is
#    proven from the restore host (monthly drill), not here.
tar -czf "${BACKUP_FILE}.tar.gz" -C "${BACKUP_DIR}" "$(basename "${BACKUP_FILE}")"

gpg --batch --yes \
    --recipient-file "${ENCRYPTION_KEY_FILE}" \
    --output "${BACKUP_FILE}.tar.gz.gpg" \
    --encrypt "${BACKUP_FILE}.tar.gz"

# 3. Verify the encrypted envelope is well formed
gpg --batch --list-packets "${BACKUP_FILE}.tar.gz.gpg" 2>/dev/null | \
  grep -q ':public key encrypted data:'
echo "Backup envelope verification: OK"''')

# ------------------------------------------------------------------ (3) restore vars
P("F23-restore-vars",
  'DECRYPTION_KEY="${BACKUP_DECRYPTION_KEY_PATH}"',
  '# Dedicated GPG keyring holding the PRIVATE key. It exists on the restore\n# host only and is never present on the production database server.\nGPG_HOME="${BACKUP_GPG_HOME}"')

# ------------------------------------------------------------------ (4) restore decrypt
BLOCK("F23-restore-decrypt",
      'gpg --batch --passphrase-file "${DECRYPTION_KEY}"',
      'tar -xzf - -C "${RESTORE_DIR}"',
      r'''# Asymmetric decryption with the private key from the restore-host keyring.
# (A passphrase file cannot decrypt a public-key encrypted message.)
gpg --batch --homedir "${GPG_HOME}" \
    --decrypt "${BACKUP_FILE}" | \
  tar -xzf - -C "${RESTORE_DIR}"''')

# ------------------------------------------------------------------ config + helper
P("F23-restore-config",
  r"""cat >> "${RESTORE_DIR}/postgresql.auto.conf" << EOF
# PITR configuration
restore_command = 'gpg --batch --passphrase-file ${DECRYPTION_KEY} --decrypt ${WAL_DIR}/%f.gpg > %p'
recovery_target_time = '${TARGET_TIME}'
recovery_target_action = 'promote'
EOF""",
  r"""# restore_command must exit non-zero WITHOUT creating %p when a segment is
# not yet archived; `gpg --decrypt > %p` leaves a zero-length WAL file and
# aborts recovery. The wrapper below handles that case.
cat >> "${RESTORE_DIR}/postgresql.auto.conf" << EOF
# PITR configuration
restore_command = '/usr/local/bin/wal-restore.sh ${WAL_DIR} ${GPG_HOME} %f %p'
recovery_target_time = '${TARGET_TIME}'
recovery_target_action = 'promote'
EOF""")

P("F23-restore-helper",
  "**Post-restore verification checklist:**",
  r"""**Implementation — WAL restore helper (restore host only):**

```bash
#!/bin/bash
# /usr/local/bin/wal-restore.sh <wal_dir> <gpg_home> <wal_filename> <destination>
# Called by PostgreSQL's restore_command. Must return non-zero when the segment
# is not yet archived, and must never leave a partial destination file.

set -euo pipefail

WAL_DIR="$1"
GPG_HOME="$2"
WAL_FILENAME="$3"
DEST="$4"

SRC="${WAL_DIR}/${WAL_FILENAME}.gpg"
[ -f "${SRC}" ] || exit 1                     # not archived yet — PostgreSQL retries

TMP="${DEST}.tmp.$$"
if gpg --batch --homedir "${GPG_HOME}" --decrypt --output "${TMP}" "${SRC}" 2>/dev/null \
   && [ -s "${TMP}" ]; then
  mv -f "${TMP}" "${DEST}"
else
  rm -f "${TMP}"
  exit 1
fi
```

**Post-restore verification checklist:**""")

# ------------------------------------------------------------------ env, rules, criteria
P("F23-env",
  """BACKUP_ENCRYPTION_KEY_PATH=/etc/nurseapp/backup.pub # GPG public key for encryption
BACKUP_DECRYPTION_KEY_PATH=/etc/nurseapp/backup.key # GPG private key (restore host only — NEVER on production)""",
  """BACKUP_ENCRYPTION_KEY_PATH=/etc/nurseapp/backup.pub # GPG PUBLIC key — backup host only
BACKUP_GPG_HOME=/etc/nurseapp/gpg-restore           # dedicated keyring holding the PRIVATE key — restore host only, NEVER on production""")

P("F23-rules",
  "- Encrypted backups are verified (decryption + header check) immediately after creation. A failed verification triggers an immediate alert.",
  """- Immediately after creation, every backup is verified on the backup host as a **well-formed encrypted envelope** (non-empty, public-key encrypted). Decryptability is proven from the restore host during the monthly drill — the private key is deliberately absent from the production database server.
- `archive_command` and `restore_command` both publish files atomically (write to a temporary path, then move), so an interrupted run can never leave a partial file that PostgreSQL would treat as valid.""")

P("F23-acceptance",
  "| Encryption | Backups are encrypted at rest; decryption key is not on the production server |",
  """| Encryption | Backups are encrypted at rest; decryption uses a dedicated restore-host keyring holding the private key, which is absent from the production database server; each monthly drill proves decryptability end-to-end |
| Script correctness | `pg_basebackup` completes with `--format=tar --compress=gzip:6`; the packed archive is encrypted (no reference to a non-existent path); `restore_command` returns non-zero without creating an empty WAL file when a segment is missing |""")

# ------------------------------------------------------------------ correction of item 2
# Verified by execution on PostgreSQL 15.19 (2026-09-18): --gzip and --compress=6
# are valid; item 2 is a clarity change, not a functional defect. Previously this
# text was hand-edited into the document and never captured here, which broke
# byte-identical replay.
P("F23-note-item2",
  '2. `--gzip` is not a `pg_basebackup` option, and bare `--compress=6` is the pre-15 form. PostgreSQL 15 uses `--compress=gzip:6`.',
  '2. **Correction of the correction (verified by execution on the deployment target, PostgreSQL 15.19, 2026-09-18).** An earlier draft of this revision asserted that "`--gzip` is not a `pg_basebackup` option" and that bare `--compress=6` was superseded. Both statements are false. Executed on PostgreSQL 15.19: `--format=tar --gzip` succeeds, `--format=tar --compress=6` succeeds, and `--format=tar --compress=gzip:6` succeeds — all three produce `base.tar.gz`. PostgreSQL 15 and 16 documentation lists `-z, --gzip`, `-Z level, --compress=level` and `-Z [{client|server}-]method[:detail]` as simultaneously valid; the `METHOD[:DETAIL]` form is an addition, not a replacement. The scripts therefore keep `--compress=gzip:6` for clarity and forward-compatibility, but this is recorded as a **clarity change, not a functional defect**. F-23\'s functional defects are items 1, 3 and 4.')

# ------------------------------------------------------------------ run
print(f"Patches defined: {len(patches)}")
failures = []
for name, old, new, count in patches:
    found = text.count(old)
    if found != count:
        failures.append((name, found, count))
        print(f"FAIL  {name}: found {found}, expected {count}")
    else:
        text = text.replace(old, new)
        print(f"ok    {name} ({count})")

if failures:
    print(f"\n{len(failures)} patch(es) failed — output NOT written.")
    raise SystemExit(1)

DOC.write_text(text, encoding='utf-8')
print(f"\nAll {len(patches)} patches applied. Updated {DOC}")
