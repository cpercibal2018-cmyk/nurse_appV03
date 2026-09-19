# Integration Verification Report — AIGH Specification v2.8.7 (rev 2.8.7c)

**Verified:** 18 September 2026 · re-verified 19 September 2026 (rev 2.8.7c)
**Target document:** `AIGH_Nursing_Workforce_Management_System_v2_8_7.md` (430,342 bytes · 8,869 lines)
**Method:** full replay of every patch script against the untouched v2.8.6 source, byte-level comparison, and automated finding-coverage checks — not a manual reading.

---

## 1. Verdict

| Question | Answer |
| :--- | :--- |
| Are all patch scripts integrated into the specification? | **YES — 113 of 113 patches** across five passes |
| Is the result reproducible? | **YES — byte-identical** on replay from the untouched source (SHA-256 `60980d72…`); re-provable any time with `python3 replay_v287.py` |
| Are all review findings integrated? | **YES — 38 of 38**, 0 open (`verify_integration.py`) |
| Is anything left to integrate in this session? | **Nothing document-level.** Remaining items are code/ops work on the NurseApp codebase, which was not provided (see §6) |

---

## 2. The integration test that was actually run

Integration was *proven*, not assumed: the delivered document was destroyed and rebuilt from scratch.

```
uploads/AIGH_..._v2_8_6.md          ← untouched original, never modified
        │
        ├─ patch_v287.py        → 41 patches
        ├─ patch2_v287.py       → 40 patches
        ├─ patch3_v287.py       →  9 patches
        ├─ patch4_v287.py       → 12 patches
        └─ patch5_v287.py       → 11 patches
        ↓
   rebuilt v2.8.7  ==  delivered v2.8.7 ?   →  IDENTICAL (SHA-256 60980d72… · `replay_v287.py`)

> **Re-verification 2026-09-18 (later the same day).** A first replay found the delivered
> document one paragraph ahead of the patch chain: the F-23 item-2 "correction of the
> correction" had been hand-edited into the document and never captured as a patch, so the
> earlier MD5 claim in this report did not hold. The paragraph is now patch `F23-note-item2`
> in `patch4_v287.py` (11 → 12 patches, 101 → 102 total), all scripts resolve paths relative
> to their own location (override with `AIGH_ROOT`), and `replay_v287.py` automates the proof.
```

> **Re-verification 2026-09-19 (rev 2.8.7c).** The specification was amended again after the
> NurseApp codebase was built against it (`patch5_v287.py`, 11 patches, findings F-33…F-38).
> The five-script chain replays byte-for-byte from the untouched v2.8.6 source; every figure
> quoted in this report — patch count, byte size, line count and SHA-256 — was re-measured
> after the amendment, not carried forward.

**Result: identical.** The delivered file contains every patch, nothing was applied twice, and no manual edit exists outside the patch scripts. Re-running the five scripts any time from the pristine v2.8.6 source reproduces the exact document.

---

## 3. Finding coverage — 38 of 38

`verify_integration.py` checks each finding for its required markers **and** for the absence of the stale text it replaced.

| | Findings |
| :--- | :--- |
| **Integrated (38)** | F-01 units/beds · F-02 Node 20 image · F-03 refresh cookie · F-04 CSRF ordering · F-05 privilege scope · F-06 audit schema · F-07 V32/V35 bodies · F-08 runbook counts · F-09 idempotency · F-10 eligibility transaction · F-11 worker leases · F-12 onboarding function · F-13 four-eyes · F-14 auditor null-safety · F-15 FHIR validity · F-16 attendance timezone · F-17 SSO cookie · F-18 waiver limits · F-19 PDPL soft spots · F-20 bundle budget · F-21 compose hardening · F-22 Dockerfile hygiene · **F-23 backup scripts** · F-24 RPO arithmetic · F-25 endpoint drift · F-26 NS naming · F-27 §0.3 range · F-28 V45 section · F-29 migration objects · F-30 criterion · F-31 §12 counts · F-32 contents · **F-33 Job Number format** · **F-34 employee record** · **F-35 onboarding function (2.8.7c)** · **F-36 Hijri contract dates** · **F-37 contract guards** · **F-38 renewal prefill** |
| **Open** | **none** |

