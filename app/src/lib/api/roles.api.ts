import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useStore } from '../store';

// Types mirroring backend Prisma
export type AppRole = 'SYSTEM_ADMIN' | 'HR_ADMIN' | 'SUPERVISOR' | 'EMPLOYEE';
export type ScopeType = 'SYSTEM' | 'DEPARTMENT' | 'UNIT';

export interface RoleAssignment {
  id: string;
  userId: string; // employee id as string for compatibility, or number string
  userName: string;
  email: string;
  positionCode?: string;
  role: AppRole;
  scopeType: ScopeType;
  scopeIds: string[];
  scopeNames: string[];
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  isActive: boolean;
  reason: string;
  approvalRequestId?: string | null;
}

export interface GrantRoleDto {
  userId: string;
  role: Exclude<AppRole, 'EMPLOYEE'>;
  scopeType: ScopeType;
  scopeIds: string[];
  reason: string;
  expiresAt?: string;
}

export interface UpdateRoleDto {
  scopeType?: ScopeType;
  scopeIds?: string[];
  reason?: string;
  expiresAt?: string;
}

export interface PendingApproval {
  id: string;
  initiatorId: string;
  initiatorName?: string;
  actionType: string;
  payload: GrantRoleDto;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  createdAt: string;
}

// Mock API — uses Zustand store employees as users, localStorage for persistence
const STORAGE_KEY = 'aigh_role_assignments_v2';

