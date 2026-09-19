# AIGH NurseApp — User Role Matrix (Spec v2.8.7b §8)

Source: `AIGH_Nursing_Workforce_Management_System_v2_8_7.md` lines 5240-5450 + position directory §3.1.1 + DB privilege separation §10.7

## 1. Application Authorization Roles (4 roles) — §8.1

| Role | Scope | Description | Default For |
|------|-------|-------------|-------------|
| **SYSTEM_ADMIN** | System-wide | Full system admin, user provisioning, security config, PAM, break-glass root. Dormant by default, JIT elevation 2h with reason, auto-revoked. | Explicit assignment only — DON/DEPUTY_DON/ADMIN never auto-confer |
| **HR_ADMIN** | Scoped (unit/dept or system-wide) | Employee onboarding contract-first V36, departments/units/bed capacity CRUD, position directory CRUD, credential catalog CRUD, contract lifecycle create/approve/renew/terminate, credential review. | Explicit assignment — HR staff, DON may receive system-wide scope |
| **SUPERVISOR / SCHEDULER** | Scoped (assigned units) | Scoped baseline/compliance view, no evidence downloads, scoped draft & publish roster, coverage monitoring, emergency waivers 72h max, attendance gap alerts. | Explicit assignment — NS, ACTING_HEAD, HN may receive multi-unit or unit-scoped supervisor |
| **EMPLOYEE (Staff Self-Service)** | Personal data scope | Claim invited account, own password, own profile phone update, own credential submission/evidence/alerts, published personal/home-unit view, own notifications. | Default at registration — all positions receive this, does NOT grant supervisor authority |

**Policy**: Every operation evaluates role permission, record scope, permitted response fields. Default access denied. Employee title never automatically confers administrative role — HR must explicitly assign elevated roles and scopes. Same permission checks apply to exports, document versions, reports, background actions.

## 2. Full Access Matrix — Area × Role — §8.1

| Area | HR Admin / System Admin | Supervisor / Scheduler | Employee |
|------|------------------------|------------------------|----------|
| **Accounts** | Provision & administer within assigned scope | No account admin by default | Claim invited account; own password |
| **Employee Master** | Maintain source fields within scope | Assigned-unit baseline/compliance view; private fields suppressed | Own profile; phone update |
| **Contracts** | Scoped create, approval, renewal, termination; full history + attachments | Scoped reduced read: identifiers, employee/position, unit, status, dates | Own reduced read view |
| **Credentials** | Scoped upload, review, validity decisions | Scoped compliance view; no evidence downloads | Own submission, evidence, alerts |
| **Scheduling** | Coverage/read by default | Scoped draft & publish | Published personal/home-unit view |
| **Notifications** | Own recipient rows | Own recipient rows | Own recipient rows |
| **Departments / Units / Beds** | Full CRUD + bulk API + CSV import + history logs | Read + bed-history (SUPERVISOR allowed) | No access |
| **Positions Directory** | Full CRUD POST/PUT/DELETE + audit trail + revalidation on schedulability toggle | List & read only | List & read only |
| **Credential Catalog** | Full CRUD categories/templates/requirements + bulk set | Read only | Read only |
| **Eligibility** | View all + refresh + grace management | View scoped + waivers 72h | Own eligibility view |
| **Audit & Compliance** | Read scoped audit + export | No audit by default | Own history only |
| **Backup & PITR** | No backup by default (operations owner) | No backup | No backup |
| **PAM / Four-Eyes / Break-Glass** | Request elevation + initiate approvals | Request elevation (if supervisor elevated) | No admin |
| **FHIR / Portability** | FHIR export + exit package | FHIR read scoped | Own FHIR resource |