F-23 was the last gap and was closed in this session (rev 2.8.7b): `pg_basebackup` now uses `--format=tar --compress=gzip:6` with the archive packed before encryption; restore decrypts with a private-key keyring instead of an invalid passphrase file; and `wal-restore.sh` prevents `restore_command` from leaving zero-length WAL files.

---

## 4. Patch inventory (113 patches across five passes)

| Script | Revision | Patches | Scope |
| :--- | :--- | :---: | :--- |
| `patch_v287.py` | 2.8.7 | 41 | P0 fixes: totals, Dockerfile, compose, cookie, CSRF, privilege scope, audit schema, V32/V35, runbook |
| `patch2_v287.py` | 2.8.7 | 40 | P1/P2: idempotency lease, worker leases (V49), FHIR, attendance, waivers, PDPL, bundle budget, RPO, hygiene |
| `patch3_v287.py` | 2.8.7a | 9 | Capacity as runtime configuration (bulk API + CSV import + grid), acceptance robustness, KSA region allowlist |
| `patch4_v287.py` | 2.8.7b | 12 | Backup/restore script corrections (F-23), incl. the verified item-2 correction note |
| `patch5_v287.py` | 2.8.7c | 11 | Employee record shape and contract guards (F-33–F-38): no Job Number format rule, First/Middle/Last with derived Full Name, nine HR attributes, required Hijri contract dates, guards in the service layer, renewal prefill |
| | **Total** | **113** | |

Every script asserts an exact match count per patch and **aborts without writing** if any anchor is missing — so a partial or corrupted application is impossible.

---

## 5. Document-level changes delivered this session

| Area | Change |
| :--- | :--- |
| **Hospital structure** | Seeded baseline stated as 47 units / 582 beds (EMAC 133 · SURG 38 · CRIT 165 · GNSP 246 · CORP 0), reframed as runtime configuration with bulk API, CSV import and a configuration grid; acceptance tests recompute totals instead of freezing them |
| **Runtime & containers** | Node 20 image, `prisma generate`, prod-deps stage, healthchecks, proxy service, no published API port |
| **Session security** | `nurseapp_refresh` cookie (Lax), CSRF guard ordered after authentication |
| **Privileges** | `REVOKE INSERT` scoped to `employees`; contracts guarded by trigger, HR lifecycle preserved |
| **Audit** | Canonical `audit_entries` schema + hash-chained `fn_append_audit_entry`; restore script rewritten |
| **Migrations** | V32 tagged, **V35 written from scratch**, **V49 added** (worker leases), V37 key versions |
| **Resilience** | Processing lease for idempotency keys; leases replace session-scoped advisory locks; auditor null-safety |
| **PDPL** | Encryption columns, processing register, data-subject rights, backup-scoped erasure, KSA-only allowlist (Bahrain/UAE removed) |
| **Integrations** | Valid FHIR R4 resources; timezone-safe attendance gap query |
| **Operations** | Corrected backup/restore scripts; RPO stated as ≤5 min with derivation; bundle budget gate in CI |

---

## 6. What is **not** integrated (and why)

These are **code and operations tasks on the NurseApp application**, not document items. They cannot be executed from the specification alone because the application source was not uploaded to this workspace.

| Tracker | Item | Needs |
| :--- | :--- | :--- |
| B-02…B-26 | Wave 1A/1B engineering: worker leases in code, idempotency lease, bulk capacity endpoints, privilege separation deployment, PDPL key management, sandbox + decision sprint | The NurseApp v0.2.1 / reviewed-fixed codebase, a PostgreSQL 15 instance, and the U1 hosting decision |

**To start these in this workspace:** upload the reviewed application package (or the repository), and I can implement the Wave 1A items directly — they are all decision-independent and can run on a sandbox with synthetic data.

---

## 7. How to re-verify at any time

```bash
cd /home/user
python3 verify_integration.py                      # expect: INTEGRATED 38/38, NOT YET 0

# Reproduce the document from the untouched source (proves zero drift):
cp uploads/AIGH_Nursing_Workforce_Management_System_v2_8_6.md /tmp/orig.md
python3 patch_v287.py && python3 patch2_v287.py && \
python3 patch3_v287.py && python3 patch4_v287.py
diff -q /tmp/ref_v287b.md AIGH_Nursing_Workforce_Management_System_v2_8_7.md
```

