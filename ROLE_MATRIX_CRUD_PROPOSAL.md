# CRUD Proposal — User Role Matrix (AIGH NurseApp v2.8.7b §8)

> Goal: Allow HR_ADMIN / SYSTEM_ADMIN to explicitly assign, scope, time-box, and revoke application authorization roles, without ever auto-conferring admin from position title. All operations server-evaluated, Four-Eyes for SYSTEM_ADMIN promotion, JIT elevation, audit hash-chained, Redis non-authoritative.

## 1. Scope & Principles (from spec)

- **4 fixed app roles**: `SYSTEM_ADMIN`, `HR_ADMIN`, `SUPERVISOR`, `EMPLOYEE` (staff self-service default). No custom role creation — prevents privilege creep. Position directory (16 codes) is separate reference data, never auto-confers admin.
- **Default deny**: New user = `EMPLOYEE` only. All elevated roles require explicit HR assignment with scope.
- **Scoped access**: `HR_ADMIN` can be system-wide or unit/dept scoped. `SUPERVISOR` always scoped (assigned units). Scope stored as `scope_type + scope_id[]`.
- **Position ≠ Auth**: DON/DEPUTY_DON/ADMIN/NS/ACTING_HEAD/NURSE_EDUCATOR do NOT auto-grant elevated roles. Mapping table in §8.2 is *recommended* only, enforced by UI warning not DB trigger.
- **High-impact = Four-Eyes**: Promoting to SYSTEM_ADMIN, granting system-wide HR_ADMIN, changing global eligibility rules → requires dual approval via `admin_approval_requests`.
- **JIT PAM**: SYSTEM_ADMIN dormant by default, elevation 2h with reason, `privileged_sessions` table, auto-revoked by `PamExpiryWorker`.
- **Audit**: Every grant/revoke/scope change → append-only `audit_entries` with hash chain, initiator + approver IDs, old/new values encrypted PDPL, blind index for search.
- **Cache**: Authorization decisions read PostgreSQL fresh; Redis only accelerates menu/roster rendering; revocation invalidates cache immediately.

**Non-goals**: No role hierarchy inheritance, no custom permissions per endpoint (use decorators `@RequireRole`), no direct DB role (`nurseapp_*`) management via this CRUD — those are infra-level.

## 2. Data Model (Prisma)