**Cache Safety**: Authorization decisions, full-access matrices, accessible menus read current PostgreSQL state so stale cache cannot preserve revoked access. Redis non-authoritative — sensitive ops always verify against PostgreSQL regardless of circuit state, Redis only accelerates read-heavy (menu rendering, roster view). Cache invalidation events (role changes, scope changes, revocation) write PostgreSQL first, Redis invalidation best-effort — next cache population after recovery fetches fresh data. Permission revocation invalidates cache immediately next request uses fresh DB permissions.

## 3. Position → Auth Role Recommended Mapping — §8.2

> Naming Caution: In position directory NS = Nursing Supervisor (§3.1.1). "Nurse Specialist" is an SCFHS professional classification, not a position code. Workshop row explicitly "Nursing Supervisor" with caution about SCFHS Nurse Specialist classification (F-26).

| Code | Full Title | Tier | Schedulable | Default Auth Role | Typical Elevated Role | Notes |
|------|------------|------|-------------|-------------------|-----------------------|-------|
| DON | Director of Nursing | Executive | No | Staff self-service | HR Admin (system-wide) | Requires explicit HR assignment — title never auto-confers admin |
| DEPUTY_DON | Deputy Director of Nursing | Executive | No | Staff self-service | HR Admin (scoped) | Requires explicit HR assignment |
| ADMIN | Administrator | Administrative | No | Staff self-service | HR Admin or Scheduler | Non-clinical; scope per hospital policy |
| NS | Nursing Supervisor | Management | Yes | Staff self-service | Supervisor (multi-unit) | May need broader scope than HN — NS = Nursing Supervisor, not Nurse Specialist |
| ACTING_HEAD | Acting Head Nurse | Management | Yes | Staff self-service | Supervisor (unit-scoped, temporary) | Review grant on assignment end |
| NURSE_EDUCATOR | Clinical Nurse Educator | Specialist | Yes | Staff self-service | Read-only credential view (scoped) | May need cross-unit read for training — explicit scope, not position code |
| PRACTITIONER | Nurse Practitioner | Advanced Practice | Yes | Staff self-service | None additional | Advanced clinical, not administrative |
| HN | Head Nurse | Management | Yes | Staff self-service | Supervisor (unit-scoped) | Unit-specific management |
| CN | Charge Nurse | Clinical Lead | Yes | Staff self-service | None / Supervisor if assigned | Shift-lead |
| SN | Staff Nurse | Clinical | Yes | Staff self-service | None | Frontline registered nurse |
| PCT | Patient Care Technician | Support | Yes | Staff self-service | None | Support staff |
| TEC | Technician | Support | Yes | Staff self-service | None | Legacy retained |
| HCA | Healthcare Assistant | Support | Yes | Staff self-service | None | Legacy retained |
| MW | Midwife | Clinical Specialist | Yes | Staff self-service | None | Legacy retained |

**Rule**: All 14 active positions receive staff self-service at registration. Executive DON/DEPUTY_DON non-schedulable and ADMIN non-schedulable do NOT automatically confer system privileges. NS and ACTING_HEAD do NOT automatically grant Supervisor. HR must explicitly assign elevated roles with appropriate unit scope.

## 4. Database Privilege Separation — Least Privilege — §10.7 — 5 Roles + 1 Temporary

