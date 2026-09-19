import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEPARTMENTS, NURSING_UNITS, POSITIONS, CREDENTIAL_TEMPLATES, CREDENTIAL_CATEGORIES, EMPLOYEES_SEED, CONTRACTS_SEED, CREDENTIAL_REQUIREMENTS_SEED, BED_CAPACITY_LOG_SEED } from '../data/seed';
import { toHijriIso } from './hijri';

export type Employee = {
  id: number;
  name: string; // Full Name = First Name + Middle Name + Last Name (auto)
  firstName: string;
  middleName?: string;
  lastName: string;
  jobNumber: string; // Job Number from contract — unique, plain numbers or text+number combination, no AIGH- format
  jobTitle?: string; // Job Title
  fileNo?: string; // File No.
  rankGrade?: string; // Rank/Grade
  nationality?: string; // Nationality
  jobPostLocation?: string; // Job Post (Location Assignment) - City +
  actualWorkPlace?: string; // Actual Work Place
  specialty?: string; // Specialty
  maritalStatus?: 'Single' | 'Married' | 'Others'; // Marital Status
  salary?: number; // Salary Amount in SAR
  unitId: number;
  position: string;
  contactEmail: string;
  status: string;
  hireDate: string;
  deletedAt?: string | null;
};

export type Contract = {
  id: number;
  employeeId: number;
  startDate: string;   // Gregorian (ISO YYYY-MM-DD) — the authoritative instant
  endDate: string;     // Gregorian (ISO YYYY-MM-DD)
  startDateHijri?: string; // Umm al-Qura equivalent of startDate (YYYY-MM-DD Hijri), recorded at entry
  endDateHijri?: string;   // Umm al-Qura equivalent of endDate (YYYY-MM-DD Hijri), recorded at entry
  status: 'Draft' | 'PendingApproval' | 'Approved' | 'Active' | 'Expired' | 'Suspended' | 'Terminated' | 'Superseded';
};

export type Credential = {
  id: number;
  employeeId: number;
  templateId: number;
  validityStatus: 'PendingVerification' | 'Valid' | 'ExpiringSoon' | 'Expired' | 'Suspended' | 'Revoked';
  issueDate: string;
  expiryDate: string;
  trackingData: Record<string, any>;
  verifiedBy?: number;
  verifiedAt?: string;
  syncStatus?: 'SYNCED' | 'STALE' | 'FAILED' | 'PENDING' | 'UNKNOWN';
  lastSyncAttempt?: string;
};

export type AuditEntry = {
  id: number;
  actorId: number | null;
  action: string;
  resource: string;
  resourceId: string;
  changes: any;
  hash: string;
  previousHash: string | null;
  createdAt: string;
  isEncrypted?: boolean;
};

export type Notification = {
  id: number;
  type: string;
  title: string;
  message: string;
  recipientId?: number;
  isRead: boolean;
  createdAt: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
};

export type ShiftAssignment = {
  id: number;
  employeeId: number;
  unitId: number;
  shiftDate: string;
  shiftName: 'Morning' | 'Evening' | 'Night';
  startTime: string;
  endTime: string;
  status: 'Draft' | 'Published';
};

export type EligibilityState = {
  employeeId: number;
  status: 'ELIGIBLE' | 'ELIGIBLE_WITH_GRACE' | 'INELIGIBLE';
  reasons: string[];
  lastCalculatedAt: string;
};

export type GracePeriod = {
  id: number;
  employeeId: number;
  templateId: number;
  activatedAt: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CLOSED';
  reason: string;
};

export type Waiver = {
  id: number;
  employeeId: number;
  templateId: number;
  waivedBy: number;
  expiryDate: string;
  reason: string;
  createdAt: string;
};