```prisma
// Existing users table (simplified)
model User {
  id            String   @id @default(uuid()) @db.Uuid
  email         String   @unique
  name          String
  positionCode  String?  // FK to positions.code, 16 values
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  // relations
  roleAssignments UserRoleAssignment[]
  position      Position? @relation(fields: [positionCode], references: [code])
}

model Position {
  code          String   @id // DON, DEPUTY_DON, ADMIN, NS, etc
  title         String
  tier          String   // Executive, Management, Clinical, etc
  isSchedulable Boolean
  isActive      Boolean  @default(true)
  // no auth fields here — deliberate separation
}

enum AppRole {
  SYSTEM_ADMIN
  HR_ADMIN
  SUPERVISOR
  EMPLOYEE
}

enum ScopeType {
  SYSTEM // system-wide, scopeIds empty
  DEPARTMENT
  UNIT
}

model UserRoleAssignment {
  id            String   @id @default(uuid()) @db.Uuid
  userId        String   @db.Uuid
  role          AppRole
  scopeType     ScopeType
  scopeIds      String[] @db.Uuid // [] for SYSTEM, [deptId] or [unitId, ...] for others
  grantedBy     String   @db.Uuid // HR_ADMIN / SYSTEM_ADMIN who granted
  grantedAt     DateTime @default(now())
  expiresAt     DateTime? // null = permanent until revoked, or for temporary ACTING_HEAD
  revokedAt     DateTime?
  revokedBy     String?  @db.Uuid
  isActive      Boolean  @default(true)
  reason        String   // required justification, e.g. "NS needs multi-unit for night shift coverage"
  approvalRequestId String? @db.Uuid // FK to admin_approval_requests if Four-Eyes used

  // constraints
  @@unique([userId, role, scopeType], name: "uq_user_role_scope") // one active per type, but we soft-delete via isActive + partial index
  @@index([userId, isActive])
  @@index([role, scopeType])
  @@map("user_role_assignments")

  user          User     @relation(fields: [userId], references: [id])
  granter       User     @relation("grantedBy", fields: [grantedBy], references: [id])
  revoker       User?    @relation("revokedBy", fields: [revokedBy], references: [id])
  approvalRequest AdminApprovalRequest? @relation(fields: [approvalRequestId], references: [id])
}

// Four-Eyes table already exists per V42
model AdminApprovalRequest {
  id            String   @id @default(uuid()) @db.Uuid
  initiatorId   String   @db.Uuid
  approverId    String?  @db.Uuid
  actionType    String   // PROMOTE_SYSTEM_ADMIN, GRANT_HR_ADMIN_SYSTEM, etc
  payload       Json     // {userId, role, scopeType, scopeIds, reason}
  status        ApprovalStatus // PENDING, APPROVED, REJECTED, EXECUTED
  createdAt     DateTime @default(now())
  decidedAt     DateTime?
  executedAt    DateTime?
  assignments   UserRoleAssignment[]

  @@unique([initiatorId, actionType], name: "uq_admin_request_pending", map: "uq_admin_request_pending") // partial index WHERE status=PENDING enforced via migration
  @@map("admin_approval_requests")
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
  EXECUTED
}

// PAM table V42
model PrivilegedSession {
  userId        String   @id @db.Uuid
  elevatedAt    DateTime @default(now())
  expiresAt     DateTime
  reason        String
  authorizedBy  String?  @db.Uuid
  @@map("privileged_sessions")
}
```

**Postgres extras (migration SQL):**

```sql
-- Partial unique index: only one active assignment per user+role+scopeType
CREATE UNIQUE INDEX uq_user_role_active ON user_role_assignments (user_id, role, scope_type) WHERE is_active = true AND revoked_at IS NULL;

-- Partial unique for pending approval
CREATE UNIQUE INDEX uq_admin_request_pending ON admin_approval_requests (initiator_id, action_type) WHERE status = 'PENDING';

-- Check: expires_at > granted_at
ALTER TABLE user_role_assignments ADD CONSTRAINT chk_assignment_expiry CHECK (expires_at IS NULL OR expires_at > granted_at);

-- Check: scopeIds empty for SYSTEM, non-empty for DEPARTMENT/UNIT
-- enforced in application + DB function trg_role_scope_guard

-- Prevent self-approval
-- enforced in service: if initiatorId == approverId => 403

-- Audit trigger: append to audit_entries on INSERT/UPDATE of assignments
```

## 3. API Design (NestJS, /api/v1/roles)

All endpoints behind `@UseGuards(JwtAuthGuard, RolesGuard)` + `@RequireRole(HR_ADMIN, SYSTEM_ADMIN)` except own read.

### 3.1 List & Read

```
GET /api/v1/roles/assignments?userId=&role=&scopeType=&isActive=true&unitId=
  - HR_ADMIN: scoped list (only users within their scope unless system-wide)
  - SYSTEM_ADMIN: system-wide list
  - SUPERVISOR: 403 (no role admin)
  - EMPLOYEE: 403, except GET /api/v1/roles/me returns own active roles
  - Returns: id, userId, userName, email, positionCode, role, scopeType, scopeIds, scopeNames (resolved), grantedBy, grantedAt, expiresAt, isActive, reason

GET /api/v1/roles/assignments/:id
  - Same scoping rules
  - Includes history: previous revocations for same user+role

GET /api/v1/roles/matrix
  - Returns full access matrix §8.1 (static) + position→auth recommended mapping §8.2
  - Public to authenticated (for UI help)

GET /api/v1/roles/me
  - Returns own active assignments + effective permissions + menu list (fresh DB read, not Redis)
```

### 3.2 Create (Grant)