| DB Role | Purpose | Grants | Explicitly Denied | Connection String / Lifecycle |
|---------|---------|--------|-------------------|-------------------------------|
| nurseapp_owner | Database owner, initial provisioning | All privileges on database and schemas | Never used at runtime or by application code | Manual provisioning |
| nurseapp_migration | Schema changes via Prisma Migrate | CREATE/ALTER/DROP tables/indexes/sequences/types, SELECT/INSERT/UPDATE/DELETE _prisma_migrations, USAGE schemas, ALTER DEFAULT PRIVILEGES | No runtime data beyond migration journal — control is credential custody + pipeline scope, not SQL-level read isolation (DDL implies read) | MIGRATION_DATABASE_URL — CI/CD pipeline only |
| nurseapp_runtime | NestJS API + Worker | SELECT/INSERT/UPDATE/DELETE business tables, USAGE/SELECT sequences, EXECUTE functions, fn_onboard_employee_with_contract | No CREATE/ALTER/DROP/TRUNCATE, no DELETE/UPDATE audit_entries (append-only), no direct INSERT employees (REVOKE INSERT — must use fn), contracts writable under trg_contract_status_guard | DATABASE_URL — app runtime only |
| nurseapp_backup | pg_basebackup + WAL archiving | pg_read_all_data (PG14+ built-in) + REPLICATION attribute, SELECT all tables, stream WAL | No INSERT/UPDATE/DELETE, no schema modification | DB_BACKUP_USER — backup scripts only |
| nurseapp_audit_reader | Compliance and audit export | SELECT audit_entries, audit_batches, audit_snapshots, scfhs_verification_log, grace_period_log, push_delivery_log, idempotency_keys | No access to business tables (employees, contracts, credentials), no write | AUDIT_DATABASE_URL — audit tooling only |
| nurseapp_migration_admin (temporary) | Legacy migration bridge cutover | Bypasses REVOKE INSERT on employees/contracts for cutover window | Deleted immediately after commitValidatedData() | Created 48h before go-live, deleted after commit, every action logged in migration_audit_log |

- Post-Migration Hook: After each prisma migrate deploy, privilege grant script runs as nurseapp_owner to re-apply grants on new objects + verify runtime cannot ALTER/DROP tables and cannot DELETE audit entries — returns permission denied, else FAIL
- Connection Strings: DATABASE_URL nurseapp_runtime app runtime only, MIGRATION_DATABASE_URL nurseapp_migration CI/CD only, DB_BACKUP_USER nurseapp_backup backup scripts only, AUDIT_DATABASE_URL nurseapp_audit_reader audit tooling only — app runtime env contains only runtime string, migration+owner credentials absent, password independence each role separate password separate secret rotating one does not affect others
- Onboarding Lockdown V36: REVOKE INSERT employees only — employee creation must go via fn_onboard_employee_with_contract atomic employee+approved contract+audit. Contracts remain writable HR must create draft renew terminate — contract-first guarantee from employees restriction+FK+status trigger not banning contract inserts would break renewal. Guard every contract insert/update valid initial status sane dates via fn_contract_status_guard BEFORE INSERT/UPDATE trigger

## 5. Administrative Guardrails — Four-Eyes & PAM — §3.5, §8.1, V42

**Four-Eyes Principle (Dual-Auth)**: High-impact actions cannot be executed by single admin — promoting user to System Admin, modifying global eligibility rules, changing encryption keys. Workflow: Admin A initiates → PENDING state → Admin B different user reviews approves → system executes change. Table admin_approval_requests id initiator_id approver_id action_type payload JSONB status PENDING/APPROVED/REJECTED/EXECUTED, partial unique index uq_admin_request_pending ON initiator_id+action_type WHERE status=PENDING prevents duplicate pending, SELECT FOR UPDATE locks row so two approvers cannot both proceed, PENDING precondition blocks replay/re-approval, self-approval forbidden 403, executeAction(tx,...) same transaction client so failure rolls back both action+status change, terminal state EXECUTED recorded approver_id approved_at

**Just-In-Time Elevation (PAM)**: Privileged access not permanent — System Admin rights dormant by default, user must request elevation granted limited window e.g. 2h requires documented reason, expires_at reached session automatically revoked by PamExpiryWorker, table privileged_sessions user_id PK elevated_at expires_at reason authorized_by check_expiry expires_at > elevated_at, isElevated() checks expiry revokes if expired, requestElevation() upsert expires_at now+durationHrs*3600000 reason

**Acceptance Criteria**: Attempting to promote user to Admin without second signature returns PENDING_APPROVAL, attempting to approve own high-impact request returns 403 Forbidden, admin access revoked immediately upon privileged_sessions.expires_at, every elevation request+approval recorded in audit_entries initiator+approver IDs