---

## 8. File inventory (exact names)

| File | Purpose |
| :--- | :--- |
| `AIGH_Nursing_Workforce_Management_System_v2_8_7.md` | **The specification — rev 2.8.7c, all 38 findings integrated** |
| `AIGH_v2_8_7_integration_verification.md` | This report |
| `AIGH_v2_8_6_review_analysis.md` | Independent review of v2.8.6 (source of findings F-01…F-32) — now carries a **closure status on every finding** (32/32) |
| `AIGH_v2_8_7_remediation_tracker.md` | What changed, what remains, owners and waves |
| `AIGH_Phase1_Execution_Plan_U1_Unblock.md` | Gate 1 sandbox, decision sprint, default-if-silent rule |
| `patch_v287.py` · `patch2_v287.py` · `patch3_v287.py` · `patch4_v287.py` · `patch5_v287.py` | Re-runnable generators (113 patches) |
| `replay_v287.py` | Rebuilds v2.8.7 from v2.8.6 in a scratch directory and asserts SHA-256 identity with the delivered file |
| `verify_integration.py` | Finding-coverage verifier |
| `uploads/AIGH_Nursing_Workforce_Management_System_v2_8_6.md` | Original source (unmodified) |

*Note on filenames: the workspace files are `AIGH_v2_8_7_remediation_tracker.md` and `AIGH_Phase1_Execution_Plan_U1_Unblock.md` (your list showed "recommendation_tracker" and "Exceution"). Say the word if you'd like them renamed to match your naming.*

---

## 9. Amendment 2.8.7c (19 September 2026) — `patch5_v287.py`

The specification was amended again once the NurseApp codebase had been built and verified
against it. Six findings, eleven patches, all reproducible from the untouched v2.8.6 source.

| Finding | What the document now says |
| :--- | :--- |
| **F-33** | **No format rule applies to the Job Number.** A plain number or a text+number combination is equally valid; `AIGH-XXXX` is neither required nor enforced, and no `CHECK` constraint may reintroduce it. |
| **F-34** | The employee record carries **First / Middle / Last Name** (no free-text name) with **`full_name` derived** by `trg_employees_compose_full_name()` — a trigger, not a generated column, so the ORM may write it explicitly. Plus the nine HR attributes in a fixed order, mapped field → column → rule. Delivered by `V50_employee_hr_fields.sql`. |
| **F-35** | `fn_onboard_employee_with_contract` takes the name parts and the nine HR attributes instead of `p_name`, and the INSERT no longer lists `full_name`/`name`. The audit payload records the same widened set. |
| **F-36** | Contract Start and Contract End are **required** and recorded in **both calendars**: Gregorian is authoritative for arithmetic, the Umm al-Qura equivalent is stored as entered (`islamic-umalqura` only) so it cannot drift. |
| **F-37** | Contract guards — `EMPLOYEE_NOT_FOUND`, end-after-start, `CONTRACT_PERIOD_OVERLAP` — are service-layer rules that **must not live only in a UI component**; the exclusion constraint remains the final authority. |
| **F-38** | The Create Contract form prefills a renewal window that **starts the day after the previous end and runs for the same length**; prefilled dates remain editable. |

**Re-measured document identity after the amendment:**

| Measure | Value |
| :--- | :--- |
| SHA-256 | `60980d72e73b2e63d695e5984ac21ddea95df20fb9136ec16bd61cea0457945e` |
| MD5 | `a14bddb025af462acc5db44857bc8839` |
| Size | 430,342 bytes |
| Lines | 8,869 |
| Patches | 113 (41 + 40 + 9 + 12 + 11) |
| Findings | 38 / 38 integrated, 0 open |
| Replay | `python3 replay_v287.py` → **IDENTICAL** |

> The earlier figures in this report (SHA-256 `64e32a74…`, 423,742 bytes, 8,789 lines, 102
> patches, 32/32) describe rev **2.8.7b** and are superseded by the table above.
