# Independent Review — AIGH Nursing Workforce Management System, v2.8.6

**Artifact reviewed:** `AIGH_Nursing_Workforce_Management_System_v2_8_6.md` (8,096 lines / 384 KB, updated 18 Sep 2026)
**Review method:** structural parse (278 code fences, 740 table rows, 7 Mermaid diagrams, 14 sections), machine re-computation of every stated count/total, cross-reference and terminology audit, and line-by-line review of the embedded SQL/TypeScript/YAML/bash.
**Line numbers** below refer to the uploaded copy.

---

## 0. Closure status — added 18 September 2026

> **This document is the record of the independent review of v2.8.6.** The finding text below is preserved verbatim as the evidence of what was found; a **status line** was added to every finding after remediation.
>
> **All 32 findings are CLOSED** — 8 P0, 12 P1 and 12 P2 — delivered across four re-runnable revision passes on `AIGH_Nursing_Workforce_Management_System_v2_8_7.md`:
>
> | Pass | Revision | Closes |
> | :--- | :--- | :--- | :--- |
> | 1 | 2.8.7 (41 patches) | P0 F-01…F-08, plus F-21, F-22 |
> | 2 | 2.8.7 (40 patches) | P1 F-09…F-20, P2 F-24…F-32 |
> | 3 | 2.8.7a (9 patches) | F-01 reframed as runtime configuration; F-19 residency allowlist corrected (KSA-only) |
> | 4 | 2.8.7b (12 patches) | F-23 backup/restore scripts |
> | 5 | 2.8.7c (11 patches) | F-33–F-38 employee record shape, Hijri contract dates, contract guards |
>
> **Verification:** `verify_integration.py` reports **38 / 38 integrated, 0 open**; replaying the five patch scripts against the untouched v2.8.6 source reproduces the delivered document byte-for-byte. See `AIGH_v2_8_7_integration_verification.md`.
>
> **Scope note:** closure means the *specification* no longer contains the defect. Findings whose fix requires code, deployment or a hospital decision carry a residual task in `AIGH_v2_8_7_remediation_tracker.md` (items B-02…B-26) — the status lines below name the artifact, not a claim that the running system is production-ready.

---

## 1. What this document actually is

It is three documents stapled together, and the seams show:

| Layer | Examples | Quality |
| :--- | :--- | :--- |
| **Functional/business specification** | §2.9 org structure, §3.1.1 position directory, §5.1 credential catalog, §6.1 eligibility ordering | Strong. Hospital-specific, decision-complete, testable |
| **Technical architecture + code patterns** | §2.2 Dockerfile, §3.4 auth, §9.5 idempotency, V27–V48 migrations | Mixed. Sound intent, several defects that would fail at runtime |
| **Programme management** | §11 acceptance criteria, §13 roadmap, §13.4 decision cascade | Strong on dependency logic, over-optimistic on sequencing |

Section 12 sums it up honestly: **8 capabilities "Implemented", 23 "Implementation specification", 3 "Planned"** — with 18 distinct status strings in use. Per §0.4, the document itself states it is not production-ready. This review agrees, and the reasons are concrete below rather than philosophical.

---

## 2. Verdict

**Maturity: strong design, not yet buildable as specified.**

| Dimension | Assessment |
| :--- | :--- |
| Domain modelling (workforce, credentials, eligibility) | 9/10 — genuinely better than typical vendor specs |
| Architectural coherence | 8/10 — principles are stated *and* mostly followed |
| Internal consistency (numbers, names, schemas) | 4/10 — several load-bearing figures are stale or wrong |
| Code correctness of embedded snippets | 5/10 — real defects in cookie config, guard order, locking, transactions |
| Security design | 7/10 — right instincts, three P0-level implementation faults |
| Migration/ops readiness | 5/10 — good patterns, two migration slots missing, DR script references a non-existent table |
| Governance/roadmap realism | 6/10 — excellent dependency analysis, contradictory phase content |

**Findings: 8 × P0 (breaks or false claim), 12 × P1 (will cause rework or audit findings), 12 × P2 (hygiene/completeness).**

