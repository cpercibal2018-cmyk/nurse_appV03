# AIGH Nursing Workforce Management System — v2.8.7 Remediation Tracker

**Companion documents:**
- `AIGH_v2_8_6_review_analysis.md` — the independent review (finding IDs F-01…F-32 used throughout); each finding now carries its **closure status** (32/32 closed)
- `AIGH_Nursing_Workforce_Management_System_v2_8_7.md` — the corrected specification (rev **2.8.7b**)
- `AIGH_Phase1_Execution_Plan_U1_Unblock.md` — Gate 1 sandbox, decision sprint and default-if-silent rule that take U1 off the critical path
- `AIGH_U1_Hosting_Decision_Pack.md` — requirements brief, options, scored matrix and signature-ready decision memo (for the CIO)
- `AIGH_U2_Credential_Policy_Workshop_Pack.md` — 90-minute agenda, rule decision tables, grace-period defaults and policy memo (for the Director of Nursing)
- `AIGH_U3_SCFHS_Integration_Request.md` — Arabic and English request letters, technical annex and follow-up cadence (for the Medical Director)
- `patch_v287.py`, `patch2_v287.py`, `patch3_v287.py`, `patch4_v287.py` — re-runnable generators for all corrections (2.8.7, 2.8.7a, 2.8.7b); replaying them against the untouched v2.8.6 source reproduces this document byte-for-byte (proven by `python3 replay_v287.py`)
- `verify_integration.py` — asserts that all 32 review findings are present in the specification (currently 32/32)
- `wave1a-kit/` — **reference implementations for the Wave 1A tasks** (22 files, ~2,340 lines) with a dependency-free verifier: `cd wave1a-kit && node scripts/verify-kit.mjs .` → 44/44 checks pass
- `AIGH_v2_8_7_integration_verification.md` — the integration verification report

**How to use this tracker:** Part A records what the 2.8.7 document pass already closed. Part B is the live work list — every remaining item has an owner role, an effort estimate, the sequencing wave, and the evidence that closes it. Part C shows the wave order, Part D the hospital decision gates that gate Waves 1B–4, and Part E the verification log for the document pass itself.

**Owners** are recorded as roles; assign named individuals (hospital and vendor sides) at kickoff and track in the weekly status meeting alongside the three urgent decisions (Section 13.4 of the specification).

**Effort key:** S = ≤1 day · M = 2–5 days · L = >1 week

---

## Part A — Closed by the 2.8.7 document pass

All 32 review findings are addressed in the document. Twenty-eight are closed outright; four carry a residual implementation or policy task (flagged in the last column and carried into Part B).

