# AIGH Backend — Role Matrix CRUD §8 + Contract-First Onboarding §3.1 (NestJS + Prisma + PostgreSQL 15 + Redis)

## Overview
Implements User Role Matrix CRUD per spec v2.8.7b §8 + Contract-First Onboarding §3.1 with:
- 4 fixed app roles: SYSTEM_ADMIN, HR_ADMIN, SUPERVISOR, EMPLOYEE (implicit default)
- Position directory 16 codes FK enforced §3.1.1 — never auto-confers admin
- Scoped assignments: SYSTEM | DEPARTMENT | UNIT + scopeIds[]
- Four-Eyes V42 for SYSTEM_ADMIN and HR_ADMIN SYSTEM → 202 PENDING_APPROVAL
- PAM JIT 2h dormant by default V42
- Break-Glass Siren 4h V44
- Audit hash-chained append-only §9.1 + PDPL encrypted V37 V38
- Idempotency B-08: Idempotency-Key header, 409 only while live lease
- Redis non-authoritative — auth decisions read fresh PostgreSQL, cache invalidation immediate
- **Job Number unique from Contract** — §3.1: HR enters unique Job Number + contract terms, fn_onboard_employee_with_contract creates Employee Master + Approved Contract + Audit Entry atomically. Job Number stored in employees.job_number with unique index, duplicate triggers full rollback. Contract.jobNumber denormalized for traceability, exclusion constraint GiST daterange && WHERE status IN (Approved,Active) rejects overlapping periods same employee at DB level.

## Prisma Schema
`prisma/schema.prisma`:
- `Position` (16 codes, no auth fields)
- `Department`, `Unit`
- `User` (id uuid, email unique, positionCode FK)
- `UserRoleAssignment` (userId, role, scopeType, scopeIds[], grantedBy, grantedAt, expiresAt, revokedAt, revokedBy, isActive, reason, approvalRequestId)
  - Partial unique index `uq_user_role_active ON (user_id, role, scope_type) WHERE is_active=true AND revoked_at IS NULL`
  - Check `expiresAt > grantedAt`
- `AdminApprovalRequest` (initiatorId, approverId, actionType, payload JSONB, status PENDING/APPROVED/REJECTED/EXECUTED)
  - Partial unique `uq_admin_request_pending ON (initiator_id, action_type) WHERE status=PENDING`
- `PrivilegedSession` (userId PK, elevatedAt, expiresAt, reason, authorizedBy)
- `AuditEntry` (hash chain SHA256(prevHash+payload))
- `IdempotencyKey` (key PK, userId, expiresAt 24h, response JSON)

## API — /api/v1/roles

### Matrix (public auth)
- `GET /roles/matrix` — static §8.1 + §8.2

### Me
- `GET /roles/me` — own active assignments + effectiveRoles (fresh DB, not Redis)

### Assignments CRUD — @RequireRole(HR_ADMIN, SYSTEM_ADMIN)
- `GET /roles/assignments?userId=&role=&scopeType=&isActive=true&unitId=` — scoped list, HR_ADMIN scoped unless system-wide, SYSTEM_ADMIN system-wide
- `GET /roles/assignments/:id` — with history
- `POST /roles/assignments` + `Idempotency-Key` header
  ```json
  {
    "userId": "uuid",
    "role": "HR_ADMIN",
    "scopeType": "UNIT",
    "scopeIds": ["unit-uuid"],
    "reason": "NS needs multi-unit for night shift coverage per policy #123",
    "expiresAt": "2026-04-01T00:00:00Z"
  }
  ```
  - 201 Created {assignment}
  - 202 Accepted {status: PENDING_APPROVAL, requestId} for SYSTEM_ADMIN or HR_ADMIN SYSTEM
  - 400 validation, 403 scope violation or self-grant, 409 idempotency live lease
- `PATCH /roles/assignments/:id` — scopeType/scopeIds/reason/expiresAt, cannot change role, upgrading to SYSTEM → 202 Four-Eyes
- `DELETE /roles/assignments/:id` {reason} — soft revoke isActive=false, revokedAt=now(), revokedBy=actor, cannot revoke own → 403, cannot revoke last SYSTEM_ADMIN → 403, Redis DEL perms:userId + publish role_revoked

### Four-Eyes — §3.5 V42
- `GET /admin/approvals?status=PENDING` — list pending within scope
- `POST /admin/approvals/:requestId/approve` {reason} — SELECT FOR UPDATE locks row, self-approval 403, executeAction(tx) same client rolls back both on failure, status EXECUTED
- `POST /admin/approvals/:requestId/reject` {reason}

### PAM — §3.5 V42
- `POST /admin/pam/elevate` {reason, durationHrs:2} — upsert expiresAt now+durationHrs*3600000
- `GET /admin/pam/status` — isElevated checks expiry auto-revokes
- Worker `PamExpiryWorker` cron every minute revokes expired

## Services