```
POST /api/v1/roles/assignments
Body:
{
  userId: "uuid",
  role: "HR_ADMIN" | "SUPERVISOR",
  scopeType: "SYSTEM" | "DEPARTMENT" | "UNIT",
  scopeIds: ["uuid"] , // [] for SYSTEM, must belong to granter's scope
  reason: "Deputy DON needs scoped HR for ICU hiring Q1",
  expiresAt?: "2026-04-01T00:00:00Z" // optional, for ACTING_HEAD temporary
}

Rules:
- Cannot grant SYSTEM_ADMIN directly — creates admin_approval_requests PENDING, returns 202 {status: PENDING_APPROVAL, requestId}
- Cannot grant EMPLOYEE explicitly — it's implicit default, API returns 400
- Cannot grant role outside granter's own scope: HR_ADMIN scoped to ICU cannot grant system-wide HR_ADMIN → 403
- scopeIds validation: must exist in departments/units, must be within granter's scope
- expiresAt if provided must be future and <= 90 days for SUPERVISOR temporary, else 400
- position check: if user position = DON/DEPUTY_DON/ADMIN, UI warns but API allows with explicit reason length >=20 chars (prevents accidental)
- Idempotency: Idempotency-Key header required, stored in idempotency_keys, 409 only while live lease (B-08)
- Audit: writes audit_entries with old=null, new=assignment, actor_id=granter, hash chain

Responses:
201 Created {assignment}
202 Accepted {requestId, status: PENDING_APPROVAL} for SYSTEM_ADMIN or system-wide HR_ADMIN if Four-Eyes required
400 Validation error
403 Scope violation or self-grant attempt (cannot grant to self)
409 Idempotency conflict while live
```

### 3.3 Update (Scope change / Extend / Reason)

```
PATCH /api/v1/roles/assignments/:id
Body: {scopeType?, scopeIds?, reason?, expiresAt?}

Rules:
- Only isActive=true assignments can be updated
- Changing scopeType from UNIT to SYSTEM requires Four-Eyes if role=HR_ADMIN → creates approval request PENDING
- Cannot change role — must revoke + create new (audit clarity)
- expiresAt extension: must be future, max 90 days from now for SUPERVISOR, requires reason
- Same scope validation as create
- Audit: old vs new diff

Response: 200 {assignment} or 202 PENDING_APPROVAL
```

### 3.4 Revoke (Soft delete)

```
DELETE /api/v1/roles/assignments/:id
Body: {reason: "Assignment ended, ACTING_HEAD rotation"}

Rules:
- Soft revoke: set isActive=false, revokedAt=now(), revokedBy=actor
- Cannot revoke own assignment → 403 (prevents lockout, requires another admin)
- Revoking last HR_ADMIN system-wide? Warn but allow if at least 1 SYSTEM_ADMIN remains (check count)
- Immediate cache invalidation: publish Redis event role_revoked {userId}, next request reads fresh DB
- Audit: high priority if SYSTEM_ADMIN revoked

Response: 200 {revoked assignment}
```

### 3.5 Four-Eyes Approval

```
POST /api/v1/admin/approvals/:requestId/approve
POST /api/v1/admin/approvals/:requestId/reject
Body: {reason: "Approved per hospital policy #123"}

Rules:
- Approver must be SYSTEM_ADMIN or HR_ADMIN system-wide, different from initiator → self-approval 403
- SELECT FOR UPDATE locks row, prevents double approval
- On approve: status APPROVED → EXECUTED in same tx as assignment creation (executeAction(tx,...) same client, failure rolls back both)
- On reject: status REJECTED, assignment not created
- Audit: both initiator and approver IDs in audit_entries

GET /api/v1/admin/approvals?status=PENDING
  - Lists pending approvals within scope
```

### 3.6 PAM Elevation (for SYSTEM_ADMIN use)

