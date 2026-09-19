# Wave 1A Code Kit — AIGH Nursing Workforce Management System

**Reference implementations for the 12 decision-independent tasks** listed in `AIGH_v2_8_7_remediation_tracker.md` (Wave 1A). None of these require the hosting decision, hospital credentials, or production data — they run against the KSA sandbox with synthetic data.

**Basis:** specification rev 2.8.7c · prepared 18 September 2026
**Runtime:** Node 20 LTS · PostgreSQL 15 (production target)

> **These are reference implementations, not a patch series.** Paths mirror the module layout in §2.3 of the specification so the files can be dropped into the reviewed application package. Where a file replaces an existing one, the header states what changed and why. Review each against your actual code before merging — the reviewed application package was not available in this workspace, so class/property names (`GracePeriodService`, `AuditService.logDomainEvent`, Prisma model casing) assume the conventions used in the specification.

---

## Quick verification (no dependencies required)

```bash
cd wave1a-kit
node scripts/verify-kit.mjs .          # 40+ static checks, plain Node 20
node --check scripts/check-bundle-size.mjs
```

The verifier asserts that every required file is present, that the KSA allow/deny region lists are **disjoint** (the bug found in the 2.8.6 example config), that no migrated worker still uses `pg_try_advisory_lock`, and that the key behaviours are present in each file.

---

## Task → file map

| ID | Task | Files |
| :--- | :--- | :--- |
| **B-02** | Node 20 / PG 15 CI alignment | `ci/ci.yml` |
| **B-03** | Refresh-cookie browser behaviour | `backend/tests/csrf-guard-order.e2e-spec.ts` (cookie + reload cases) |
| **B-04** | Guard ordering (CSRF after auth) | `backend/src/modules/workforce/controllers/units.controller.ts` (header comment + `@UseGuards` order) |
| **B-08** | Idempotency processing lease | `backend/src/common/idempotency/idempotency.guard.ts`, `…interceptor.ts`, `…cleanup.worker.ts` |
| **B-09** | Transaction-aware eligibility refresh | `backend/src/modules/eligibility/eligibility-state.service.ts` |
| **B-10** | Worker leases (V49) + migrate 7 jobs | `prisma/migrations/V49_worker_leases.sql`, `src/common/worker-lease/*`, `modules/notifications/notification.worker.ts` |
| **B-11** | Hardened onboarding function | `prisma/migrations/V36b_harden_onboarding_function.sql` |
| **B-13** | Null-safe consistency auditor | `backend/src/modules/observability/consistency-auditor.worker.ts` |
| **B-19** | Bundle budget gate | `scripts/check-bundle-size.mjs`, `ci/ci.yml` |
| **B-23** | Positions route alignment | *(one-line change — see “Remaining wiring” below)* |
| **B-24** | Bulk capacity API + CSV import + grid | `workforce-bulk-capacity.service.ts`, `dto/*.ts`, `controllers/units.controller.ts`, `frontend/src/modules/workforce/UnitCapacityGrid.tsx` |
| **B-25** | Fail-closed KSA residency check | `backend/src/modules/config/residency.check.ts` |

---

## Install order

1. **Migration V49** — `npx prisma migrate deploy` (after V48). Creates `worker_leases` + `worker_lease_status` view.
2. **Migration V36b** — replace the onboarding function. Requires the baseline `audit_entries` DDL and `fn_append_audit_entry` to exist first (Section 9.1 of the spec).
3. **Register `WorkerLeaseModule`** in `WorkerModule` only — never in `AppModule` (the API process runs no schedulers).
4. **Swap in the migrated files** one worker at a time; each header lists the before/after behaviour.
5. **Wire `assertResidencyFromEnv()`** into `main.ts` and `main-worker.ts`, before the HTTP listener starts.
6. **Add the CI steps** from `ci/ci.yml` and `node scripts/check-bundle-size.mjs dist` after the frontend build.
7. **Mount `UnitCapacityGrid`** at `/workforce/configuration` (suggested) and add the sidebar entry.

---

## Remaining wiring (not in this kit)

| Item | Where | Note |
| :--- | :--- | :--- |
| B-23 route alignment | `positions.controller.ts` | Confirm the route is `api/v1/positions` and update any client calling `/api/v1/workforce/positions` |
| CSRF guard registration | `app.module.ts` | **Remove** the `APP_GUARD` registration (`{ provide: APP_GUARD, useClass: CsrfGuard }`) — the guard is applied at controller level instead |
| Refresh cookie | `auth.controller.ts` | Rename to `nurseapp_refresh`, set `sameSite: 'lax'`; the `__Host-` prefix requires `Path=/` and cannot be used with the auth-scoped path |
| Idempotency contract | protected controllers | Use `idempotentFetch()` on the client and attach `Idempotency-Key` on onboarding, invitation, publication and the new bulk endpoints |
| Service worker files | SCFHS sync, quarantine scan, backup monitor | Same `withLease` pattern as `notification.worker.ts`; use the lease keys already declared in `LEASE_KEYS` |
| Prisma models | `schema.prisma` | Add `WorkerLease` if you want typed access; the kit uses `$queryRaw`/`$executeRaw` deliberately, since the acquire path is a conditional upsert |
| `processingLeaseExpiresAt` | `idempotency_keys` model | Add the column (V33 addendum) before deploying the guard |

---

## Test files (require the repo + a database)

```bash
# Unit — residency check (no database needed)
npx jest backend/tests/residency.check.spec.ts

# Database-backed — lease semantics (needs TEST_DATABASE_URL on PG 15)
npx jest backend/tests/worker-lease.spec.ts --runInBand

# End-to-end — guard order, cookie, CSRF
npx jest backend/tests/csrf-guard-order.e2e-spec.ts --runInBand
```

`worker-lease.spec.ts` covers the cases that matter operationally: contended acquire, **take-over of an expired lease after a simulated crash**, release on throw, and that one worker never deletes another's lease.

---

## What this kit deliberately does not do

- **No PII, no production data.** Everything is written for the synthetic sandbox.
- **No key material.** `PDPL_FIELD_ENCRYPTION_KEY` and the blind-index pepper are referenced by name only; key storage is decided with U1 (task B-18).
- **No changes to Wave 1B items.** Privilege separation, ClamAV, backups, PAM and the evidence vault are gated on hosting and are not in this kit.

---

## Honest status

Static checks pass, but this kit has **not been compiled or run against the application** — the NurseApp package was not provided to this workspace. Expect to adjust import paths, service names and Prisma model casing on first integration. Upload the reviewed package and these can be integrated directly and executed against the test suite.