| Finding | What changed in 2.8.7 | Residual |
| :--- | :--- | :--- |
| F-01 unit/bed totals | Catalog, summary, acceptance criteria, §11.3 and the hosting brief now agree on **47 units / 582 beds**, and the 2.8.7a amendment reframes this as an **editable seeded baseline** — capacity is runtime configuration (bulk API + CSV import), so the totals are no longer an acceptance oracle | ✔ Closed by design — see B-01 |
| F-02 runtime vs image | Dockerfile now `node:20-alpine`; explicit `npx prisma generate`; prod-deps stage; `NODE_ENV=production`; `HEALTHCHECK` | ✔ CI verification — B-02 |
| F-03 `__Host-` cookie | Cookie renamed `nurseapp_refresh`, `SameSite=Lax`, with a comment explaining why `__Host-` cannot take a path scope | ✔ Browser test — B-03 |
| F-04 CSRF guard order | Guard now applied at controller level (`AuthGuard, RbacGuard, CsrfGuard`); the `APP_GUARD` registration is removed with an explanatory note | ✔ Code change — B-04 |
| F-05 privilege lockdown | `REVOKE INSERT` narrowed to `employees`; contracts stay writable under `fn_contract_status_guard`; role table, acceptance criteria and status row updated | ✔ Deploy + lifecycle test — B-05 |
| F-06 missing audit schema | Canonical `audit_entries` DDL + `fn_append_audit_entry` (hash-chained, advisory-serialized) added to §9.1; restore script rewritten against `audit_entries` with a correct `lag()` chain check | ✔ Into migration chain + restore drill — B-06 |
| F-07 V32/V35 bodies | V32 tagged on the quarantine DDL; new `V35_pdpl_controls.sql` (ciphertext columns, processing register, data-subject requests); V37 gains `*_blind_key_version` columns | ✔ Key management + deployment — B-07 |
| F-08 stale runbook | "68 expected" / "20 expected"; baseline relabelled Node 24 / PostgreSQL 17.11; `_Fill after run_` cells now explicitly mandatory | ✔ None |
| F-09 idempotency claim | Claim corrected; processing lease added (DDL, guard, upsert, cleanup reaping); replay payload limited to resource identifiers (PDPL); acceptance row updated | ✔ Code change + tests — B-08 |
| F-10 eligibility consistency | "Same transaction" claim now matches the tx-aware `refreshState` signature; publication re-validates against the canonical engine; state table scoped to pool/dashboard reads; §11.3 criterion corrected | ✔ Code change — B-09 |
| F-11 advisory locks | New **V49 `worker_leases`** table + `WorkerLeaseService.withLease()`; lease keys 100001–100007 reused; legacy blocks marked SUPERSEDED; quarantine rule 5 and §12 updated | ✔ Code change, 7 jobs — B-10 |
| F-12 onboarding function | Position-active check, `fn_append_audit_entry` instead of a raw insert, `SET search_path`, blanket `EXCEPTION WHEN OTHERS` removed | ✔ Roll into V36 — B-11 |
| F-13 four-eyes | `SELECT … FOR UPDATE`, PENDING precondition, `executeAction(tx, …)`, partial unique index replacing the ineffective constraint | ✔ Code change — B-12 |
| F-14 auditor null-deref | Missing state row now logged as drift and refreshed (`continue`), never dereferenced | ✔ Code change — B-13 |
| F-15 FHIR | `Practitioner` and `PractitionerRole` split into two valid R4 resources; controller decorated and guarded; validator requirement stated | ✔ Implement + validate — B-14 |
| F-16 attendance SQL | Explicit `Asia/Riyadh` timestamptz construction; phantom `start_date` removed; 15-minute alert window bounds repeats | ✔ Implement — B-15 |
| F-17 SSO vs Strict | Design decision taken (`Lax` + Origin/CSRF token); noted in the cookie table | ✔ Verify at SSO time — B-16 |
| F-18 waiver limits | `chk_waiver_max_window` (72 h) and `chk_waiver_future` added to V48; enforcement bullet added to §6.1.2 | ✔ Apply V48 — B-17 |
| F-19 PDPL soft spots | Pepper rotation via key versions; residency control scope stated honestly; erasure scope extended to backups with an evidence record | ✔ Key strategy + DPO sign-off — B-18 |
| F-20 bundle discipline | `chunkSizeWarningLimit` framed as a raw-kB warning; `@tanstack/react-query` vendor chunk added; `scripts/check-bundle-size.mjs` CI gate specified; criterion updated | ✔ CI wiring + bundle reduction — B-19 |
| F-21 compose hardening | Proxy service added; API `expose` not `ports`; healthchecks + `condition: service_healthy`; restart policies; secrets via env | ✔ nginx/TLS assets — B-20 |
| F-22 Dockerfile hygiene | Covered by the F-02 rewrite | ✔ Build verification — B-02 |
| F-23 backup scripts | **Closed in 2.8.7b:** `--compress=gzip:6`, archive packed before encryption, restore uses a private-key keyring, `wal-restore.sh` prevents zero-length WAL files, envelope-vs-decryptability split stated, retention derived from config | ✔ Validate on real PG 15 — B-21 |
| F-24 RPO arithmetic | Tier rows and acceptance now state **≤5 minutes** with the derivation note and the condition for a tighter target | ✔ Timeout decision — B-22 |
| F-25 endpoint drift | Selector now reads `GET /api/v1/positions` | ✔ Route alignment — B-23 |
| F-26 NS naming clash | Workshop row now "Nursing Supervisor" with an explicit caution about the SCFHS "Nurse Specialist" classification | ✔ Credential-policy workshop — Part D (U2) |
| F-27 §0.3 range | Now "V27–V48" | ✔ None |
| F-28 phantom §14.0 | V45 row now cites 14.1–14.3 | ✔ None |
| F-29 undefined objects | V47 extended with `migration_audit_log`, `unit_map`, `position_map`, `map_unit()`, `map_pos()` | ✔ None |
| F-30 untestable criterion | Reworded to credential custody + pipeline scope, with the DDL-implies-read caveat stated | ✔ None |
| F-31 §12 counts | "Thirty-nine sections" | ✔ None |
| F-32 contents/placeholders | Contents expanded (2.8, 3.4, 6.1.1, 9.2, 9.5, 11.4–11.5, 13.1–13.3) plus a coverage note; fill-in cells made mandatory in Step 5 | ✔ None |