```
POST /api/v1/admin/pam/elevate
Body: {reason: "Emergency roster fix", durationHrs: 2}
Response: 201 {expiresAt}

GET /api/v1/admin/pam/status
Response: {isElevated, elevatedAt, expiresAt, reason}

DELETE /api/v1/admin/pam/revoke (admin revokes own or another admin revokes)
```

## 4. Service Layer (TypeScript pseudo)

```ts
@Injectable()
export class RoleMatrixService {
  constructor(private prisma: PrismaService, private audit: AuditService, private redis: RedisService) {}

  @RequireRole('HR_ADMIN', 'SYSTEM_ADMIN')
  async grant(dto: GrantRoleDto, actor: User, idempotencyKey: string) {
    // idempotency lease
    await this.checkIdempotency(idempotencyKey);

    // validations
    if (dto.role === 'EMPLOYEE') throw new BadRequestException('EMPLOYEE is implicit');
    if (dto.userId === actor.id) throw new ForbiddenException('Cannot grant to self');
    if (!dto.reason || dto.reason.length < 20) throw new BadRequestException('Reason >=20 chars required');

    // scope check: actor's assignments must cover dto.scope
    await this.assertScopeCoverage(actor.id, dto.scopeType, dto.scopeIds);

    // position warning (not blocking)
    const target = await this.prisma.user.findUnique({where: {id: dto.userId}});
    if (['DON','DEPUTY_DON','ADMIN'].includes(target.positionCode)) {
      // log warning, require longer reason already checked
    }

    // Four-Eyes check
    const needsApproval = dto.role === 'SYSTEM_ADMIN' || (dto.role === 'HR_ADMIN' && dto.scopeType === 'SYSTEM');
    if (needsApproval) {
      const req = await this.prisma.$transaction(async tx => {
        const existing = await tx.adminApprovalRequest.findFirst({
          where: {initiatorId: actor.id, actionType: `GRANT_${dto.role}_${dto.scopeType}`, status: 'PENDING'}
        });
        if (existing) throw new ConflictException('Pending approval already exists');

        return tx.adminApprovalRequest.create({
          data: {
            initiatorId: actor.id,
            actionType: `GRANT_${dto.role}_${dto.scopeType}`,
            payload: dto as any,
            status: 'PENDING'
          }
        });
      });
      await this.audit.log({action: 'ROLE_GRANT_PENDING', actorId: actor.id, targetId: dto.userId, payload: dto, requestId: req.id});
      throw new HttpException({status: 'PENDING_APPROVAL', requestId: req.id}, 202);
    }

    // create assignment
    const assignment = await this.prisma.$transaction(async tx => {
      // unique active check via partial index will throw, but check early
      const dup = await tx.userRoleAssignment.findFirst({
        where: {userId: dto.userId, role: dto.role, scopeType: dto.scopeType, isActive: true, revokedAt: null}
      });
      if (dup) throw new ConflictException('Active assignment already exists for this role+scope');

      const created = await tx.userRoleAssignment.create({
        data: {
          userId: dto.userId,
          role: dto.role,
          scopeType: dto.scopeType,
          scopeIds: dto.scopeIds,
          grantedBy: actor.id,
          reason: dto.reason,
          expiresAt: dto.expiresAt
        }
      });

      await this.audit.logTx(tx, {
        action: 'ROLE_GRANTED',
        actorId: actor.id,
        targetId: dto.userId,
        old: null,
        new: created
      });

      return created;
    });

    // cache invalidation
    await this.redis.publish('role_changed', JSON.stringify({userId: dto.userId, role: dto.role}));

    return assignment;
  }

  async revoke(id: string, dto: RevokeDto, actor: User) {
    if (!dto.reason) throw new BadRequestException('Revoke reason required');

    const existing = await this.prisma.userRoleAssignment.findUnique({where: {id}});
    if (!existing || !existing.isActive) throw new NotFoundException();
    if (existing.userId === actor.id) throw new ForbiddenException('Cannot revoke own role');

    await this.assertScopeCoverage(actor.id, existing.scopeType, existing.scopeIds);

    // prevent removing last SYSTEM_ADMIN
    if (existing.role === 'SYSTEM_ADMIN') {
      const count = await this.prisma.userRoleAssignment.count({where: {role: 'SYSTEM_ADMIN', isActive: true, revokedAt: null}});
      if (count <= 1) throw new ForbiddenException('Cannot revoke last SYSTEM_ADMIN');
    }

    const revoked = await this.prisma.$transaction(async tx => {
      const upd = await tx.userRoleAssignment.update({
        where: {id},
        data: {isActive: false, revokedAt: new Date(), revokedBy: actor.id}
      });
      await this.audit.logTx(tx, {action: 'ROLE_REVOKED', actorId: actor.id, targetId: existing.userId, old: existing, new: upd});
      return upd;
    });

    await this.redis.del(`perms:${existing.userId}`);
    await this.redis.publish('role_revoked', JSON.stringify({userId: existing.userId}));

    return revoked;
  }

  async assertScopeCoverage(actorId: string, scopeType: ScopeType, scopeIds: string[]) {
    // SYSTEM_ADMIN with active PAM elevation bypasses scope check for read, but not for grant?
    // For grant, even SYSTEM_ADMIN must have explicit scope coverage unless system-wide assignment
    const actorRoles = await this.prisma.userRoleAssignment.findMany({
      where: {userId: actorId, isActive: true, revokedAt: null}
    });
    const isSystemAdmin = actorRoles.some(r => r.role === 'SYSTEM_ADMIN' && r.scopeType === 'SYSTEM');
    if (isSystemAdmin) {
      // check PAM elevation
      const pam = await this.prisma.privilegedSession.findUnique({where: {userId: actorId}});
      if (!pam || pam.expiresAt < new Date()) throw new ForbiddenException('SYSTEM_ADMIN requires active PAM elevation');
      return; // system admin can grant any scope
    }

    // HR_ADMIN system-wide can grant any
    const hrSystem = actorRoles.find(r => r.role === 'HR_ADMIN' && r.scopeType === 'SYSTEM' && r.isActive);
    if (hrSystem) return;

    // otherwise, scopeIds must be subset of actor's scopeIds
    // simplified: actor must have HR_ADMIN with scope covering requested scopeIds
    // implementation: fetch actor's unit/dept assignments and check inclusion
    // ...
  }
}
```