## 6. Break-Glass Root Account — Siren Protocol — §3.6, V44

- Account: Single high-privilege account credentials split into 2 halves stored physically in separate hospital safes
- Bypass: Bypasses PamService JIT elevation and AdminApprovalService Four-Eyes granting immediate root access — prevents system deadlock if PAM DB corrupted or only admin unavailable
- Siren: Any login triggers irrevocable break_glass_events entry (actor_id, access_timestamp, reason, ip_address INET, event_type Siren_Activated, resolved_at non-deletable), emergency SMS/email alert to Hospital CEO + IT Director, session limited to 4h then forcibly revoked
- Implementation: breakGlassEvents.create actor_id reason ip_address, notificationService.sendEmergencyAlert title SYSTEM BREAK-GLASS ACTIVATED message Root access granted to userId reason IP priority CRITICAL non-blocking broadcast
- Acceptance Criteria: Root login triggers Siren alert creates non-deletable audit entry, break-glass session automatically revoked after 4h, /api/v1 remains functional after /api/v2 deployed

## 7. Contract Lifecycle Roles — §4.1

| Role | Access Level |
|------|--------------|
| HR / System Admin | Scoped create, approval, renewal, termination; full contract history and attachments |
| Supervisor | Scoped reduced read view: identifiers, employee/position, unit, status, dates |
| Employee | Own reduced read view |

All contract operations enforce server-evaluated scope for authenticated caller. Passing nurse ID from browser does NOT establish access. Draft and PendingApproval do NOT provide coverage. Approving contract covering today makes it Active immediately. Future-period Approved until start date approval does NOT supersede current. Approved+Active participate in exclusion constraint GiST daterange overlaps WHERE status IN Approved,Active — overlapping periods same employee rejected at DB level. Approved future can satisfy eligibility for shift within that future. Start/end inclusive next nonoverlapping renewal starts after previous end. Expired/Suspended/Terminated/Superseded do NOT provide coverage. No concurrent secondary contracts deliberate replacement requires explicit HR handling silent superseding removed.

## 8. Waiver Authority — §6.1.2, V48

- Authority: Only users with Supervisor or HR_Admin role can issue waiver — application-level check, other roles receive 403
- Enforcement in DB: 72h maximum and future-expiry enforced by chk_waiver_max_window and chk_waiver_future on credential_waivers V48 — API same checks so callers receive clear error before constraint fires, role authority remains application-level
- Acceptance Criteria: Authority check verify only Supervisor and HR_Admin can issue waivers other roles 403, 72h+ waiver rejected at DB, expiry reverts eligibility, waiver audit entry raised high-priority

## 9. Demo Accounts in Web App

| Role | Email | Capabilities |
|------|-------|--------------|
| SYSTEM_ADMIN | admin@aigh.sa | Full access, PAM, break-glass, FHIR, backup, privilege separation, PDPL, all CRUD |
| HR_ADMIN | hr.admin@aigh.sa | Onboarding V36, departments/units/beds CRUD + bulk + CSV import, positions CRUD, credential catalog CRUD, contracts lifecycle, eligibility view, audit scoped |
| SUPERVISOR | supervisor@aigh.sa | Scoped compliance view no evidence downloads, draft & publish roster, coverage monitoring, waivers 72h, attendance gap alerts, bed-history read |
| EMPLOYEE | employee@aigh.sa | Own profile phone update, own credential submission evidence alerts, published personal/home-unit view, own notifications, own eligibility, own FHIR resource |

Live web app: `/roles` route — `app/src/modules/admin/RoleMatrixPage.tsx` — available in dev server https://5173-iyxvac2uykbp31je1lt9y.e2b.app/roles and prod build `dist/assets/RoleMatrixPage-DW44wBoB.js` 23KB gz 7.4KB.

Build: 3048 modules, entry 48.85KB gz 15KB MET vs spec 266KB Unmet, bundle checker passes.