type Store = {
  // auth
  isAuthenticated: boolean;
  currentUser: { id: number; name: string; role: string; email: string } | null;
  csrfToken: string;
  login: (email: string, password: string) => boolean;
  logout: () => void;

  // departments
  departments: typeof DEPARTMENTS;
  addDepartment: (dept: any) => void;
  updateDepartment: (id: number, data: any) => void;
  deleteDepartment: (id: number) => void;

  // units
  units: typeof NURSING_UNITS;
  addUnit: (unit: any) => void;
  updateUnit: (id: number, data: any) => void;
  deleteUnit: (id: number) => void;
  updateBedCapacity: (id: number, bedCount: number, reason: string, actorId: number) => void;
  bulkUpdateBedCapacity: (rows: { unitCode: string; bedCount: number }[], reason: string, actorId: number) => any[];
  importUnits: (csv: string, dryRun: boolean, actorId: number) => { results: any[]; dryRun: boolean };

  // bed capacity log
  bedCapacityLog: any[];
  getBedHistory: (unitId: number) => any[];

  // positions
  positions: typeof POSITIONS;
  addPosition: (pos: any) => void;
  updatePosition: (code: string, data: any) => void;
  deletePosition: (code: string) => void;

  // employees
  employees: Employee[];
  addEmployee: (emp: Omit<Employee, 'id'> & { contractStart: string; contractEnd: string }) => number;
  updateEmployee: (id: number, data: Partial<Employee>) => void;
  deleteEmployee: (id: number) => void;

  // contracts
  contracts: Contract[];
  addContract: (contract: Omit<Contract, 'id'>) => void;
  updateContract: (id: number, data: Partial<Contract>) => void;

  // credentials
  credentials: Credential[];
  addCredential: (cred: Omit<Credential, 'id'>) => void;
  updateCredential: (id: number, data: Partial<Credential>) => void;

  credentialCategories: typeof CREDENTIAL_CATEGORIES;
  credentialTemplates: typeof CREDENTIAL_TEMPLATES;
  credentialRequirements: typeof CREDENTIAL_REQUIREMENTS_SEED;
  addCredentialRequirement: (req: any) => void;
  updateCredentialRequirement: (id: number, data: any) => void;
  deleteCredentialRequirement: (id: number) => void;

  // audit
  auditEntries: AuditEntry[];
  addAuditEntry: (entry: Omit<AuditEntry, 'id' | 'hash' | 'previousHash' | 'createdAt'>) => void;

  // notifications
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => void;
  markNotificationRead: (id: number) => void;

  // scheduling
  shiftAssignments: ShiftAssignment[];
  addShiftAssignment: (a: Omit<ShiftAssignment, 'id'>) => void;
  publishAssignments: (ids: number[]) => { success: number; failed: { id: number; reason: string }[] };

  // eligibility
  eligibilityStates: EligibilityState[];
  refreshEligibility: (employeeId: number) => void;
  refreshAllEligibility: () => void;

  // grace & waivers
  gracePeriods: GracePeriod[];
  waivers: Waiver[];
  addWaiver: (w: Omit<Waiver, 'id' | 'createdAt'>) => void;

  // system health
  systemHealth: { metric: string; value: string; status: 'HEALTHY' | 'WARNING' | 'CRITICAL'; lastUpdated: string }[];

  // idempotency keys simulation
  idempotencyKeys: Map<string, any>;
};

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0') + Date.now().toString(16);
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      currentUser: null,
      csrfToken: Math.random().toString(36).substring(2),

      login: (email, password) => {
        // mock auth - any password works for demo, but check email pattern
        if (!email.includes('@')) return false;
        const role = email.includes('admin') ? 'SYSTEM_ADMIN' : email.includes('hr') ? 'HR_ADMIN' : email.includes('supervisor') ? 'SUPERVISOR' : 'EMPLOYEE';
        const user = { id: 1, name: email.split('@')[0], role, email };
        set({ isAuthenticated: true, currentUser: user, csrfToken: Math.random().toString(36).substring(2) });
        get().addAuditEntry({ actorId: 1, action: 'LOGIN', resource: 'auth', resourceId: '1', changes: { email } });
        return true;
      },
      logout: () => set({ isAuthenticated: false, currentUser: null }),

      departments: DEPARTMENTS,
      addDepartment: (dept) => set((s) => {
        const newDept = { id: Math.max(0, ...s.departments.map(d => d.id)) + 1, ...dept, isActive: true, createdAt: new Date().toISOString() };
        s.addAuditEntry({ actorId: s.currentUser?.id || 1, action: 'DEPARTMENT_CREATED', resource: 'departments', resourceId: String(newDept.id), changes: dept });
        return { departments: [...s.departments, newDept] };
      }),
      updateDepartment: (id, data) => set((s) => ({
        departments: s.departments.map(d => d.id === id ? { ...d, ...data } : d)
      })),
      deleteDepartment: (id) => set((s) => {
        const activeUnits = s.units.filter(u => u.departmentId === id && u.isActive).length;
        if (activeUnits > 0) throw new Error(`Cannot delete: ${activeUnits} active unit(s)`);
        return { departments: s.departments.map(d => d.id === id ? { ...d, isActive: false } : d) };
      }),

      units: NURSING_UNITS,
      addUnit: (unit) => set((s) => {
        const newUnit = { id: Math.max(0, ...s.units.map(u => u.id)) + 1, ...unit, isActive: true };
        s.addAuditEntry({ actorId: s.currentUser?.id || 1, action: 'UNIT_CREATED', resource: 'nursing_units', resourceId: String(newUnit.id), changes: unit });
        return { units: [...s.units, newUnit] };
      }),
      updateUnit: (id, data) => set((s) => ({
        units: s.units.map(u => u.id === id ? { ...u, ...data } : u)
      })),
      deleteUnit: (id) => set((s) => {
        const activeEmployees = s.employees.filter(e => e.unitId === id && !e.deletedAt).length;
        if (activeEmployees > 0) throw new Error(`Cannot delete: ${activeEmployees} active employee(s)`);
        return { units: s.units.map(u => u.id === id ? { ...u, isActive: false } : u) };
      }),
      updateBedCapacity: (id, bedCount, reason, actorId) => set((s) => {
        const unit = s.units.find(u => u.id === id);
        if (!unit) throw new Error('Unit not found');
        if (bedCount < 0 || bedCount > 500) throw new Error('Bed count must be 0-500');
        const logEntry = { id: s.bedCapacityLog.length + 1, unitId: id, previousCount: unit.bedCount, newCount: bedCount, reason, changedBy: actorId as any, changedAt: new Date().toISOString() };
        s.addAuditEntry({ actorId, action: 'BED_CAPACITY_UPDATED', resource: 'nursing_units', resourceId: String(id), changes: { previous: unit.bedCount, new: bedCount, reason } });
        return {
          units: s.units.map(u => u.id === id ? { ...u, bedCount } : u),
          bedCapacityLog: [...s.bedCapacityLog, logEntry as any]
        } as any;
      }),
      bulkUpdateBedCapacity: (rows, reason, actorId) => {
        const results: any[] = [];
        const state = get();
        const newUnits = [...state.units];
        const newLogs = [...state.bedCapacityLog];
        let logId = newLogs.length + 1;

        for (const row of rows) {
          const unitIdx = newUnits.findIndex(u => u.code === row.unitCode);
          if (unitIdx === -1) {
            results.push({ unitCode: row.unitCode, status: 'REJECTED', reason: 'Unknown or deleted unit' });
            continue;
          }
          const unit = newUnits[unitIdx];
          if (!unit.isActive) {
            results.push({ unitCode: row.unitCode, status: 'REJECTED', reason: 'Unit is inactive' });
            continue;
          }
          if (row.bedCount < 0 || row.bedCount > 500) {
            results.push({ unitCode: row.unitCode, status: 'REJECTED', reason: 'Bed count must be 0–500' });
            continue;
          }
          if (unit.bedCount === row.bedCount) {
            results.push({ unitCode: row.unitCode, status: 'UNCHANGED' });
            continue;
          }
          newLogs.push({ id: logId++, unitId: unit.id, previousCount: unit.bedCount, newCount: row.bedCount, reason, changedBy: actorId, changedAt: new Date().toISOString() });
          newUnits[unitIdx] = { ...unit, bedCount: row.bedCount };
          results.push({ unitCode: row.unitCode, status: 'UPDATED', previous: unit.bedCount, next: row.bedCount });
        }

        set({ units: newUnits, bedCapacityLog: newLogs });
        get().addAuditEntry({ actorId, action: 'BED_CAPACITY_BULK_UPDATED', resource: 'nursing_units', resourceId: 'bulk', changes: { updated: results.filter(r => r.status === 'UPDATED').length, reason } });
        return results;
      },
      importUnits: (csv, dryRun, actorId) => {
        const lines = csv.trim().split('\n');
        const header = lines[0].toLowerCase();
        const hasHeader = header.includes('unit_code') || header.includes('code');
        const dataLines = hasHeader ? lines.slice(1) : lines;
        const results: any[] = [];

        dataLines.forEach((line, idx) => {
          const lineNum = idx + (hasHeader ? 2 : 1);
          const parts = line.split(',').map(s => s.trim());
          if (parts.length < 2) {
            results.push({ line: lineNum, unitCode: parts[0] || 'UNKNOWN', status: 'REJECTED', reason: 'Invalid CSV format' });
            return;
          }
          const unitCode = parts[0];
          const bedCount = parseInt(parts[3] || parts[1], 10);
          if (isNaN(bedCount) || bedCount < 0 || bedCount > 500) {
            results.push({ line: lineNum, unitCode, status: 'REJECTED', reason: 'Bed count must be 0–500' });
            return;
          }
          const unit = get().units.find(u => u.code === unitCode);
          if (!unit) {
            results.push({ line: lineNum, unitCode, status: 'REJECTED', reason: 'Unknown unit code' });
            return;
          }
          if (unit.bedCount === bedCount) {
            results.push({ line: lineNum, unitCode, status: 'UNCHANGED' });
          } else {
            results.push({ line: lineNum, unitCode, status: 'UPDATED', previous: unit.bedCount, next: bedCount });
          }
        });

        if (!dryRun) {
          const rows = results.filter(r => r.status === 'UPDATED').map(r => ({ unitCode: r.unitCode, bedCount: r.next }));
          get().bulkUpdateBedCapacity(rows, 'CSV import', actorId);
        }

        return { results, dryRun };
      },

      bedCapacityLog: BED_CAPACITY_LOG_SEED,
      getBedHistory: (unitId) => get().bedCapacityLog.filter(l => l.unitId === unitId).sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()),

      positions: POSITIONS,
      addPosition: (pos) => set((s) => {
        if (s.positions.find(p => p.code === pos.code)) throw new Error(`Position ${pos.code} already exists`);
        const newPos = { ...pos, isActive: true };
        s.addAuditEntry({ actorId: s.currentUser?.id || 1, action: 'POSITION_CREATED', resource: 'position_directory', resourceId: pos.code, changes: pos });
        return { positions: [...s.positions, newPos] };
      }),
      updatePosition: (code, data) => set((s) => ({
        positions: s.positions.map(p => p.code === code ? { ...p, ...data } : p)
      })),
      deletePosition: (code) => set((s) => {
        const activeEmployees = s.employees.filter(e => e.position === code && !e.deletedAt).length;
        if (activeEmployees > 0) throw new Error(`Cannot delete: ${activeEmployees} active employee(s) hold this code`);
        return { positions: s.positions.map(p => p.code === code ? { ...p, isActive: false } : p) };
      }),

      employees: EMPLOYEES_SEED as Employee[],
      addEmployee: (emp) => {
        const state = get();
        // bulletproof check: position must be active
        const pos = state.positions.find(p => p.code === emp.position);
        if (!pos || !pos.isActive) throw new Error(`POSITION_NOT_ACTIVE: ${emp.position}`);
        // job number unique — from contract to be entered, plain numbers or text+number combination allowed, no AIGH- format
        // Spec §3.1: HR enters unique Job Number + contract terms, fn_onboard_employee_with_contract creates both atomically
        // Duplicate job number triggers full rollback via DB unique constraint
        if (!emp.jobNumber || String(emp.jobNumber).trim().length === 0) throw new Error('Job Number is required — from contract to be entered');
        if (state.employees.find(e => String(e.jobNumber).toLowerCase() === String(emp.jobNumber).toLowerCase() && !e.deletedAt)) throw new Error(`Duplicate job number — job number is from contract and must be unique: ${emp.jobNumber}`);
        // unit exists
        const unit = state.units.find(u => u.id === emp.unitId && u.isActive);
        if (!unit) throw new Error('Invalid unit');

        // Validate contract dates — start/end inclusive, next non-overlapping renewal starts after previous end
        const start = new Date(emp.contractStart);
        const end = new Date(emp.contractEnd);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error('Invalid contract dates');
        if (end <= start) throw new Error('Contract end must be after start — inclusive dates');

        // First Name, Middle Name, Last Name → Full Name auto = First + Middle + Last
        const firstName = (emp as any).firstName?.trim() || '';
        const middleName = (emp as any).middleName?.trim() || '';
        const lastName = (emp as any).lastName?.trim() || '';
        if (!firstName) throw new Error('First Name is required');
        if (!lastName) throw new Error('Last Name is required');
        const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

        // Additional fields after Job Number in order: Job Title, File No., Rank/Grade, Nationality, Job Post (City), Actual Work Place, Specialty, Contract Start/End Hijri, Marital Status, Salary SAR
        const jobTitle = (emp as any).jobTitle?.trim() || '';
        const fileNo = (emp as any).fileNo?.trim() || '';
        const rankGrade = (emp as any).rankGrade?.trim() || '';
        const nationality = (emp as any).nationality?.trim() || '';
        const jobPostLocation = (emp as any).jobPostLocation?.trim() || '';
        const actualWorkPlace = (emp as any).actualWorkPlace?.trim() || '';
        const specialty = (emp as any).specialty?.trim() || '';
        const maritalStatus = (emp as any).maritalStatus || undefined;
        const salary = (emp as any).salary ? Number((emp as any).salary) : undefined;

        if (salary !== undefined && (isNaN(salary) || salary < 0)) throw new Error('Salary must be positive number in SAR');

        const newId = Math.max(0, ...state.employees.map(e => e.id)) + 1;
        const newEmployee: Employee = {
          id: newId,
          firstName,
          middleName: middleName || undefined,
          lastName,
          name: fullName,
          jobNumber: String(emp.jobNumber).trim(),
          jobTitle: jobTitle || undefined,
          fileNo: fileNo || undefined,
          rankGrade: rankGrade || undefined,
          nationality: nationality || undefined,
          jobPostLocation: jobPostLocation || undefined,
          actualWorkPlace: actualWorkPlace || undefined,
          specialty: specialty || undefined,
          maritalStatus: maritalStatus as any,
          salary,
          unitId: emp.unitId,
          position: emp.position,
          contactEmail: emp.contactEmail,
          status: 'Active',
          hireDate: new Date().toISOString().split('T')[0]
        };
        const newContract: Contract = {
          id: Math.max(0, ...state.contracts.map(c => c.id)) + 1,
          employeeId: newId,
          startDate: emp.contractStart,
          endDate: emp.contractEnd,
          // Contract Start/End are entered as Gregorian dates; the Umm al-Qura
          // equivalent is converted once here and stored with the contract, so
          // the recorded Hijri date cannot drift if the calendar tables change.
          startDateHijri: (emp as any).contractStartHijri || toHijriIso(emp.contractStart),
          endDateHijri: (emp as any).contractEndHijri || toHijriIso(emp.contractEnd),
          status: 'Approved',
        };

        // atomic transaction simulation — fn_onboard_employee_with_contract creates employee + approved contract + audit entry in one block
        set((s) => ({
          employees: [...s.employees, newEmployee],
          contracts: [...s.contracts, newContract],
        }));

        get().addAuditEntry({ actorId: state.currentUser?.id || 1, action: 'EMPLOYEE_ONBOARDED', resource: 'employees', resourceId: String(newId), changes: { job_number: newEmployee.jobNumber, first_name: firstName, middle_name: middleName, last_name: lastName, full_name: fullName, job_title: jobTitle, file_no: fileNo, rank_grade: rankGrade, nationality, job_post_location: jobPostLocation, actual_work_place: actualWorkPlace, specialty, marital_status: maritalStatus, salary, contract_start: emp.contractStart, contract_end: emp.contractEnd, contract_start_hijri: newContract.startDateHijri, contract_end_hijri: newContract.endDateHijri, note: 'Job Number recorded verbatim as entered (plain number or text + number combination, no format rule). Full Name derived from First + Middle + Last. Contract dates recorded in both Gregorian and Hijri (Umm al-Qura).' } });
        get().refreshEligibility(newId);
        return newId;
      },
      updateEmployee: (id, data) => set((s) => ({
        employees: s.employees.map(e => e.id === id ? { ...e, ...data } : e)
      })),
      deleteEmployee: (id) => set((s) => ({
        employees: s.employees.map(e => e.id === id ? { ...e, deletedAt: new Date().toISOString() } : e)
      })),

      contracts: CONTRACTS_SEED as Contract[],
      addContract: (contract) => set((s) => ({
        contracts: [...s.contracts, {
          ...contract,
          // Hijri (Umm al-Qura) equivalent recorded with the contract, same as
          // the onboarding path, so every contract carries both calendars.
          startDateHijri: contract.startDateHijri || toHijriIso(contract.startDate),
          endDateHijri: contract.endDateHijri || toHijriIso(contract.endDate),
          id: Math.max(0, ...s.contracts.map(c => c.id)) + 1,
        }]
      })),
      updateContract: (id, data) => set((s) => ({
        contracts: s.contracts.map(c => c.id === id ? { ...c, ...data } : c)
      })),

      credentials: [
        { id: 1, employeeId: 1, templateId: 5, validityStatus: 'Valid', issueDate: '2023-01-01', expiryDate: '2026-06-01', trackingData: { scfhs_number: 'SCFHS-001' }, syncStatus: 'SYNCED', lastSyncAttempt: new Date().toISOString() },
        { id: 2, employeeId: 1, templateId: 12, validityStatus: 'Valid', issueDate: '2024-01-01', expiryDate: '2026-01-01', trackingData: {}, syncStatus: 'SYNCED' },
        { id: 3, employeeId: 2, templateId: 5, validityStatus: 'ExpiringSoon', issueDate: '2023-01-01', expiryDate: '2025-10-15', trackingData: {}, syncStatus: 'STALE' },
      ] as Credential[],
      addCredential: (cred) => set((s) => ({
        credentials: [...s.credentials, { ...cred, id: Math.max(0, ...s.credentials.map(c => c.id)) + 1 }]
      })),
      updateCredential: (id, data) => set((s) => ({
        credentials: s.credentials.map(c => c.id === id ? { ...c, ...data } : c)
      })),

      credentialCategories: CREDENTIAL_CATEGORIES,
      credentialTemplates: CREDENTIAL_TEMPLATES,
      credentialRequirements: CREDENTIAL_REQUIREMENTS_SEED,
      addCredentialRequirement: (req) => set((s) => ({
        credentialRequirements: [...s.credentialRequirements, { ...req, id: Math.max(0, ...s.credentialRequirements.map(r => r.id)) + 1 }]
      })),
      updateCredentialRequirement: (id, data) => set((s) => ({
        credentialRequirements: s.credentialRequirements.map(r => r.id === id ? { ...r, ...data } : r)
      })),
      deleteCredentialRequirement: (id) => set((s) => ({
        credentialRequirements: s.credentialRequirements.filter(r => r.id !== id)
      })),

      auditEntries: [
        { id: 1, actorId: 1, action: 'SYSTEM_INIT', resource: 'system', resourceId: '0', changes: { message: 'System initialized with seed data' }, hash: 'a1b2c3d4', previousHash: null, createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
        { id: 2, actorId: 1, action: 'EMPLOYEE_ONBOARDED', resource: 'employees', resourceId: '1', changes: { job_number: '1001' }, hash: 'e5f6g7h8', previousHash: 'a1b2c3d4', createdAt: new Date(Date.now() - 86400000).toISOString() },
      ] as AuditEntry[],
      addAuditEntry: (entry) => set((s) => {
        const last = s.auditEntries[s.auditEntries.length - 1];
        const newEntry: AuditEntry = {
          id: s.auditEntries.length + 1,
          ...entry,
          hash: simpleHash(JSON.stringify(entry) + (last?.hash || '')),
          previousHash: last?.hash || null,
          createdAt: new Date().toISOString(),
        };
        return { auditEntries: [...s.auditEntries, newEntry] };
      }),

      notifications: [
        { id: 1, type: 'CONTRACT_EXPIRY', title: 'Contract expiring soon', message: 'Contract for Fatima Zahra expires in 15 days', recipientId: 1, isRead: false, createdAt: new Date().toISOString(), priority: 'HIGH' },
        { id: 2, type: 'CREDENTIAL_EXPIRY', title: 'SCFHS license expiring', message: 'SCFHS license for Mohammed Al-Rashid expires in 10 days', recipientId: 1, isRead: false, createdAt: new Date(Date.now() - 3600000).toISOString(), priority: 'CRITICAL' },
        { id: 3, type: 'COVERAGE_GAP', title: 'Coverage gap detected', message: 'ICU Main missing 2 nurses for Night shift', recipientId: 1, isRead: true, createdAt: new Date(Date.now() - 7200000).toISOString(), priority: 'MEDIUM' },
      ] as Notification[],
      addNotification: (n) => set((s) => ({
        notifications: [{ ...n, id: Math.max(0, ...s.notifications.map(nn => nn.id)) + 1, isRead: false, createdAt: new Date().toISOString() } as Notification, ...s.notifications]
      })),
      markNotificationRead: (id) => set((s) => ({
        notifications: s.notifications.map(n => n.id === id ? { ...n, isRead: true } : n)
      })),

      shiftAssignments: [
        { id: 1, employeeId: 1, unitId: 13, shiftDate: new Date().toISOString().split('T')[0], shiftName: 'Morning', startTime: '07:00', endTime: '15:00', status: 'Published' },
        { id: 2, employeeId: 3, unitId: 15, shiftDate: new Date().toISOString().split('T')[0], shiftName: 'Evening', startTime: '15:00', endTime: '23:00', status: 'Draft' },
      ] as ShiftAssignment[],
      addShiftAssignment: (a) => set((s) => ({
        shiftAssignments: [...s.shiftAssignments, { ...a, id: Math.max(0, ...s.shiftAssignments.map(x => x.id)) + 1 }]
      })),
      publishAssignments: (ids) => {
        const state = get();
        let success = 0;
        const failed: { id: number; reason: string }[] = [];
        const newAssignments = [...state.shiftAssignments];

        for (const id of ids) {
          const idx = newAssignments.findIndex(a => a.id === id);
          if (idx === -1) { failed.push({ id, reason: 'Not found' }); continue; }
          const assignment = newAssignments[idx];
          // canonical eligibility check
          const eligibility = state.eligibilityStates.find(e => e.employeeId === assignment.employeeId);
          if (eligibility && eligibility.status === 'INELIGIBLE') {
            // check waiver
            const hasWaiver = state.waivers.some(w => w.employeeId === assignment.employeeId && new Date(w.expiryDate) > new Date());
            if (!hasWaiver) {
              failed.push({ id, reason: `Employee ${assignment.employeeId} ineligible: ${eligibility.reasons.join(', ')}` });
              continue;
            }
          }
          newAssignments[idx] = { ...assignment, status: 'Published' };
          success++;
        }

        set({ shiftAssignments: newAssignments });
        get().addAuditEntry({ actorId: state.currentUser?.id || 1, action: 'ROSTER_PUBLISHED', resource: 'shift_assignments', resourceId: ids.join(','), changes: { published: success, failed: failed.length } });
        return { success, failed };
      },

      eligibilityStates: [
        { employeeId: 1, status: 'ELIGIBLE', reasons: [], lastCalculatedAt: new Date().toISOString() },
        { employeeId: 2, status: 'ELIGIBLE_WITH_GRACE', reasons: ['SCFHS expiring soon - grace active'], lastCalculatedAt: new Date().toISOString() },
        { employeeId: 3, status: 'ELIGIBLE', reasons: [], lastCalculatedAt: new Date().toISOString() },
        { employeeId: 4, status: 'INELIGIBLE', reasons: ['Missing mandatory credential: SCFHS'], lastCalculatedAt: new Date().toISOString() },
      ] as EligibilityState[],
      refreshEligibility: (employeeId) => {
        const state = get();
        const employee = state.employees.find(e => e.id === employeeId);
        if (!employee) return;
        const contracts = state.contracts.filter(c => c.employeeId === employeeId && (c.status === 'Active' || c.status === 'Approved'));
        const hasActiveContract = contracts.some(c => {
          const now = new Date();
          return new Date(c.startDate) <= now && new Date(c.endDate) >= now;
        });
        const creds = state.credentials.filter(c => c.employeeId === employeeId);
        const requirements = state.credentialRequirements.filter(r => r.unitId === employee.unitId && (r.position === null || r.position === employee.position));
        const missing: string[] = [];
        if (!hasActiveContract) missing.push('No active contract coverage');
        for (const req of requirements) {
          const template = state.credentialTemplates.find(t => t.id === req.templateId);
          const hasValidCred = creds.some(c => c.templateId === req.templateId && (c.validityStatus === 'Valid' || c.validityStatus === 'ExpiringSoon'));
          if (!hasValidCred) missing.push(`Missing mandatory credential: ${template?.name || req.templateId}`);
        }
        // check waivers
        const activeWaiver = state.waivers.find(w => w.employeeId === employeeId && new Date(w.expiryDate) > new Date());
        let status: EligibilityState['status'] = 'ELIGIBLE';
        let reasons: string[] = [];
        if (missing.length > 0) {
          if (activeWaiver) {
            status = 'ELIGIBLE_WITH_GRACE';
            reasons = [`Waived: ${missing.join(', ')}`];
          } else {
            status = 'INELIGIBLE';
            reasons = missing;
          }
        } else {
          // check grace periods
          const activeGrace = state.gracePeriods.find(g => g.employeeId === employeeId && g.status === 'ACTIVE' && new Date(g.expiresAt) > new Date());
          if (activeGrace) {
            status = 'ELIGIBLE_WITH_GRACE';
            reasons = [activeGrace.reason];
          }
        }
        set((s) => ({
          eligibilityStates: [
            ...s.eligibilityStates.filter(e => e.employeeId !== employeeId),
            { employeeId, status, reasons, lastCalculatedAt: new Date().toISOString() }
          ]
        }));
      },
      refreshAllEligibility: () => {
        const state = get();
        state.employees.forEach(e => {
          if (!e.deletedAt) get().refreshEligibility(e.id);
        });
      },

      gracePeriods: [
        { id: 1, employeeId: 2, templateId: 5, activatedAt: new Date(Date.now() - 86400000 * 5).toISOString(), expiresAt: new Date(Date.now() + 86400000 * 25).toISOString(), status: 'ACTIVE', reason: 'SCFHS renewal in progress - 30 day grace' },
      ] as GracePeriod[],
      waivers: [] as Waiver[],
      addWaiver: (w) => set((s) => {
        // enforce 72h max
        const created = new Date();
        const expiry = new Date(w.expiryDate);
        const diffHours = (expiry.getTime() - created.getTime()) / (1000 * 60 * 60);
        if (diffHours > 72) throw new Error('Waiver max window is 72 hours');
        if (expiry <= created) throw new Error('Waiver expiry must be in future');
        const newWaiver = { ...w, id: Math.max(0, ...s.waivers.map(x => x.id)) + 1, createdAt: created.toISOString() };
        s.addAuditEntry({ actorId: s.currentUser?.id || 1, action: 'WAIVER_CREATED', resource: 'credential_waivers', resourceId: String(newWaiver.id), changes: { employeeId: w.employeeId, templateId: w.templateId, reason: w.reason } });
        // refresh eligibility
        setTimeout(() => get().refreshEligibility(w.employeeId), 0);
        return { waivers: [...s.waivers, newWaiver] };
      }),

      systemHealth: [
        { metric: 'scfhs_sync_freshness', value: '2 hours ago', status: 'HEALTHY', lastUpdated: new Date().toISOString() },
        { metric: 'eligibility_drift_rate', value: '0.2%', status: 'HEALTHY', lastUpdated: new Date().toISOString() },
        { metric: 'backup_verification_age', value: '5 hours ago', status: 'HEALTHY', lastUpdated: new Date().toISOString() },
        { metric: 'pam_elevation_count', value: '2 active', status: 'HEALTHY', lastUpdated: new Date().toISOString() },
        { metric: 'backup_storage_used', value: '42%', status: 'HEALTHY', lastUpdated: new Date().toISOString() },
        { metric: 'wal_archive_lag', value: '3 minutes', status: 'HEALTHY', lastUpdated: new Date().toISOString() },
      ],

      idempotencyKeys: new Map(),
    }),
    {
      name: 'aigh-workforce-storage',
      partialize: (state) => ({
        departments: state.departments,
        units: state.units,
        positions: state.positions,
        employees: state.employees,
        contracts: state.contracts,
        credentials: state.credentials,
        credentialRequirements: state.credentialRequirements,
        auditEntries: state.auditEntries,
        notifications: state.notifications,
        shiftAssignments: state.shiftAssignments,
        eligibilityStates: state.eligibilityStates,
        gracePeriods: state.gracePeriods,
        waivers: state.waivers,
        bedCapacityLog: state.bedCapacityLog,
      }),
    }
  )
);
