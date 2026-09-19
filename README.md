# AIGH Nursing Workforce Management System — workspace

Specification, review, remediation and Gate 1 evidence for the AIGH nursing
workforce system (spec rev **2.8.7b**).

| Path | What it is |
| :--- | :--- |
| `uploads/AIGH_..._v2_8_6.md` | Untouched source specification (never edited) |
| `AIGH_..._v2_8_7.md` | Corrected specification — **generated** from v2.8.6 by the patch chain |
| `patch_v287.py` → `patch2` → `patch3` → `patch4` | The patch chain (102 patches). Paths are relative to the script; override with `AIGH_ROOT` |
| `replay_v287.py` | Rebuilds v2.8.7 in a temp dir and asserts SHA-256 identity with the committed file |
| `verify_integration.py` | Asserts all 32 review findings (F-01…F-32) are present in v2.8.7 |
| `AIGH_v2_8_6_review_analysis.md` | Independent review; `annotate_review_closure.py` adds closure status |
| `AIGH_v2_8_7_remediation_tracker.md` | Live work list (Waves 1A–4, decision gates U1–U3) |
| `AIGH_Phase1_*`, `AIGH_U1/U2/U3_*` | Execution plan and decision packs |
| `gate1-kit/` | PostgreSQL 15 backup / WAL archive / PITR restore / failure-drill scripts |
| `gate1-drill/` | Logs, public key and signed-off evidence records from the executed drill |
| `wave1a-kit/` | Reference implementations for the 12 Wave 1A tasks + static verifier |
| `ANALYSIS.md` | Repository check & analysis (2026-09-18) |

## Verify

```bash
python3 replay_v287.py                     # patch chain reproduces v2.8.7 byte-for-byte
python3 verify_integration.py              # 32/32 findings integrated
cd wave1a-kit && node scripts/verify-kit.mjs .   # 44/44 static checks
```

## What is deliberately *not* in Git

* **GPG keyrings and private keys** (`gate1-drill/gpg-backup/`, `gpg-restore/`).
  The restore key is generated without a passphrase by `setup-gpg.sh` and must
  live only on the restore host. Regenerate with `bash gate1-kit/scripts/setup-gpg.sh`.
* **Encrypted base backup and WAL segments** (`gate1-drill/backup/`, ~6.6 MB of
  opaque binaries). The drill regenerates them; keep real ones in object storage.
* The original `workspace.zip` upload, which contained all of the above.

See `.gitignore` for the full list.
