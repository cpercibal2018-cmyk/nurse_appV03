#!/usr/bin/env python3
"""Adds a closure-status layer to the v2.8.6 review document.

The finding text is preserved verbatim as the record of what was found; each
finding gains a status line recording where it was fixed. Asserts every anchor.
"""
import os
import pathlib

# Paths resolve relative to this script's directory (override with AIGH_ROOT).
ROOT = pathlib.Path(os.environ.get('AIGH_ROOT', pathlib.Path(__file__).resolve().parent))
import re

DOC = ROOT / 'AIGH_v2_8_6_review_analysis.md'
text = DOC.read_text(encoding='utf-8')

# ---------------------------------------------------------------- closure notes
CLOSURE = {
 "F-01": ("2.8.7 + 2.8.7a",
   "Catalog, summary, §11.3 and the hosting brief reconciled to 47 units / 582 beds; 2.8.7a reframes the total as an editable seeded baseline with bulk API, CSV import and a configuration grid, so capacity can be changed in-system and the acceptance test no longer freezes a number"),
 "F-02": ("2.8.7",
   "Dockerfile rebuilt on `node:20-alpine` with an explicit `npx prisma generate`, a prod-deps stage, `NODE_ENV=production` and a `HEALTHCHECK`"),
 "F-03": ("2.8.7",
   "Cookie renamed `nurseapp_refresh` with `SameSite=Lax`; the illegal `__Host-` + path combination removed and the reason documented inline"),
 "F-04": ("2.8.7",
   "Guard ordering corrected: `@UseGuards(AuthGuard, RbacGuard, CsrfGuard)` at controller level; the `APP_GUARD` registration removed with an explanatory note"),
 "F-05": ("2.8.7",
   "`REVOKE INSERT` narrowed to `employees`; contracts stay writable for HR create/renew/terminate under the new `fn_contract_status_guard` trigger"),
 "F-06": ("2.8.7",
   "Canonical `audit_entries` DDL and hash-chained `fn_append_audit_entry` added to §9.1; restore script rewritten against `audit_entries` with a correct `lag()` chain check"),
 "F-07": ("2.8.7",
   "V32 tagged on the quarantine DDL; `V35_pdpl_controls.sql` written (ciphertext columns, processing register, data-subject requests); V37 gains `*_blind_key_version` columns"),
 "F-08": ("2.8.7",
   "Runbook now expects 68 unit / 20 PG tests; baseline relabelled Node 24 / PostgreSQL 17.11; `_Fill after run_` cells made mandatory before sign-off"),
 "F-09": ("2.8.7",
   "Processing lease added (DDL, guard, upsert, cleanup reaping); replay payload limited to resource identifiers; claim corrected to match the implementation"),
 "F-10": ("2.8.7",
   "`refreshState(tx, …)` accepts the caller's transaction; publication re-validates against the canonical engine; state table scoped to pool and dashboard reads; §11.3 criterion corrected"),
 "F-11": ("2.8.7",
   "V49 `worker_leases` table and `WorkerLeaseService.withLease()` replace session-scoped advisory locks across all seven jobs; legacy blocks marked SUPERSEDED"),
 "F-12": ("2.8.7",
   "Active-position check added, audit written through `fn_append_audit_entry`, `SET search_path` applied, blanket `EXCEPTION WHEN OTHERS` removed"),
 "F-13": ("2.8.7",
   "`SELECT … FOR UPDATE`, PENDING precondition, execution on the same transaction client, and a partial unique index replacing the ineffective constraint"),
 "F-14": ("2.8.7",
   "Missing state row now logged as drift and refreshed with `continue` — no dereference, no crash"),
 "F-15": ("2.8.7",
   "`Practitioner` and `PractitionerRole` split into valid R4 resources; controller decorated and guarded; validator requirement stated"),
 "F-16": ("2.8.7",
   "Explicit `Asia/Riyadh` timestamptz construction; phantom `start_date` removed; a 15-minute window bounds repeat alerts"),
 "F-17": ("2.8.7",
   "Design decision taken and documented: `SameSite=Lax` plus the Origin/CSRF check, so the IdP redirect can complete"),
 "F-18": ("2.8.7",
   "`chk_waiver_max_window` (72 h) and `chk_waiver_future` added to V48; enforcement bullet added to §6.1.2"),
 "F-19": ("2.8.7 + 2.8.7a",
   "Pepper rotation via `*_blind_key_version`; residency control scope stated honestly; erasure scope extended to backups. 2.8.7a corrected the example allowlist — `me-south-1` is Bahrain, not KSA — and made the startup check fail closed"),
 "F-20": ("2.8.7",
   "`chunkSizeWarningLimit` framed as a raw-kB warning that must not be raised; `@tanstack/react-query` added to vendor chunks; `scripts/check-bundle-size.mjs` CI gate specified; criterion updated"),
 "F-21": ("2.8.7",
   "Compose hardened: proxy service, `expose` instead of published ports, healthchecks with `condition: service_healthy`, restart policies on every service"),
 "F-22": ("2.8.7",
   "Covered by the Dockerfile rewrite — `--omit=dev`, explicit Prisma generate, `NODE_ENV=production`, `HEALTHCHECK`"),
 "F-23": ("2.8.7b",
   "`--compress=gzip:6`; archive packed before encryption; restore uses a private-key keyring instead of an invalid passphrase file; `wal-restore.sh` prevents zero-length WAL files; retention derived from config"),
 "F-24": ("2.8.7",
   "RPO stated as ≤5 minutes with the `archive_timeout = 300` derivation and the condition for a tighter target; acceptance row corrected"),
 "F-25": ("2.8.7",
   "Selector aligned to `GET /api/v1/positions` in §3.1.1"),
 "F-26": ("2.8.7",
   "Workshop row now reads \"Nursing Supervisor\" with an explicit caution that \"Nurse Specialist\" is an SCFHS classification, not a position code"),
 "F-27": ("2.8.7",
   "§0.3 now reads \"V27–V48\""),
 "F-28": ("2.8.7",
   "V45 row cites §14.1–14.3"),
 "F-29": ("2.8.7",
   "V47 extended with `migration_audit_log`, `unit_map`, `position_map`, `map_unit()` and `map_pos()`"),
 "F-30": ("2.8.7",
   "Criterion reworded to credential custody and pipeline scope, with the DDL-implies-read caveat stated"),
 "F-31": ("2.8.7",
   "§12 now reads \"Thirty-nine sections\""),
 "F-32": ("2.8.7",
   "Contents expanded (2.8, 3.4, 6.1.1, 9.2, 9.5, 11.4–11.5, 13.1–13.3) with a coverage note; fill-in cells made mandatory in Step 5"),
}

