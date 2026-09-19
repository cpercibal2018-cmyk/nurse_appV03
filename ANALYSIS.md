# Repository Check & Analysis — 2026-09-18

## What is in the repo

The Git repository contains only two files: a one-line `README.md` and a 7.2 MB
`workspace.zip` (117 files, 8.2 MB unpacked). The zip is a snapshot of a home
directory for the **AIGH Nursing Workforce Management System** project:

| Area | Contents |
| :--- | :--- |
| Specification | `AIGH_..._v2_8_6.md` (source, 384 KB) and `..._v2_8_7.md` (patched, 424 KB, rev 2.8.7b) |
| Patch chain | `patch_v287.py` → `patch2_v287.py` → `patch3_v287.py` → `patch4_v287.py` (101 patches) + `verify_integration.py`, `annotate_review_closure.py` |
| Review / planning docs | review analysis (F-01…F-32), remediation tracker, integration verification, Phase 1 plan, U1/U2/U3 decision packs |
| `gate1-kit/` | 10 bash scripts + 4 SQL files: PostgreSQL 15 backup / WAL archive / PITR restore / failure drill |
| `gate1-drill/` | **Executed output** of that kit: encrypted base backup + 7 WAL segments, logs, evidence records, and two GPG keyrings |
| `wave1a-kit/` | 22 reference-implementation files (NestJS/Prisma/React) for Wave 1A tasks + `verify-kit.mjs` |

## What was verified by execution

| Check | Result |
| :--- | :--- |
| `python3 -m py_compile` on all 6 Python scripts | PASS |
| `bash -n` on all 10 shell scripts | PASS |
| `verify_integration.py` (32 review findings present in v2.8.7) | **32/32, 0 open** — PASS |
| `wave1a-kit/scripts/verify-kit.mjs` | **44/44** — PASS |
| `node --check check-bundle-size.mjs` | PASS |
| `uploads/v2_8_6.md` == root `v2_8_6.md` (untouched source) | Identical (MD5 `6e9dfb8f…`) |
| Replay all 4 patch scripts from pristine v2.8.6 and compare with delivered v2.8.7 | **FAIL — differs** (see Finding 1) |

## Findings

### 1. "Byte-identical replay" claim is false (documentation integrity) — **FIXED**

> Resolved: the missing paragraph is now patch `F23-note-item2` in `patch4_v287.py`; `replay_v287.py` proves SHA-256 identity; report/tracker counts corrected (102 patches).

`AIGH_v2_8_7_integration_verification.md` §1–2 and the remediation tracker both state
that replaying the four patch scripts against the untouched v2.8.6 source reproduces
the delivered v2.8.7 **byte-for-byte** (MD5 `c455…`). Actual replay:

```
rebuilt   83e6c50ce18c30dbef5592881a22240a
delivered 44440d3aec53a63cf2f2feebb7bb0899   (neither is c455…)
```

Exactly one line differs (line 7140, F-23 item 2). The delivered document contains a
manually-added "**Correction of the correction**" paragraph — recorded after executing
`pg_basebackup` on PG 15.19 and discovering that `--gzip` and `--compress=6` *are* valid —
that was never folded back into `patch4_v287.py`. The verification report also quotes
a stale size (422,990 bytes / 8,777 lines vs. actual 423,742 / 8,789).

**Fix:** add the correction as a patch in `patch4_v287.py` (or a `patch5`), re-run the
replay, and update the MD5/size in the verification report.

### 2. Unprotected GPG private key committed alongside the backups it decrypts (security) — **FIXED in tree, still in history**

> Resolved for HEAD: zip removed, keyrings/backups excluded via `.gitignore`. The key remains in commit `09828e0` until history is rewritten; the key must be considered compromised and regenerated (`setup-gpg.sh`) before any real use.

`gate1-drill/gpg-restore/private-keys-v1.d/EF6773D6….key` is an RSA private key with
**no passphrase** (`setup-gpg.sh` creates it with `--passphrase ''`), packaged in the same
zip as the encrypted base backup and WAL archives it decrypts. This defeats the
"backup host can encrypt but cannot decrypt" separation that the kit's own README calls
"the point". The data is synthetic (120 employees, 47 units), so there is no PDPL
exposure today, but committing this pattern to Git normalises it.

Also present: `.gnupg/pubring.kbx`, `gpg-backup/random_seed`, `trustdb.gpg`,
`.sudo_as_admin_successful` — none of which belong in a repository.

**Fix:** strip `gate1-drill/gpg-*/`, `.gnupg/` and the binary backup artefacts from the
archive; keep only the logs and the two evidence `.md` files as proof of execution.

### 3. Hard-coded absolute paths in the patch chain (reproducibility) — **FIXED**

> Resolved: all six scripts resolve paths relative to their own directory (`AIGH_ROOT` env overrides).

All four patch scripts and `verify_integration.py` hard-code `/home/user/...`. The
replay only worked after `sed`-rewriting the paths. Replace with `pathlib.Path(__file__).parent`
or a CLI argument so the "re-runnable generator" claim holds on any machine.

### 4. Repository hygiene — **FIXED**

> Resolved: tree extracted (67 files), zip and duplicate v2.8.6 dropped, `.gitignore` added.

* A 7 MB zip is checked in instead of the tree. Git cannot diff, review or blame any
  of the 117 files. Extract the tree, commit the sources, and `.gitignore`
  `gate1-drill/backup/` and the keyrings.
* ~6.6 MB of the zip is opaque binary backup data (`*.tar.gz.gpg`, `*.gpg` WAL).
* `AIGH_..._v2_8_6.md` exists twice (root and `uploads/`), identical.

### 5. Evidence records are unsigned

Both `gate1-evidence.md` and `gate1-failure-evidence.md` have empty Operator/Reviewer
sign-off tables. The drill numbers themselves are internally consistent (120 / 245 / 47 /
582 match across backup.log, postgres.log and both evidence files; RPO 298 s ≤ 300 s bound).

## Overall assessment

The engineering content is substantive and largely self-consistent: the verifiers pass,
the drill artefacts corroborate each other, and the remediation tracker maps findings to
files correctly. The two things that need attention before this is relied upon are
(1) the false "byte-identical" reproducibility claim — the patch chain must be brought
back in sync with the delivered document — and (2) the private key packaged with the
backups it unlocks, which should be removed from version control.