---

## Part B — Open work list

| ID | Item | Owner (role) | Effort | Wave | Depends on | Evidence that closes it |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **B-01** | **Closed by design (2.8.7a):** units and bed capacity are runtime configuration. The seed (47 units / 582 beds) is the documented baseline only; HR enters the required plan in-system. No external reconciliation gate remains | HR Admin + Tech Lead | S | 0 | — | Configuration grid shows "Baseline 582 → Configured N"; `GET /api/v1/units/summary` matches the entered plan |
| **B-02** | Pin Node 20 in `engines`, CI runner and image; confirm the composed image builds with the Prisma client present | DevOps | S | 1A | — | CI green on Node 20 / PG 15; `prisma generate` artifacts present in the runtime image |
| **B-03** | HTTPS browser test of the refresh cookie: survives page reload, refresh rotation + replay rejection, logout clears it | Tech Lead | S | 1A | B-04 | Browser evidence for the §11.3 session-hardening criterion |
| **B-04** | Apply controller-level guard ordering; regression-test every mutating endpoint with valid/invalid CSRF tokens | Backend | S | 1A | — | No endpoint 403s with a valid token; all 403 with a missing/invalid one |
| **B-05** | Implement privilege separation: roles, grants, `fn_contract_status_guard`; then run the **full HR contract lifecycle** (create draft → approve → renew → terminate) as `nurseapp_runtime` | Backend + DBA | M | 1B | U1 hosting | §10.7 acceptance row passes, including the contract-lifecycle test |
| **B-06** | Merge the canonical `audit_entries` DDL into the real migration chain; confirm §9.1's trigger path writes through `fn_append_audit_entry`; re-run the restore checklist item 3 | Backend + DevOps | M | 1B | U1 | Post-restore checklist item 3 passes; no direct inserts remain in code |
| **B-07** | Implement V35 (encryption columns, processing register, data-subject requests) and confirm the V32 tag in-repo; choose key storage (HSM/KMS/vault) | Backend + DBA + Security/IT | M | 1B | U1 | V35 applied; encryption round-trip tested; blind index resolves against ciphertext |
| **B-08** | Rework the idempotency guard/interceptor/cleanup per 2.8.7; add tests for lease lapse, retake, replay payload minimality | Backend | M | 1A | — | Duplicate-prevention + lease-lapse tests in CI; no PII in `response_body` |
| **B-09** | Make `refreshState(tx, …)` use callers' transactions; add publish-time canonical re-validation; test mid-publish credential change | Backend | M | 1A | — | Publish blocks a nurse whose credential was revoked mid-publish |
| **B-10** | Implement V49 + `WorkerLeaseService`; migrate all seven jobs: daily scan, SMTP queue, SCFHS sync, grace expiry, idempotency cleanup, backup monitor, quarantine scan | Backend + DevOps | M | 1A | — | Two-worker test: exactly one runs each job; kill a worker → lease expires → job resumes next cycle |
| **B-11** | Roll the hardened onboarding function into V36 in-repo (search_path, chained audit, no blanket handler) | Backend | S | 1A | — | Negative tests: direct `INSERT INTO employees` denied; duplicate Job Number surfaces its real error code |
| **B-12** | Implement four-eyes per 2.8.7 (row lock, PENDING precondition, tx execution, partial unique index) | Backend | S | 1B | U1 (PAM wave) | §11.3 admin-guardrails criteria pass, incl. concurrent double-approval rejection |
| **B-13** | Add the null-state branch to the consistency auditor and a test that injects a missing state row | Backend | S | 1A | — | Auditor completes with a missing row present and logs drift |
| **B-14** | Implement the FHIR controller; validate both resources with the official HL7 FHIR R4 validator | Backend | M | 4 | HIS/PACS agreement | Validator output attached to §11.3 evidence |
| **B-15** | Implement the timezone-safe coverage-gap query; agree the PACS/badge feed contract | Backend + Infra | M | 4 | Hospital attendance system | Simulated missing clock-in raises exactly one alert per window |
| **B-16** | Verify the SSO flow (Lax cookie + CSRF) when the identity provider is selected; MFA for privileged accounts | Security/IT + Backend | S | 4 | U1 / IdP decision | End-to-end login via IdP in staging |
| **B-17** | Apply V48 and test: 72 h+ waiver rejected at the database, expiry reverts eligibility, waiver audit entry raised | Backend | S | 1B | U2 (credential policy) | §11.3 waiver criteria pass |
| **B-18** | Key management design (HSM/KMS/vault), pepper-rotation runbook, and DPO sign-off on the backup-scoped erasure statement | Security/IT + DPO | M | 1B | U1 | Signed DPO note; rotation rehearsal recorded |
| **B-19** | Wire `check-bundle-size.mjs` into CI; continue bundle reduction to the < 200 KB gz entry target | Frontend | M | 1A | — | CI fails on regression; entry bundle measured below target |
| **B-20** | Author `deploy/nginx.conf`, TLS assets and secret wiring for the proxy service; confirm HTTPS-only exposure | DevOps | M | 1B | U1 | External scan shows only 443/80 reachable; API port closed |
| **B-21** | **Document corrected in 2.8.7b** — remaining work is validation: run the corrected scripts on a real PostgreSQL 15 instance and complete a timed restore drill (plus one `wal-restore.sh` failure-path test) | DevOps | M | 1B | U1 | Backup verifies; PITR restores to a chosen minute; drill recorded |
| **B-22** | Decide `archive_timeout` (60 s for a <1 min RPO vs. accepting ≤5 min) and record it in the acceptance evidence | DevOps + Operations owner | S | 1B | — | Written decision; RPO evidence states the timeout in force |
| **B-23** | Align the positions route in code (`/api/v1/positions`) and update client calls | Tech Lead | S | 1A | — | Route documented once; frontend selector works against the live API |
| **B-24** | Implement the bulk capacity API (`PUT /units/bed-capacity/bulk`), the CSV importer (`POST /units/import`, dry-run default) and the Unit & Bed Capacity Configuration grid | Backend + Frontend | M | 1A | — | A full bed plan is entered in one action; one `bed_capacity_log` row per changed unit; per-row rejects for bad codes/values |
| **B-25** | Apply the KSA region allowlist correction (`me-south-1` is Bahrain — remove); make the residency startup check fail closed and test it | Backend | S | 1A | — | Startup refuses to boot with an out-of-KSA region in the allowlist |
| **B-26** | Stand up the Gate 1 KSA sandbox (synthetic data, ClamAV, MailHog, WAL archiving) and run the 5-day hosting decision sprint with the default-if-silent rule | DevOps + PMO | M | 0 | — | Gate 1 exit criteria met (Phase 1 Execution Plan §3); signed hosting memo by Day 10, or the on-prem default applies |