BANNER = """## 0. Closure status — added 18 September 2026

> **This document is the record of the independent review of v2.8.6.** The finding text below is preserved verbatim as the evidence of what was found; a **status line** was added to every finding after remediation.
>
> **All 32 findings are CLOSED** — 8 P0, 12 P1 and 12 P2 — delivered across four re-runnable revision passes on `AIGH_Nursing_Workforce_Management_System_v2_8_7.md`:
>
> | Pass | Revision | Closes |
> | :--- | :--- | :--- |
> | 1 | 2.8.7 (41 patches) | P0 F-01…F-08, plus F-21, F-22 |
> | 2 | 2.8.7 (40 patches) | P1 F-09…F-20, P2 F-24…F-32 |
> | 3 | 2.8.7a (9 patches) | F-01 reframed as runtime configuration; F-19 residency allowlist corrected (KSA-only) |
> | 4 | 2.8.7b (11 patches) | F-23 backup/restore scripts |
>
> **Verification:** `verify_integration.py` reports **32 / 32 integrated, 0 open**; replaying the four patch scripts against the untouched v2.8.6 source reproduces the delivered document byte-for-byte. See `AIGH_v2_8_7_integration_verification.md`.
>
> **Scope note:** closure means the *specification* no longer contains the defect. Findings whose fix requires code, deployment or a hospital decision carry a residual task in `AIGH_v2_8_7_remediation_tracker.md` (items B-02…B-26) — the status lines below name the artifact, not a claim that the running system is production-ready.

---

"""

# ---------------------------------------------------------------- apply
failures = []

# 1. banner before "## 1. What this document actually is"
anchor = "## 1. What this document actually is"
if text.count(anchor) != 1:
    failures.append(("banner-anchor", text.count(anchor), 1))