---

## 3. P0 — must fix before any staging work

### F-01 The hospital structure figures are wrong everywhere they appear

**Status: CLOSED (2.8.7 + 2.8.7a)** — Catalog, summary, §11.3 and the hosting brief reconciled to 47 units / 582 beds; 2.8.7a reframes the total as an editable seeded baseline with bulk API, CSV import and a configuration grid, so capacity can be changed in-system and the acceptance test no longer freezes a number. *Verified by `verify_integration.py`.*
The catalog tables list **47 units** (EMAC 7, SURG 5, CRIT 8, GNSP 17, CORP 10) totalling **582 beds** (133 + 38 + 165 + 246 + 0). The document states **49 units / 747 beds** in four places: the §2.9 summary (line 668), the §2.9 acceptance criteria (1123–1124), §11.3 (7382) and the §13.4.1 hosting brief (7910) — all consistent with each other and all inconsistent with the catalog and the seed SQL (47 rows, 582 beds, verified by parsing both).

*Impact:* coverage/staffing-ratio planning, the hosting sizing brief and an acceptance test all inherit a false number. The seed data will fail its own acceptance criterion on day one.
*Fix:* decide the real figure (the catalog is presumably authoritative), regenerate the summary, acceptance criteria and the sizing brief from the same source.

### F-02 The Dockerfile contradicts the production runtime target

**Status: CLOSED (2.8.7)** — Dockerfile rebuilt on `node:20-alpine` with an explicit `npx prisma generate`, a prod-deps stage, `NODE_ENV=production` and a `HEALTHCHECK`. *Verified by `verify_integration.py`.*
Line 73 states the production target is **Node 20 LTS**, and that "Docker, CI and package engine metadata target the production runtime." But the Dockerfile (lines 217, 224) uses `node:24-alpine` for both stages, and the whole §11.4 validation runbook exists to prove Node 20 / PG 15 behaviour.

*Impact:* either the release ships a runtime that was never tested, or the entire §11.4 runbook is aimed at an artifact that is not what gets deployed.
*Fix:* pin the image to the production runtime, or flip the target and delete §11.4.

### F-03 The `__Host-` cookie prefix is used illegally — the refresh cookie will never be stored

**Status: CLOSED (2.8.7)** — Cookie renamed `nurseapp_refresh` with `SameSite=Lax`; the illegal `__Host-` + path combination removed and the reason documented inline. *Verified by `verify_integration.py`.*
`res.cookie('__Host-refresh', …, { path: '/api/v1/auth' })` (lines 1831–1836 and 1857–1861). Browsers **reject** any `__Host-` cookie that does not have exactly `Path=/` (and no `Domain`). The comment even explains the intent: "only sent to auth endpoints."

*Impact:* login succeeds, no refresh cookie is ever set, every user is silently logged out after 15 minutes — and the §11.3 "Browser session hardening" acceptance test fails in a real browser (it may pass in a Node HTTP test client, which is likely how it was "validated").
*Fix:* rename to `refresh` (drop the prefix) with the narrow path, or keep `__Host-` with `Path=/` and rely on same-site + CSRF rather than path scoping.

### F-04 The CSRF guard runs before authentication, so it will reject every mutation

**Status: CLOSED (2.8.7)** — Guard ordering corrected: `@UseGuards(AuthGuard, RbacGuard, CsrfGuard)` at controller level; the `APP_GUARD` registration removed with an explanatory note. *Verified by `verify_integration.py`.*
`CsrfGuard` is registered as a global `APP_GUARD` (line ~1900), while `AuthGuard` is applied per-controller. In NestJS, global guards execute **before** controller/route guards, so `req.user` is `undefined` at the moment of the check and the guard returns `false` for every POST/PUT/DELETE.

*Impact:* all write endpoints 403 in production. This is the single most likely "worked in tests, dead in staging" defect in the document.
*Fix:* apply the CSRF check *after* authentication (per-controller guard ordering, or fold the check into the auth guard chain), or have the CSRF guard read the token from the session record rather than `req.user`.