## 5. Frontend (React / Zustand) — extends existing `app/src/lib/store.tsx`

```ts
type RoleAssignment = {
  id: string; userId: string; userName: string; email: string; positionCode: string;
  role: 'SYSTEM_ADMIN'|'HR_ADMIN'|'SUPERVISOR'|'EMPLOYEE';
  scopeType: 'SYSTEM'|'DEPARTMENT'|'UNIT';
  scopeIds: string[]; scopeNames: string[];
  grantedBy: string; grantedAt: string; expiresAt?: string;
  isActive: boolean; reason: string;
}

interface RoleMatrixState {
  assignments: RoleAssignment[];
  pendingApprovals: AdminApprovalRequest[];
  fetchAssignments: (filter?: any) => Promise<void>;
  grantRole: (dto: GrantDto) => Promise<{status: 201|202, data: any}>;
  revokeRole: (id: string, reason: string) => Promise<void>;
  approveRequest: (requestId: string, reason: string) => Promise<void>;
}
```

UI in `RoleMatrixPage.tsx` already shows matrix. Add:

- **Grant Drawer**: Select user (searchable), role (HR_ADMIN/SUPERVISOR only for HR_ADMIN, SYSTEM_ADMIN option triggers warning + Four-Eyes), scopeType radio, scopeIds multi-select (units/depts filtered by actor's scope), reason textarea (min 20 chars, counter), expiresAt date picker (optional, max 90 days for SUPERVISOR). Idempotency-Key generated via `crypto.randomUUID()` per submit.
- **Table**: Existing assignments with tags (role color, scope), expires countdown, actions Revoke (with reason modal), Edit scope (PATCH).
- **Pending Approvals Table**: For SYSTEM_ADMIN / HR_ADMIN system-wide, shows PENDING requests, Approve/Reject buttons, payload diff.
- **Guards**: Frontend hides Grant button if currentUser role not HR_ADMIN/SYSTEM_ADMIN; but backend still enforces (never trust client). Position warning banner if target is DON/DEPUTY_DON/ADMIN.
- **Audit Drawer**: Click assignment → shows audit_entries history (hash chain verification).
- **PAM Banner**: If current user is SYSTEM_ADMIN but not elevated, banner "Request elevation to manage roles" with elevate modal (reason + duration 2h).

## 6. Validation & Edge Cases

- **Self-grant / self-revoke**: 403, prevents lockout / privilege escalation.
- **Last SYSTEM_ADMIN**: Cannot revoke if count <=1 → 403.
- **Scope escalation**: HR_ADMIN scoped to ICU cannot grant system-wide → 403, checked via `assertScopeCoverage`.
- **Expired assignments**: Cron `RoleExpiryWorker` daily sets isActive=false where expiresAt < now(), audits, publishes revocation event.
- **Temporary ACTING_HEAD**: Grant SUPERVISOR with expiresAt 30 days, reason required, auto-revoked, review grant on assignment end (spec §8.2).
- **Idempotency**: POST grant requires Idempotency-Key, stored in `idempotency_keys` with TTL 24h, 409 if live lease exists (B-08), retaken after expiry.
- **Concurrent grants**: Partial unique index `uq_user_role_active` prevents duplicate active, SELECT FOR UPDATE in transaction for approval flow.
- **Position never auto-confers**: No trigger from positions to roles. UI only shows recommended mapping as hint, not enforcement.
- **Cache**: On grant/revoke, `redis.del(perms:userId)` + publish event; next request reads fresh DB.

## 7. Acceptance Criteria (from spec)

- Attempting to grant SYSTEM_ADMIN without second signature returns 202 PENDING_APPROVAL, not 201.
- Approving own high-impact request returns 403 Forbidden.
- Admin access revoked immediately upon `privileged_sessions.expires_at` (PamExpiryWorker).
- Every elevation request+approval recorded in audit_entries with initiator+approver IDs.
- Permission revocation invalidates cache immediately, next request uses fresh DB permissions.
- Employee title never auto-confers admin — verified by creating DON user, checking roles = EMPLOYEE only.
- Scope check: passing nurse ID from browser does NOT establish access — server-evaluated scope only.
- Waiver authority still 403 for non-SUPERVISOR/HR_ADMIN (separate but related).

## 8. Migration Plan

1. Add `user_role_assignments`, `admin_approval_requests`, `privileged_sessions` tables (if not exist) via Prisma migrate, run privilege grant script as `nurseapp_owner` to re-apply grants.
2. Backfill: existing users → EMPLOYEE implicit, no rows needed. HR_ADMIN/SUPERVISOR from legacy `user_roles` table → insert into new table with reason "Migration from legacy roles".
3. Deploy API v1 with feature flag `ROLE_MATRIX_CRUD_ENABLED`, shadow mode (log but not enforce) for 1 week, observability via `ObservabilityPage`.
4. Enable enforcement, update frontend `RoleMatrixPage` to use real API (currently mock store).
5. Drill: revoke test user, verify cache invalidation, verify audit hash chain, verify Four-Eyes flow.

## 9. Bundle Impact

- New page already exists `RoleMatrixPage-DW44wBoB.js` 23KB gz 7.43KB — well under route budget 150KB.
- No new vendor deps, uses existing AntD Table/Tag/Descriptions, Zustand, React Query.
- Entry stays 66KB gz MET.

---

**Implementation ready**: Copy Prisma models + service pseudo into `backend/src/modules/roles/`, wire controller, add `RoleExpiryWorker` to worker, extend `store.tsx` with real API calls, replace mock data in `RoleMatrixPage.tsx` with `useQuery` fetching `/api/v1/roles/assignments`.