**Programme note:** the specification's own open items (§13.2, priorities 1–18) continue to run in parallel; the three urgent decisions in Part D gate most of Wave 1B and all of Waves 2–4.

---

## Part C — Sequencing

| Wave | Timing | Contents | Entry condition |
| :--- | :--- | :--- | :--- |
| **Wave 0** | This week | B-01 reconciliation, route alignment (B-23), adopt v2.8.7 as the working revision | — |
| **Wave 1A** — decision-independent | Phase 1 (weeks 1–3) | B-02, B-03, B-04, B-08, B-09, B-10, B-11, B-13, B-19, B-23, B-24, B-25 — **reference implementations delivered in `wave1a-kit/`** (see Part G) | None — all start immediately, addressing the review's Phase-1 split recommendation |
| **Wave 1B** — production-gated | Phase 1 close | B-05, B-06, B-07, B-12, B-17, B-18, B-20, B-21, B-22 | **Work starts immediately on the Gate 1 KSA sandbox**; only the production cutover waits for U1 — or the Day-10 default (Phase 1 Execution Plan) |
| **Wave 2** — staging | Phase 2 (weeks 3–6) | End-to-end pilot: onboarding → claim → upload (quarantine) → approval → grace-period publication → push | Waves 1A/1B green; U2 credential policy |
| **Wave 3** — controlled pilot | Phase 3 (weeks 6–10) | SCFHS nightly sync, backup restore on representative data, load test | U3 SCFHS agreement |
| **Wave 4** — scale | Phase 4 (weeks 10+) | B-14 FHIR, B-15 attendance, B-16 SSO/MFA, object storage, HA | Pilot gate passed; HIS/PACS agreements |