### F-05 The privilege lockdown breaks the contract lifecycle

**Status: CLOSED (2.8.7)** — `REVOKE INSERT` narrowed to `employees`; contracts stay writable for HR create/renew/terminate under the new `fn_contract_status_guard` trigger. *Verified by `verify_integration.py`.*
§10.7 runs `REVOKE INSERT ON employees FROM nurseapp_runtime` **and** `REVOKE INSERT ON contracts FROM nurseapp_runtime` (lines ~7030). Onboarding via the SECURITY DEFINER function is covered. But §2.4/§4 require HR to create draft contracts, renew them and terminate them (`createDraftContract`, `approveContract` — line 336). Those paths need `INSERT` and `UPDATE` on `contracts`.

*Impact:* the moment privilege separation is deployed, HR can no longer create or renew contracts — the core feature of the system.
*Fix:* route *all* contract creation through gatekeeper functions, or narrow the REVOKE to a column/trigger-based guard (e.g., a `BEFORE INSERT` trigger enforcing "no contract without an employee and an approving actor").

### F-06 The disaster-recovery procedure queries a table that does not exist

**Status: CLOSED (2.8.7)** — Canonical `audit_entries` DDL and hash-chained `fn_append_audit_entry` added to §9.1; restore script rewritten against `audit_entries` with a correct `lag()` chain check. *Verified by `verify_integration.py`.*
The restore script verifies the audit chain against **`audit_events`** with `hash` / `previous_hash` / `created_at` columns (lines 6858–6871). Every other section of the document — including the grants in §10.7 and the crypto-shredding migration — uses **`audit_entries`** (lines 1202, 6042, 7034). Worse: **no section of the document ever defines the schema** of the domain audit table (no `CREATE TABLE` for it anywhere), even though it is the integrity backbone of §9.1 and 22 migration slots are assigned.

*Impact:* post-restore checklist item 3 cannot pass; the RTO/RPO acceptance evidence is unobtainable as written.
*Fix:* add the `audit_entries` DDL (with the hash-chain columns, partitioning and the serialization mechanism §9.1 mentions) as an explicit baseline reference, and correct the restore script.

### F-07 Two declared migration slots have no migration

**Status: CLOSED (2.8.7)** — V32 tagged on the quarantine DDL; `V35_pdpl_controls.sql` written (ciphertext columns, processing register, data-subject requests); V37 gains `*_blind_key_version` columns. *Verified by `verify_integration.py`.*
Of V27–V48 (22 slots), **V32 and V35 have no migration body**. V32's DDL exists but is untagged (line 2865 — the quarantine columns on `credential_evidence`). **V35 "PDPL controls (encryption/rights)" has nothing at all**: §8.3 describes AES-256-GCM field encryption, `data_subject_requests` and a `ProcessingRegisterService`, but no table, column types, key store or index is ever specified. Migration V37 adds the blind-index columns only — and a blind index is useless without the ciphertext column it indexes.

*Impact:* the PDPL control set — a Phase-1 gate item and the reason the hosting decision (U1) is critical-path — is a *description*, not an implementation specification. This directly contradicts §12's claim that the PDPL subsystem has a complete implementation specification.
*Fix:* write V35 (encrypted column types, `user_encryption_keys` completion, `data_subject_requests`, processing register) or downgrade the status label.

### F-08 The validation runbook contains the *old* pass criteria

**Status: CLOSED (2.8.7)** — Runbook now expects 68 unit / 20 PG tests; baseline relabelled Node 24 / PostgreSQL 17.11; `_Fill after run_` cells made mandatory before sign-off. *Verified by `verify_integration.py`.*
§11.4 Step 4 says "Unit tests (**61 expected**)" and "PostgreSQL workflow tests (**16 expected**)" (lines 7512, 7515) — those are the **v0.2.1 baseline** numbers from §11.1. Everywhere else (0.3, 11.4 context, 11.4 acceptance) the reviewed package is **68 / 20**. The comparison table also labels the baseline "Node 24 / **PG 18.4**" (7532) while §11.4's own context says **PostgreSQL 17.11** (7423, 7429).