function loadMock(): RoleAssignment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveMock(data: RoleAssignment[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function getCurrentUser() {
  const { currentUser } = useStore.getState();
  return currentUser;
}

export function useRoleAssignments(filter?: { userId?: string; role?: AppRole; isActive?: boolean; unitId?: string }) {
  return useQuery({
    queryKey: ['roleAssignments', filter],
    queryFn: async () => {
      await delay(300);
      const { employees, departments, units } = useStore.getState();
      let data = loadMock();

      if (data.length === 0) {
        // Seed demo assignments using employees
        const allEmps = employees as any[];
        const hrEmp = allEmps.find((e: any) => e.position === 'ADMIN') || allEmps[0];
        const supEmp = allEmps.find((e: any) => e.position === 'NS') || allEmps[1];
        const actingEmp = allEmps.find((e: any) => e.position === 'ACTING_HEAD') || allEmps[2];

        if (hrEmp && supEmp) {
          data = [
            {
              id: 'ra-1',
              userId: String(hrEmp.id),
              userName: hrEmp.name,
              email: hrEmp.contactEmail,
              positionCode: hrEmp.position,
              role: 'HR_ADMIN',
              scopeType: 'SYSTEM',
              scopeIds: [],
              scopeNames: ['System-wide'],
              grantedBy: '1',
              grantedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
              isActive: true,
              reason: 'Initial HR Admin system-wide for hospital hiring',
            },
            {
              id: 'ra-2',
              userId: String(supEmp.id),
              userName: supEmp.name,
              email: supEmp.contactEmail,
              positionCode: supEmp.position,
              role: 'SUPERVISOR',
              scopeType: 'UNIT',
              scopeIds: units.slice(0, 3).map((u: any) => String(u.id)),
              scopeNames: units.slice(0, 3).map((u: any) => u.name),
              grantedBy: String(hrEmp.id),
              grantedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
              expiresAt: null,
              isActive: true,
              reason: 'NS needs multi-unit scope for night shift coverage — ICU, ER, Ward A',
            },
          ];

          if (actingEmp) {
            data.push({
              id: 'ra-3',
              userId: String(actingEmp.id),
              userName: actingEmp.name,
              email: actingEmp.contactEmail,
              positionCode: actingEmp.position,
              role: 'SUPERVISOR',
              scopeType: 'UNIT',
              scopeIds: [String(units[0]?.id || 1)],
              scopeNames: [units[0]?.name || 'ICU'],
              grantedBy: String(hrEmp.id),
              grantedAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
              isActive: true,
              reason: 'Temporary ACTING_HEAD assignment — 30 days rotation, review on end',
            });
          }
          saveMock(data);
        }
      }

      if (filter?.userId) data = data.filter(d => d.userId === filter.userId);
      if (filter?.role) data = data.filter(d => d.role === filter.role);
      if (filter?.isActive !== undefined) data = data.filter(d => d.isActive === filter.isActive);
      if (filter?.unitId) data = data.filter(d => d.scopeIds.includes(filter.unitId!));

      return data;
    },
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['pendingApprovals'],
    queryFn: async (): Promise<PendingApproval[]> => {
      await delay(200);
      try {
        const raw = localStorage.getItem('aigh_pending_approvals');
        if (raw) return JSON.parse(raw);
      } catch {}
      return [];
    },
  });
}

export function useGrantRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: GrantRoleDto) => {
      await delay(500);
      const currentUser = getCurrentUser();
      if (!currentUser) throw new Error('Not authenticated');

      if (dto.role === 'EMPLOYEE' as any) throw new Error('EMPLOYEE is implicit default, not grantable');
      if (String(dto.userId) === String(currentUser.id)) throw new Error('Cannot grant to self — prevents privilege escalation');
      if (!dto.reason || dto.reason.length < 20) throw new Error('Reason must be >=20 chars — explicit justification required §8');
      if (dto.scopeType === 'SYSTEM' && dto.scopeIds.length > 0) throw new Error('SYSTEM scope must have empty scopeIds');
      if (dto.scopeType !== 'SYSTEM' && dto.scopeIds.length === 0) throw new Error('DEPARTMENT/UNIT scope requires scopeIds');

      if (dto.expiresAt) {
        const exp = new Date(dto.expiresAt);
        if (exp <= new Date()) throw new Error('expiresAt must be future');
        const maxDays = dto.role === 'SUPERVISOR' ? 90 : 365;
        if (exp.getTime() - Date.now() > maxDays * 24 * 3600 * 1000) throw new Error(`expiresAt max ${maxDays} days`);
      }

      const needsApproval = dto.role === 'SYSTEM_ADMIN' || (dto.role === 'HR_ADMIN' && dto.scopeType === 'SYSTEM');
      if (needsApproval) {
        const approvals: PendingApproval[] = JSON.parse(localStorage.getItem('aigh_pending_approvals') || '[]');
        const existing = approvals.find(a => a.status === 'PENDING' && a.payload.userId === dto.userId && a.payload.role === dto.role);
        if (existing) throw new Error('Pending approval already exists for this action');

        const newApproval: PendingApproval = {
          id: `apr-${Date.now()}`,
          initiatorId: String(currentUser.id),
          initiatorName: currentUser.name,
          actionType: `GRANT_${dto.role}_${dto.scopeType}`,
          payload: dto,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        };
        approvals.push(newApproval);
        localStorage.setItem('aigh_pending_approvals', JSON.stringify(approvals));

        const err: any = new Error('High-impact role grant requires second approval — 202 PENDING_APPROVAL');
        err.status = 202;
        err.requestId = newApproval.id;
        throw err;
      }

      const existingAssignments = loadMock();
      const dup = existingAssignments.find(a => a.userId === String(dto.userId) && a.role === dto.role && a.scopeType === dto.scopeType && a.isActive);
      if (dup) throw new Error('Active assignment already exists for this role+scope (partial unique index)');

      const { employees, departments, units } = useStore.getState();
      const targetEmp = (employees as any[]).find((e: any) => String(e.id) === String(dto.userId));
      if (!targetEmp) throw new Error('Target user not found');

      const scopeNames = dto.scopeIds.map(id => {
        const u = (units as any[]).find((un: any) => String(un.id) === String(id));
        if (u) return u.name;
        const d = (departments as any[]).find((de: any) => String(de.id) === String(id));
        if (d) return d.name;
        return id;
      });

      const newAssignment: RoleAssignment = {
        id: `ra-${Date.now()}`,
        userId: String(dto.userId),
        userName: targetEmp.name,
        email: targetEmp.contactEmail,
        positionCode: targetEmp.position,
        role: dto.role,
        scopeType: dto.scopeType,
        scopeIds: dto.scopeIds.map(String),
        scopeNames: dto.scopeType === 'SYSTEM' ? ['System-wide'] : scopeNames,
        grantedBy: String(currentUser.id),
        grantedAt: new Date().toISOString(),
        expiresAt: dto.expiresAt || null,
        isActive: true,
        reason: dto.reason,
      };

      const updated = [...existingAssignments, newAssignment];
      saveMock(updated);

      const auditLog = JSON.parse(localStorage.getItem('aigh_audit_log') || '[]');
      auditLog.push({
        id: `audit-${Date.now()}`,
        action: 'ROLE_GRANTED',
        actorId: String(currentUser.id),
        actorName: currentUser.name,
        targetId: String(dto.userId),
        targetName: targetEmp.name,
        newValue: newAssignment,
        createdAt: new Date().toISOString(),
        hash: `sha256-${Date.now()}`,
      });
      localStorage.setItem('aigh_audit_log', JSON.stringify(auditLog));

      console.log(`[Redis] DEL perms:${dto.userId} + PUBLISH role_changed ${dto.userId}`);

      return newAssignment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roleAssignments'] });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
    },
  });
}