---

## Part D — Decision gates (from §13.4; track weekly)

| Decision | Owner | Target | Unblocks | Escalation |
| :--- | :--- | :--- | :--- | :--- |
| **U1 — Hosting** | Hospital CIO / IT Director | Week 1 | B-05, B-06, B-07, B-12, B-18, B-20, B-21 + the eight subsystems in §13.4.1 | Hospital executive committee |
| **U2 — Credential policy & position rules** | Director of Nursing | Week 3 | B-17, credential requirements for PRACTITIONER/NS/DON/DEPUTY_DON/ADMIN, grace-period windows | Chief Medical Officer |
| **U3 — SCFHS agreement** | Medical Director | Submit week 2; final by week 6 | Wave 3 SCFHS sync | Hospital General Director |

---

## Part E — Verification log for the document pass

| Check | Result |
| :--- | :--- |
| Pass 1 patches (`patch_v287.py`) | 41 / 41 applied |
| Pass 2 patches (`patch2_v287.py`) | 40 / 40 applied (one anchor corrected after a first-run mismatch; script aborts without writing on any mismatch) |
| Stale strings removed — `49 nursing units`, `747`, `__Host-refresh`, `node:24-alpine`, `audit_events`, `61 expected`, `16 expected`, `PG 18.4`, `workforce/positions`, `Thirty subsystems`, `14.0 | Implementation spec`, `uq_admin_request UNIQUE` | 0 occurrences each |
| New content present — `47 nursing units`, `582`, `node:20-alpine`, `nurseapp_refresh`, `V49`/`worker_leases`, `fn_append_audit_entry`, `V35_pdpl_controls`, `V32_upload_quarantine`, `processing_lease_expires_at`, `PractitionerRole`, `chk_waiver_max_window`, `check-bundle-size`, `archive_timeout = 300`, `migration_audit_log`, `*_blind_key_version` | All present |
| Residual `pg_try_advisory_lock` sites | 2 — both explicitly marked **SUPERSEDED** with the V49 migration note (retained as reference) |
| Revision header | v2.8.7 with the correction summary |
| Document size | 8,096 → 8,634 lines; 384,339 → 412,575 bytes |
| Source integrity | v2.8.6 in `uploads/` unmodified; all three patch scripts re-runnable |
| **2.8.7a amendment** (`patch3_v287.py`) — capacity as runtime configuration (bulk API + CSV import + grid), robust acceptance wording, KSA region allowlist correction | 9 / 9 patched |
| **2.8.7b amendment** (`patch4_v287.py`) — backup/restore script corrections (closes F-23) | 11 / 11 patched |
| **Full replay test** — v2.8.6 source → patch1 → patch2 → patch3 → patch4 | **Byte-identical** to the delivered v2.8.7 file (MD5 match); zero drift |
| **Finding coverage** (`verify_integration.py`) | **32 / 32 integrated, 0 open** |
| Total patches across all four passes | **102** (41 + 40 + 9 + 12) |