*Impact:* a validation run can be signed off as PASS against the wrong expectations, or a real regression is read as "expected 61, got 68". This is the artifact used to certify the production runtime.
*Fix:* correct both numbers and the version label; generate the runbook's expectations programmatically from the suite.

---

## 4. P1 — will cause rework, security findings or audit exceptions

### F-09 Idempotency: the stated guarantee and the implementation disagree

**Status: CLOSED (2.8.7)** — Processing lease added (DDL, guard, upsert, cleanup reaping); replay payload limited to resource identifiers; claim corrected to match the implementation. *Verified by `verify_integration.py`.*
§0.2 and §9.5 (line 5633) promise the key, status and response hash are stored *"inside the same transaction as the business operation."* The implementation is a guard that writes `PROCESSING` **before** the handler plus an interceptor that writes `COMPLETED` **after** the response, with failures swallowed by `.catch(() => {})`.

*Consequence:* a crash between business commit and response capture leaves the key stuck in `PROCESSING` → guaranteed 409s for that key (up to 24 h), or a replayed "success" for an operation that partially failed. Also the interceptor stores the *response body* (`responseBody: responseBody`) — which for onboarding contains the new employee record — as JSONB for 24 h, an unlogged PII copy the PDPL section never mentions.
*Fix:* wrap the business call and the key-state write in one transaction/outbox; never leave `PROCESSING` on abnormal exit (add a lease/timeout); store a hash + minimal replay payload, not the full body.

### F-10 The materialized-eligibility "consistency guarantee" is not delivered, and publish-time authority is ambiguous

**Status: CLOSED (2.8.7)** — `refreshState(tx, …)` accepts the caller's transaction; publication re-validates against the canonical engine; state table scoped to pool and dashboard reads; §11.3 criterion corrected. *Verified by `verify_integration.py`.*
§6.1 (line 3872) asserts "all state updates occur within the same transaction as the trigger event." The provided `EligibilityStateService.refreshState()` uses `this.prisma` — its own connection — and is *called by* event handlers, so it is not in the caller's transaction. §10.8's consistency auditor and §10.9's shadow mode exist precisely because drift is expected. Separately, §6.1 says publication validation uses the canonical engine, while §11.3 requires publication to read the state table "to prevent mid-publish eligibility changes."

*Consequence:* the exact case the design is meant to eliminate — publishing a roster against a stale eligibility snapshot — has no single defined answer.
*Fix:* state explicitly which source is authoritative at publish time (recommend: re-validate the candidate set transactionally at publish, using the state table only for the browsing/pool query), and either make `refreshState` accept a `tx` or stop claiming transactional coupling.

### F-11 Advisory locks are session-scoped, released through a connection pool

**Status: CLOSED (2.8.7)** — V49 `worker_leases` table and `WorkerLeaseService.withLease()` replace session-scoped advisory locks across all seven jobs; legacy blocks marked SUPERSEDED. *Verified by `verify_integration.py`.*
§10.3 uses `pg_try_advisory_lock` / `pg_advisory_unlock` via Prisma. These are **session-level** locks: acquire and release can be routed to different pooled connections, and a crashed worker leaves the lock held on a connection that returns to the pool. §0.1 claims the implementation uses a "transaction-scoped advisory lock" — that is not what §10.3 shows.

*Consequence:* a stuck lock silently disables the daily scan or the SMTP worker; on a single worker nobody notices until expiry reminders stop.
*Fix:* `pg_try_advisory_xact_lock` inside an explicit transaction, or a `worker_leases` table with heartbeat + expiry (which the document already has the pieces for).

### F-12 The bulletproof onboarding function has three defects