export function useRevokeRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await delay(400);
      const currentUser = getCurrentUser();
      if (!currentUser) throw new Error('Not authenticated');
      if (!reason || reason.length < 10) throw new Error('Revoke reason required >=10 chars');

      const assignments = loadMock();
      const existing = assignments.find(a => a.id === id);
      if (!existing || !existing.isActive) throw new Error('Assignment not found or already revoked');
      if (String(existing.userId) === String(currentUser.id)) throw new Error('Cannot revoke own role — requires another admin');

      if (existing.role === 'SYSTEM_ADMIN') {
        const count = assignments.filter(a => a.role === 'SYSTEM_ADMIN' && a.isActive).length;
        if (count <= 1) throw new Error('Cannot revoke last SYSTEM_ADMIN — at least one must remain');
      }

      const updated = assignments.map(a => (a.id === id ? { ...a, isActive: false, revokedAt: new Date().toISOString(), revokedBy: String(currentUser.id) } : a));
      saveMock(updated);

      const auditLog = JSON.parse(localStorage.getItem('aigh_audit_log') || '[]');
      auditLog.push({
        id: `audit-${Date.now()}`,
        action: 'ROLE_REVOKED',
        actorId: String(currentUser.id),
        actorName: currentUser.name,
        targetId: existing.userId,
        oldValue: existing,
        newValue: { ...existing, isActive: false, revokeReason: reason },
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem('aigh_audit_log', JSON.stringify(auditLog));

      console.log(`[Redis] DEL perms:${existing.userId} + PUBLISH role_revoked ${existing.userId}`);

      return existing;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roleAssignments'] });
    },
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateRoleDto }) => {
      await delay(400);
      const assignments = loadMock();
      const existing = assignments.find(a => a.id === id);
      if (!existing || !existing.isActive) throw new Error('Assignment not found');

      const newScopeType = dto.scopeType ?? existing.scopeType;
      const newScopeIds = dto.scopeIds ?? existing.scopeIds;

      const upgradingToSystem = newScopeType === 'SYSTEM' && existing.scopeType !== 'SYSTEM' && existing.role === 'HR_ADMIN';
      if (upgradingToSystem) {
        const approvals: PendingApproval[] = JSON.parse(localStorage.getItem('aigh_pending_approvals') || '[]');
        const newApproval: PendingApproval = {
          id: `apr-${Date.now()}`,
          initiatorId: String(getCurrentUser()?.id || 'unknown'),
          actionType: `UPDATE_${existing.role}_TO_SYSTEM`,
          payload: { userId: existing.userId, role: existing.role, scopeType: newScopeType, scopeIds: newScopeIds, reason: dto.reason || existing.reason } as any,
          status: 'PENDING',
          createdAt: new Date().toISOString(),
        };
        approvals.push(newApproval);
        localStorage.setItem('aigh_pending_approvals', JSON.stringify(approvals));
        const err: any = new Error('Upgrading to SYSTEM scope requires second approval');
        err.status = 202;
        err.requestId = newApproval.id;
        throw err;
      }

      const { units, departments } = useStore.getState();
      const scopeNames = newScopeIds.map(id => {
        const u = (units as any[]).find((un: any) => String(un.id) === String(id));
        if (u) return u.name;
        const d = (departments as any[]).find((de: any) => String(de.id) === String(id));
        if (d) return d.name;
        return id;
      });

      const updatedAssignment = {
        ...existing,
        scopeType: newScopeType,
        scopeIds: newScopeIds.map(String),
        scopeNames: newScopeType === 'SYSTEM' ? ['System-wide'] : scopeNames,
        reason: dto.reason ?? existing.reason,
        expiresAt: dto.expiresAt ? dto.expiresAt : existing.expiresAt,
      };

      const updatedList = assignments.map(a => (a.id === id ? updatedAssignment : a));
      saveMock(updatedList);

      return updatedAssignment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roleAssignments'] });
    },
  });
}