### RoleMatrixService
- `checkIdempotency(key, userId)` — B-08
- `assertScopeCoverage(actorId, scopeType, scopeIds)` — server-evaluated, SYSTEM_ADMIN needs active PAM, HR_ADMIN system-wide bypasses, otherwise subset check, SYSTEM scope only for system admins
- `grant(dto, actor, idempotencyKey)` — validations, position warning for DON/DEPUTY_DON/ADMIN, Four-Eyes 202, transaction with audit same client, Redis invalidation
- `update(id, dto, actor)` — scope change, upgrading to SYSTEM → Four-Eyes
- `revoke(id, dto, actor)` — soft revoke, prevent last SYSTEM_ADMIN, audit high priority, Redis DEL
- `expireDue()` — RoleExpiryWorker daily, auto-revoke expired, audit, Redis DEL

### AdminApprovalService
- `initiate({initiatorId, actionType, payload})` — creates PENDING, partial unique prevents duplicate, audit
- `approve(requestId, approverId, reason, executeAction(tx))` — SELECT FOR UPDATE, PENDING precondition, self-approval 403, same tx execution, status EXECUTED, audit initiator+approver
- `reject(...)`

### PamService
- `isElevated(userId)` — checks expiry, auto-revokes if expired, audit
- `requestElevation(userId, reason, durationHrs, authorizedBy)` — upsert, audit
- `revoke(userId, actorId)`

### AuditService
- `log()` + `logTx(tx)` — hash chain SHA256(prevHash+payload), append-only, old/new JSON

### RedisService
- Non-authoritative, best-effort DEL/publish, sensitive ops verify PostgreSQL regardless of circuit

## Guards

### RolesGuard
- Reads `@RequireRole` metadata
- Fresh DB read of assignments, effectiveRoles = ['EMPLOYEE', ...assignments.role]
- SYSTEM_ADMIN requires active PAM elevation, otherwise 403
- Attaches effectiveRoles + roleAssignments to request for scope checks

## Frontend — React Query

`app/src/lib/api/roles.api.ts`:
- `useRoleAssignments(filter)` — mock localStorage + Zustand employees as users, seeds demo HR_ADMIN system-wide, SUPERVISOR multi-unit, ACTING_HEAD temporary 30d
- `usePendingApprovals()` — localStorage `aigh_pending_approvals`
- `useGrantRole()` — validations mirroring backend, Four-Eyes 202 creates pending, duplicate active check via partial unique, scopeNames resolved from departments/units, audit log to localStorage `aigh_audit_log`, Redis log console
- `useRevokeRole()` — soft revoke, prevent self and last SYSTEM_ADMIN, Redis DEL
- `useUpdateRole()` — scope change, upgrading to SYSTEM → Four-Eyes
- `useApproveRequest()` — approve/reject, self-approval 403, SELECT FOR UPDATE simulated, creates assignment on approve same transaction

UI:
- `GrantRoleDrawer.tsx` — user select (employees), role select, scopeType, scopeIds multi-select filtered by actor scope, reason textarea min 20, expiresAt date picker max 90d SUPERVISOR / 365d HR_ADMIN, Idempotency-Key auto, warnings for executive positions and SYSTEM_ADMIN Four-Eyes
- `RevokeRoleModal.tsx` — reason >=10, warning for SYSTEM_ADMIN high priority, prevents self
- `PendingApprovalsTable.tsx` — PENDING list, Approve/Reject with reason, SELECT FOR UPDATE note
- `RoleMatrixPage.tsx` — Tabs: Assignments CRUD (table with search, filters, Grant button, Revoke action, status Badge), Four-Eyes Approvals (Badge count), Access Matrix §8.1, Position Mapping §8.2, DB Roles §10.7, Guardrails §3.5 §3.6 V42 V44

## Acceptance Criteria (from spec)
- Grant SYSTEM_ADMIN without second signature → 202 PENDING_APPROVAL ✓
- Approve own request → 403 Forbidden ✓
- PAM revoked immediately upon expires_at ✓ (PamExpiryWorker)
- Every elevation+approval in audit_entries initiator+approver IDs ✓
- Revocation invalidates cache immediately next request fresh DB ✓
- Position never auto-confers admin — DON user = EMPLOYEE only ✓ verified
- Scope from browser does NOT establish access — server-evaluated only ✓
- Waiver authority 403 for non-SUPERVISOR/HR_ADMIN ✓ (separate module)

## Running

### Backend (requires Postgres 15 + Redis)
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init-role-matrix
npm run start:dev # 0.0.0.0:3000
```

Env:
```
DATABASE_URL=postgresql://nurseapp_runtime:xxx@localhost:5432/nurseapp?schema=public
MIGRATION_DATABASE_URL=postgresql://nurseapp_migration:xxx@localhost:5432/nurseapp?schema=public
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:5173
```

### Frontend
```bash
cd app
npm install
npm run dev # 0.0.0.0:5173 allowedHosts true Arena preview
npm run build # 3097 modules, RoleMatrixPage 40KB gz 11.9KB, entry 64.6KB gz MET
npm run check-bundle
```

Demo accounts: any password
- admin@aigh.sa SYSTEM_ADMIN
- hr.admin@aigh.sa HR_ADMIN
- supervisor@aigh.sa SUPERVISOR
- employee@aigh.sa EMPLOYEE

## Bundle
- RoleMatrixPage 40.39KB raw 11.90KB gz — under 150KB route budget
- Entry 48.97KB raw 14.98KB gz + vendor-react 49.61KB gz = 64.6KB gz MET (was 266KB Unmet spec)
- Code-splitting React.lazy per route, manualChunks vendor-react/vendor-antd/vendor-utils, NavLink preload on hover/focus