**Status: CLOSED (2.8.7)** — Active-position check added, audit written through `fn_append_audit_entry`, `SET search_path` applied, blanket `EXCEPTION WHEN OTHERS` removed. *Verified by `verify_integration.py`.*
`fn_onboard_employee_with_contract` (V36, lines ~1176–1210):
1. `EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Onboarding failed…'` — swallows the real cause. Duplicate Job Number, bad FK and permission errors become indistinguishable, which defeats the diagnostic value of the constraint work.
2. No `SET search_path = pg_catalog, public` on a `SECURITY DEFINER` function — the classic privilege-escalation vector, and this function is granted to the runtime role.
3. It inserts a plain row into `audit_entries` with columns `(actor_id, action, resource, resource_id, timestamp)` — bypassing the hash chain that §9.1 requires ("the hash of the audit entry is calculated after encryption… preserving the chain's integrity"). Either the insert violates the real schema, or the chain is broken by the very operation the design most wants audited.

*Fix:* re-raise with `SQLERRM/SQLSTATE`, harden `search_path`, and emit the audit event through the same chained path as every other mutation.

### F-13 Four-eyes implementation is not atomic and can double-execute

**Status: CLOSED (2.8.7)** — `SELECT … FOR UPDATE`, PENDING precondition, execution on the same transaction client, and a partial unique index replacing the ineffective constraint. *Verified by `verify_integration.py`.*
§3.5 `approveAction()`: it never checks `request.status === 'PENDING'` (so a second approver, or a replay, can re-execute), takes no row lock (`SELECT … FOR UPDATE`), and calls `this.executeAction(...)` which uses the ambient client rather than `tx` — so "execute the change" and "mark EXECUTED" are not atomic. `CONSTRAINT uq_admin_request UNIQUE (initiator_id, action_type, created_at)` with `now()` is not a meaningful duplicate guard (microsecond precision).

*Fix:* `SELECT … FOR UPDATE`, status precondition, execute through `tx`, and a partial unique index on `(initiator_id, action_type) WHERE status = 'PENDING'`.

### F-14 Consistency auditor will crash on any employee without a state row

**Status: CLOSED (2.8.7)** — Missing state row now logged as drift and refreshed with `continue` — no dereference, no crash. *Verified by `verify_integration.py`.*
§10.8 dereferences `actual.status` with no null check. New employees, employees added between the state-population migration and the first refresh, and soft-deleted rows all produce `TypeError` — killing the 1 %-sample audit run (the anti-drift control itself becomes the silent failure it was built to detect).

### F-15 The FHIR adapter produces an invalid resource and is unguarded

**Status: CLOSED (2.8.7)** — `Practitioner` and `PractitionerRole` split into valid R4 resources; controller decorated and guarded; validator requirement stated. *Verified by `verify_integration.py`.*
§14.1 emits `practitionerRole` **inside** the `Practitioner` resource. That element does not exist in FHIR R4 — `PractitionerRole` is a separate resource referencing the practitioner. The snippet also shows no `@Controller` decorator and no guards or scope check, and §11.3's acceptance criterion explicitly requires the output to "pass the official HL7 FHIR Validator."

*Fix:* emit `PractitionerRole` with `practitioner.reference` and `qualification`/`specialty`, add authn/z and an `_include` or reference pattern.

### F-16 Attendance gap detection mixes timezones and references a phantom column

**Status: CLOSED (2.8.7)** — Explicit `Asia/Riyadh` timestamptz construction; phantom `start_date` removed; a 15-minute window bounds repeat alerts. *Verified by `verify_integration.py`.*
§14.2 compares `sa.start_time <= now() + interval '30 minutes'` (a local time against a timestamptz), and joins on `ae.event_timestamp >= sa.start_date` — `start_date` is never defined elsewhere in the schema (elsewhere it is `shift_date` + `start_time`). There is no shift-end boundary, so the same missing nurse re-alerts indefinitely.

*Consequence:* false or duplicated "Critical Coverage Alerts" in the alerting path that supervisors will learn to ignore.
*Fix:* build shift start/end as `timestamptz` in Asia/Riyadh, add the end boundary, and only alert once per assignment+window.

### F-17 SameSite=Strict will break the planned SSO