---

## Part F — Verified-correct in 2.8.6 (do not "fix" during remediation)

Eligibility check ordering and the "no rules ⇒ block" failure mode; the GiST contract-overlap exclusion constraint; position/unit FK design; soft-delete blocker enumeration; credential lifecycle labels (§5.2); object-storage migration plan (§5.3.1); SCFHS verification log schema (§5.4); grace-period rules and 0–90-day bound (§6.1.1); notification windows, dedup keys, SMTP lease/retry semantics (§7.1–7.5); Redis non-authoritative design and DB-denial fallback (§1.3, §9.3); residency fail-boot intent; crypto-shredding's chain-preserving design; counts of 5 departments / 16 templates / 16 positions (14 active) / 22+1 migration slots / 37 acceptance criteria; the §0.4 refusal to claim production readiness.

---

*Prepared 18 September 2026. Finding IDs reference `AIGH_v2_8_6_review_analysis.md`. Assign named owners and review this tracker at the weekly project meeting together with the U1/U2/U3 decision status.*

---

## Part G — Wave 1A code kit (delivered)

Reference implementations for every Wave 1A task, written against the specification's module layout. **22 files, ~2,340 lines**, verified by a dependency-free checker.

```bash
cd wave1a-kit && node scripts/verify-kit.mjs .     # → 44/44 checks pass
```

| Task | Delivered |
| :--- | :--- |
| B-10 | `V49_worker_leases.sql`, `worker-lease.service.ts` (race-free conditional-upsert acquire, heartbeat, take-over of expired leases), module, and a migrated `notification.worker.ts` |
| B-08 | Lease-aware `idempotency.guard.ts` (409 only while the lease is live; lapsed keys retaken), `interceptor.ts` with identifier-only replay payload, `cleanup.worker.ts` with lease reaping |
| B-09 | Transaction-aware `eligibility-state.service.ts` (`refreshState(…, tx)`) |
| B-13 | Null-safe `consistency-auditor.worker.ts` (missing state row = drift, not a crash) |
| B-11 | `V36b_harden_onboarding_function.sql` — pinned `search_path`, chained audit, no blanket exception handler, verification queries included |
| B-24 | Bulk capacity service (per-unit log rows, atomic batches), CSV importer (dry-run default), DTOs, controller, and a React configuration grid showing "Baseline 582 → Configured N" |
| B-25 | Fail-closed `residency.check.ts` — empty allowlist, polluted allowlist, unknown region and sandbox markers all refuse to boot |
| B-19 / B-02 | `check-bundle-size.mjs` (200 KB gz entry / 150 KB gz chunk gate) and a CI job on **Node 20 / PostgreSQL 15** |
| B-04 / B-03 | Controller-level guard ordering, plus e2e cases for cookie naming, reload-refresh, missing CSRF token, foreign Origin and missing idempotency key |
| Tests | `worker-lease.spec.ts` (contended acquire, crashed-worker take-over, release on throw, foreign-lease safety), `residency.check.spec.ts`, `csrf-guard-order.e2e-spec.ts` |

**Caveat, stated plainly:** the kit is statically verified but has **not been compiled or executed against the application** — the NurseApp package was not available in this workspace. Expect to adjust import paths, service names and Prisma model casing on first integration.