else:
    text = text.replace(anchor, BANNER + anchor, 1)

# 2. status line after each finding heading (F-01…F-20 only; F-21…F-32 are table rows)
for fid, (rev, note) in CLOSURE.items():
    if int(fid.split('-')[1]) > 20:
        continue
    pattern = re.compile(r'^(### ' + fid + r' .*)$', re.M)
    m = pattern.search(text)
    if not m or pattern.findall(text).__len__() != 1:
        failures.append((f"heading {fid}", len(pattern.findall(text)), 1))
        continue
    status = f"\n\n**Status: CLOSED ({rev})** — {note}. *Verified by `verify_integration.py`.*"
    text = text[:m.end()] + status + text[m.end():]

# 3. P2 table — add a Status column
P2_HEADER = "| ID | Finding | Location |"
if text.count(P2_HEADER) != 1:
    failures.append(("p2-header", text.count(P2_HEADER), 1))
else:
    text = text.replace(P2_HEADER, "| ID | Finding | Location | Status |", 1)
    text = text.replace("| :--- | :--- | :--- |\n",
                        "| :--- | :--- | :--- | :--- |\n", 1)
    p2_rev = {"F-23": "2.8.7b"}
    for n in range(21, 33):
        fid = f"F-{n}"
        pat = re.compile(r'^(\| ' + fid + r' \| .*\|)$', re.M)
        rows = pat.findall(text)
        if len(rows) != 1:
            failures.append((f"p2-row {fid}", len(rows), 1))
            continue
        row = rows[0]
        short = {"F-21": "compose hardened", "F-22": "Dockerfile rewritten",
                 "F-23": "backup/restore scripts corrected", "F-24": "RPO ≤5 min stated",
                 "F-25": "route aligned", "F-26": "NS naming clarified",
                 "F-27": "range corrected", "F-28": "section ref fixed",
                 "F-29": "objects defined", "F-30": "criterion reworded",
                 "F-31": "count corrected", "F-32": "contents fixed"}[fid]
        new_row = row[:-1].rstrip() + f" | CLOSED ({p2_rev.get(fid, '2.8.7')}) — {short} |"
        text = text.replace(row, new_row, 1)

# 4. bottom line outcome paragraph
bl_anchor = "Treat v2.8.6 as an excellent specification with eight mechanical defects and a roadmap that needs one structural re-cut. Fix the P0s, correct the five numbers, split Phase 1, and the next revision is genuinely stageable."
if text.count(bl_anchor) != 1:
    failures.append(("bottom-line", text.count(bl_anchor), 1))
else:
    text = text.replace(bl_anchor, bl_anchor + """

**Outcome (18 September 2026):** this recommendation was carried out. All 32 findings are closed in v2.8.7 / 2.8.7a / 2.8.7b; the Phase 1 re-cut became the Gate 1 sandbox and decision sprint in `AIGH_Phase1_Execution_Plan_U1_Unblock.md`; and unit/bed capacity was reframed as in-system configuration rather than a frozen acceptance number. The remaining risk is no longer the specification — it is the three unsigned hospital decisions (hosting, credential policy, SCFHS agreement) and the Wave 1A/1B engineering that needs the application codebase.""", 1)

# 5. trailing note
old_note = "*Note: this review assesses the document, not the NurseApp v0.2.1 codebase (not provided). Where a finding concerns runtime behaviour, it is inferred from the specification's own code and configuration.*"
new_note = "*Note: this review assessed the v2.8.6 document, not the NurseApp v0.2.1 codebase (not provided). Where a finding concerns runtime behaviour, it was inferred from the specification's own code and configuration. Status lines and the closure banner were added on 18 September 2026 after remediation; the finding text itself is unchanged.*"
if text.count(old_note) != 1:
    failures.append(("trailing-note", text.count(old_note), 1))
else:
    text = text.replace(old_note, new_note, 1)

if failures:
    print("FAILED anchors:")
    for f in failures:
        print("  ", f)
    raise SystemExit(1)

DOC.write_text(text, encoding='utf-8')
print("Closure layer applied:")
print(f"  findings annotated : {len(CLOSURE)}")
print("  banner             : added")
print("  P2 status column   : added")
print("  bottom line        : updated")
print(f"  size               : {len(text)} bytes")