**Status: CLOSED (2.8.7)** — Design decision taken and documented: `SameSite=Lax` plus the Origin/CSRF check, so the IdP redirect can complete. *Verified by `verify_integration.py`.*
§3.4 sets `SameSite=strict` on the refresh cookie; §3.5 plans hospital SSO. Returning from an identity provider is a cross-site top-level navigation — the cookie is not sent, so the callback cannot complete a session. Decide now (`Lax` + CSRF token is the usual answer) rather than discovering it in Phase 4.

### F-18 Waiver limits are acceptance criteria without enforcement

**Status: CLOSED (2.8.7)** — `chk_waiver_max_window` (72 h) and `chk_waiver_future` added to V48; enforcement bullet added to §6.1.2. *Verified by `verify_integration.py`.*
§6.1.2 promises a **maximum 72-hour** waiver and §11.3 tests it, but V48's `credential_waivers` table has no `CHECK (expiry_date <= created_at + interval '72 hours')`, no unit/scope column and no constraint tying `waived_by` to a supervisor role. The only enforcement described is the API.

### F-19 PDPL controls have three soft spots

**Status: CLOSED (2.8.7 + 2.8.7a)** — Pepper rotation via `*_blind_key_version`; residency control scope stated honestly; erasure scope extended to backups. 2.8.7a corrected the example allowlist — `me-south-1` is Bahrain, not KSA — and made the startup check fail closed. *Verified by `verify_integration.py`.*
- **Blind index:** a single global `PDPL_BLIND_INDEX_PEPPER` with no rotation path (rotation requires re-indexing the entire table). Consider per-tenant/per-column keys and a documented rotation ceremony.
- **Residency:** the "technical control" is reading `DATA_RESIDENCY_REGION` from the environment — a self-declaration, not enforcement. It prevents misconfiguration, not a non-KSA deployment. Say so in the language of the control.
- **Erasure vs backups:** crypto-shredding makes audit PII unreadable in the live database, but backups (30 days) and WAL (7 days) still contain the ciphertext-with-readable-history and the key material present at backup time. PDPL erasure claims need an explicit statement covering backup retention and key destruction.

### F-20 Frontend: the proposed fix hides the metric instead of meeting it