export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, action, reason }: { requestId: string; action: 'approve' | 'reject'; reason: string }) => {
      await delay(500);
      const currentUser = getCurrentUser();
      if (!currentUser) throw new Error('Not authenticated');

      const approvals: PendingApproval[] = JSON.parse(localStorage.getItem('aigh_pending_approvals') || '[]');
      const req = approvals.find(a => a.id === requestId);
      if (!req) throw new Error('Approval request not found');
      if (req.status !== 'PENDING') throw new Error(`Request already ${req.status}`);
      if (String(req.initiatorId) === String(currentUser.id)) throw new Error('Self-approval forbidden 403');

      if (action === 'reject') {
        const updated = approvals.map(a => (a.id === requestId ? { ...a, status: 'REJECTED' as const } : a));
        localStorage.setItem('aigh_pending_approvals', JSON.stringify(updated));
        return { status: 'REJECTED' };
      }

      const { employees, units, departments } = useStore.getState();
      const targetEmp = (employees as any[]).find((e: any) => String(e.id) === String(req.payload.userId));
      if (!targetEmp) throw new Error('Target user not found');

      const scopeNames = req.payload.scopeIds.map(id => {
        const u = (units as any[]).find((un: any) => String(un.id) === String(id));
        if (u) return u.name;
        const d = (departments as any[]).find((de: any) => String(de.id) === String(id));
        if (d) return d.name;
        return id;
      });

      const newAssignment: RoleAssignment = {
        id: `ra-${Date.now()}`,
        userId: String(req.payload.userId),
        userName: targetEmp.name,
        email: targetEmp.contactEmail,
        positionCode: targetEmp.position,
        role: req.payload.role,
        scopeType: req.payload.scopeType,
        scopeIds: req.payload.scopeIds.map(String),
        scopeNames: req.payload.scopeType === 'SYSTEM' ? ['System-wide'] : scopeNames,
        grantedBy: req.initiatorId,
        grantedAt: new Date().toISOString(),
        expiresAt: req.payload.expiresAt || null,
        isActive: true,
        reason: req.payload.reason,
        approvalRequestId: requestId,
      };

      const assignments = loadMock();
      const updatedAssignments = [...assignments, newAssignment];
      saveMock(updatedAssignments);

      const updatedApprovals = approvals.map(a => (a.id === requestId ? { ...a, status: 'EXECUTED' as const } : a));
      localStorage.setItem('aigh_pending_approvals', JSON.stringify(updatedApprovals));

      const auditLog = JSON.parse(localStorage.getItem('aigh_audit_log') || '[]');
      auditLog.push({
        id: `audit-${Date.now()}`,
        action: 'APPROVAL_EXECUTED',
        actorId: String(currentUser.id),
        actorName: currentUser.name,
        targetId: req.initiatorId,
        newValue: { approverId: String(currentUser.id), result: newAssignment, reason },
        createdAt: new Date().toISOString(),
      });
      localStorage.setItem('aigh_audit_log', JSON.stringify(auditLog));

      return { status: 'EXECUTED', assignment: newAssignment };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roleAssignments'] });
      qc.invalidateQueries({ queryKey: ['pendingApprovals'] });
    },
  });
}
