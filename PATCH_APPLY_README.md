# Patch Apply Instructions — Role Matrix CRUD

## Files Generated

- `ROLE_MATRIX_CRUD_PATCH.patch` (623KB) — **All 3 commits** from main..HEAD (full web app + role matrix page + CRUD implementation)
  - 0001: feat: build AIGH Nursing Workforce web app v2.8.7b
  - 0002: feat: add Role Matrix page §8 + DB privilege separation + guardrails
  - 0003: feat: implement Role Matrix CRUD — Prisma + NestJS + React Query (23 files, 2716 insertions)

- `0003-ROLE-MATRIX-CRUD-ONLY.patch` (149KB) — **Only the unpushed commit c72ef47** (the CRUD implementation). Use this if you already have fba7dae + ffa4ad3 pushed (which you do).

- `arena-01a0b647-workspace.bundle` (183KB) — Git bundle containing main..HEAD, can be fetched via `git bundle`

- `/tmp/patches/` — Individual patches 0001, 0002, 0003 (in container /tmp, not persisted unless copied)

## Apply Methods

### Method 1: Apply single unpushed patch (recommended, since remote already has first 2 commits)

```bash
# In your local clone of percibalvillegas18/workspace on branch arena/01a0b647-workspace
# Ensure branch is up to date with remote (has fba7dae + ffa4ad3)
git checkout arena/01a0b647-workspace
git pull origin arena/01a0b647-workspace

# Apply the CRUD-only patch
git apply --check 0003-ROLE-MATRIX-CRUD-ONLY.patch  # dry-run
git apply 0003-ROLE-MATRIX-CRUD-ONLY.patch
# Or as commit:
git am 0003-ROLE-MATRIX-CRUD-ONLY.patch

git log --oneline -3
git push origin arena/01a0b647-workspace
```

### Method 2: Apply full bundle (all 3 commits)

```bash
# If starting from main
git checkout main
git checkout -b arena/01a0b647-workspace

# Option A: am from combined patch
git am ROLE_MATRIX_CRUD_PATCH.patch
# If am fails due to binary or large patch, use apply:
git apply ROLE_MATRIX_CRUD_PATCH.patch
git add -A
git commit -m "feat: Role Matrix CRUD — full implementation"

# Option B: bundle
git bundle verify arena-01a0b647-workspace.bundle
git fetch arena-01a0b647-workspace.bundle main:tmp-bundle-branch
git log tmp-bundle-branch --oneline -5
git checkout arena/01a0b647-workspace
git merge tmp-bundle-branch
git push origin arena/01a0b647-workspace
```

### Method 3: Manual file copy (if patch apply fails due to whitespace)

The CRUD implementation adds:

Backend:
- backend/package.json
- backend/prisma/schema.prisma
- backend/src/app.module.ts
- backend/src/main.ts
- backend/src/prisma/prisma.service.ts
- backend/src/common/decorators/require-role.decorator.ts
- backend/src/common/guards/roles.guard.ts
- backend/src/modules/roles/dto/grant-role.dto.ts
- backend/src/modules/roles/roles.service.ts
- backend/src/modules/roles/roles.controller.ts
- backend/src/modules/roles/roles.module.ts
- backend/src/modules/audit/audit.service.ts
- backend/src/modules/redis/redis.service.ts
- backend/src/modules/pam/pam.service.ts
- backend/src/modules/admin-approval/admin-approval.service.ts
- backend/README.md

Frontend:
- app/src/lib/api/roles.api.ts
- app/src/modules/admin/components/GrantRoleDrawer.tsx
- app/src/modules/admin/components/RevokeRoleModal.tsx
- app/src/modules/admin/components/PendingApprovalsTable.tsx
- app/src/modules/admin/RoleMatrixPage.tsx (rewritten with Tabs CRUD)
- app/src/main.tsx (QueryClientProvider)
- ROLE_MATRIX_CRUD_PROPOSAL.md
- PATCH_APPLY_README.md

Copy those files from the patch or from the workspace snapshot.

## Verification after apply

```bash
cd app
npm install
npm run build # should be 3097 modules, RoleMatrixPage 40KB gz 11.9KB, entry 64.6KB gz MET
node scripts/check-bundle-size.mjs # bundle budget OK
npm run dev # 0.0.0.0:5173 allowedHosts true
```

Frontend CRUD works via mock localStorage backend (no real Postgres needed). For real backend:

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init-role-matrix
npm run start:dev # 0.0.0.0:3000
```

## What was implemented

See ROLE_MATRIX_CRUD_PROPOSAL.md and backend/README.md for full spec.

- Prisma schema with partial unique indexes uq_user_role_active, uq_admin_request_pending
- RoleMatrixService with checkIdempotency B-08, assertScopeCoverage server-evaluated, grant 202 PENDING_APPROVAL Four-Eyes, transaction with audit same client, Redis DEL
- AdminApprovalService SELECT FOR UPDATE, self-approval 403, same tx executeAction
- PamService JIT 2h dormant
- RolesGuard fresh DB read, EMPLOYEE implicit, SYSTEM_ADMIN requires PAM
- React Query hooks with mock localStorage, Grant/Revoke/Approve UI, Tabs Assignments CRUD + Four-Eyes + Matrix + Positions + DB Roles + Guardrails