**Status: CLOSED (2.8.7)** — `chunkSizeWarningLimit` framed as a raw-kB warning that must not be raised; `@tanstack/react-query` added to vendor chunks; `scripts/check-bundle-size.mjs` CI gate specified; criterion updated. *Verified by `verify_integration.py`.*
§2.8 raises `chunkSizeWarningLimit` to 250 while the entry is 266.47 KB **gzipped** (≈900 KB raw; Vite's limit is raw kB). That removes the warning without removing the problem, and contradicts the section's own acceptance criteria ("zero chunk-size warnings" + "< 200 KB gzipped"). `manualChunks` also omits `@tanstack/react-query`, which §2.1 declares as part of the stack.

---

## 5. P2 — operations, hygiene, completeness

| ID | Finding | Location | Status |
| :--- | :--- | :--- | :--- |
| F-21 | Production compose: `api`, `db`, `redis` have **no `restart:` policy** (only `worker` does); no healthchecks and bare `depends_on` (API starts before PG is ready); `ports: ["3000:3000"]` publishes the API directly, contradicting "only the HTTPS entry point is accessible"; no resource limits, logging driver or secrets wiring | §2.2, lines 178–200 | CLOSED (2.8.7) — compose hardened |
| F-22 | Dockerfile: `npm ci --ignore-scripts` suppresses Prisma's postinstall `prisma generate` and no explicit generate step follows — the build breaks or the client is missing; runtime image copies full `node_modules` (dev deps included); no `NODE_ENV=production`, no `HEALTHCHECK` | §2.2 | CLOSED (2.8.7) — Dockerfile rewritten |
| F-23 | Backup/restore scripts: `pg_basebackup --format=tar --gzip --compress=6` mixes compression flags whose interaction changed in PG 15 (server-side compression), then encrypts `${BACKUP_FILE}.tar.gz` — a path that may not exist depending on `--pgdata` semantics; the script also mixes GPG public-key encryption with `--passphrase-file` decryption | §10.6 | CLOSED (2.8.7b) — backup/restore scripts corrected |
| F-24 | RPO arithmetic: "< 1 minute" is claimed while `archive_timeout = 300` (5 min) — on an idle system the true RPO is up to 5 minutes. §11.3 hedges ("< 15 minutes, target < 1 minute"); pick one and derive it from the timeout | §10.6 | CLOSED (2.8.7) — RPO ≤5 min stated |
| F-25 | Endpoint drift: `GET /api/v1/positions` (controller line 1425, acceptance line 1766) vs `GET /api/v1/workforce/positions` (line 1726) | §3.1.1 | CLOSED (2.8.7) — route aligned |
| F-26 | Terminology collision: `NS` = **Nursing Supervisor** in the position directory (line 1250) but **"Nurse Specialist"** in the credential-policy workshop (line 7925). "Nurse Specialist" is also an SCFHS *classification* (line 2447). A workshop run off §13.4.2 will write rules for the wrong role | §3.1.1 vs §13.4.2 | CLOSED (2.8.7) — NS naming clarified |
| F-27 | §0.3 (declared authoritative over later content) says implementation-spec migrations "V27–V40" were reassigned; §10.1 now defines V27–**V48** | §0.3 | CLOSED (2.8.7) — range corrected |
| F-28 | §14.0 is cited by the V45 migration row but no such section exists (the section starts at 14.1) | §10.1 / §14 | CLOSED (2.8.7) — section ref fixed |
| F-29 | `migration_audit_log` is referenced twice as the audit trail for the temporary `nurseapp_migration_admin` role but is never defined in V47 or anywhere else; V47 also never defines `map_unit()` / `map_pos()` used by the commit function | §10.10 | CLOSED (2.8.7) — objects defined |
| F-30 | §10.7 acceptance says `nurseapp_migration` "cannot read business data beyond `_prisma_migrations`", but the same section grants `ALL` via `ALTER DEFAULT PRIVILEGES` and §3.1.1's legacy migration performs data `UPDATE`s. The criterion is untestable as written | §10.7 | CLOSED (2.8.7) — criterion reworded |
| F-31 | §12 claims "Thirty subsystems have complete implementation specifications" but the same paragraph cites 39 sections, and the migration table has 23 spec rows — the count is decorative | §12 | CLOSED (2.8.7) — count corrected |
| F-32 | Contents omits §11.4, §11.5, §13.1–13.3; seven `_Fill after run_` placeholders in the validation table (fine as a template, misleading inside the spec) | Contents, §11.4 | CLOSED (2.8.7) — contents fixed |

---

## 6. Verification log — claims I machine-checked

| Claim | Where | Method | Result |
| :--- | :--- | :--- | :--- |
| 5 departments, 49 units, 747 beds | §2.9, §11.3, §13.4.1 | parsed catalog + seed SQL | **FAIL** — 47 units, 582 beds |
| 16 credential templates, 5 categories | §5.1.2, §11.3 | parsed table | PASS |
| 16 positions, 14 active | §3.1.1 | parsed table | PASS |
| Baseline occupies V01–V26; V27–V48 assigned | §10.1 | parsed table | PASS (22 slots) — but V32/V35 lack bodies |
| Total reviewed suite = 116 tests | §0.3 | arithmetic (68+20+4+24) | PASS |
| Runbook expectations 61/16 vs 68/20 | §11.4 | cross-section | **FAIL** — stale baseline numbers |
| Baseline "PG 18.4" vs "PG 17.11" | §11.4 | cross-section | **FAIL** — contradiction |
| Redis is non-authoritative; DB denial path | §1.3, §0.2, §9.3 | narrative consistency | PASS |
| Audit rows are hash-chained | §9.1 | compared with V36 insert | **FAIL** — V36 bypasses the chain |
| `audit_entries` schema defined somewhere | whole doc | full-text search | **FAIL** — never defined; restore script uses `audit_events` |
| Eligibility ordering is complete & explicit | §6.1 | read | PASS (6 ordered checks, "no rules ⇒ block") |
| SCFHS + grace periods not implemented | §0.1 vs §12 | cross-section | PASS — correctly downgraded to proposals |

---

## 7. What is genuinely good (don't lose it in the fixes)

- **§0's correction-notice pattern** — a source-verified table that *downgrades* features from "implemented" to "proposal" (SCFHS, grace periods) is rare and valuable. Keep this convention; it is this document's best feature.
- **Hospital fidelity:** unit/bed model, position tiers with `is_schedulable`, credential templates whose `isExpiryDate`/`isIssueDate` field flags *drive* both the notification scan and the eligibility date check. That is a real, coherent model — not slideware.
- **Database-enforced invariants:** the GiST exclusion constraint on overlapping contracts, FKs on `position_directory.code` (replacing an invalid subquery `CHECK`), soft-delete referential guards with enumerated blockers, and pre-migration overlap/unknown-value detection that stops for HR rather than guessing.
- **Eligibility as a single canonical engine** with an explicit check order and the correct failure mode: *no configured rules means block, not allow.*
- **Safe change management for eligibility:** shadow mode + consistency auditor + drift-rate metric is a mature way to change logic that can mark hundreds of nurses ineligible overnight.
- **Honesty:** §0.4 and §11.2 refuse to claim production readiness, and §12 labels status per capability. This review's job was made easier by that.

---

## 8. If you only do five things

1. **Fix F-01 and F-08 first** (one hour of work): the wrong bed/unit totals and the stale test expectations are quoted into acceptance criteria and the hosting brief. Wrong acceptance criteria are worse than no acceptance criteria.
2. **Fix F-03 and F-04 before any browser acceptance test** — as written, the hardened session design cannot work in a real browser, and that is the section §11.3 asks the hospital to sign off on.
3. **Reconcile the privilege model with the contract lifecycle (F-05)** and write the missing `audit_entries` + V35 (PDPL) migrations (F-06, F-07). Privilege separation as specified locks HR out of contract renewal.
4. **Separate Phase 1 into 1A/1B (decision-independent vs hosting-gated).** §13.4 correctly identifies U1 as zero-float critical path — then §13.1 schedules eight hosting-blocked workstreams (PDPL, backups, DB privileges, ClamAV, evidence vault, PII indexing, crypto-shredding, PAM) inside the phase that hosts the gate. Run the ~5 unblocked items now; stop describing blocked work as "Phase 1."
5. **Adopt one source of truth for derived numbers.** Nine of the P0/P1 findings are drift between a summary sentence and the artifact it summarises. Generate the totals, the test expectations and the migration index from the schema/seed/test run, and the class of error disappears.

---

## 9. Bottom line

The design work in this document is well above average for a hospital workforce system: the credential/eligibility model, the audit-integrity posture and the privilege-separation intent are all sound. The gap is not vision — it is **verification discipline**. The document repeatedly asserts guarantees ("same transaction", "already uses a transaction-scoped lock", "complete implementation specification", "docker targets production runtime") that its own embedded code and tables do not support.

Treat v2.8.6 as an excellent specification with eight mechanical defects and a roadmap that needs one structural re-cut. Fix the P0s, correct the five numbers, split Phase 1, and the next revision is genuinely stageable.

**Outcome (18 September 2026):** this recommendation was carried out. All 32 findings are closed in v2.8.7 / 2.8.7a / 2.8.7b; the Phase 1 re-cut became the Gate 1 sandbox and decision sprint in `AIGH_Phase1_Execution_Plan_U1_Unblock.md`; and unit/bed capacity was reframed as in-system configuration rather than a frozen acceptance number. The remaining risk is no longer the specification — it is the three unsigned hospital decisions (hosting, credential policy, SCFHS agreement) and the Wave 1A/1B engineering that needs the application codebase.

*Note: this review assessed the v2.8.6 document, not the NurseApp v0.2.1 codebase (not provided). Where a finding concerns runtime behaviour, it was inferred from the specification's own code and configuration. Status lines and the closure banner were added on 18 September 2026 after remediation; the finding text itself is unchanged.*
