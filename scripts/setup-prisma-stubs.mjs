// Sets up .prisma/client type stubs for server/ and backend/
// Required because binaries.prisma.sh is unreachable from this sandboxed environment,
// so `prisma generate` cannot download engines.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function writeServerStub() {
  const dir = path.join(root, 'server/node_modules/.prisma/client');
  fs.mkdirSync(dir, { recursive: true });
  const dts = `
export type Department = any;
export type Unit = any;
export type Position = any;
export type Employee = any;
export type Contract = any;
export type CredentialCategory = any;
export type CredentialTemplate = any;
export type CredentialRequirement = any;
export type Credential = any;
export type ShiftAssignment = any;
export type Notification = any;
export type AuditEntry = any;
export type User = any;
export type RefreshSession = any;

export interface Delegate<T = any> {
  findMany(args?: any): Promise<T[]>;
  findUnique(args?: any): Promise<T | null>;
  create(args?: any): Promise<T>;
  createMany(args?: any): Promise<{ count: number }>;
  update(args?: any): Promise<T>;
  updateMany(args?: any): Promise<{ count: number }>;
  delete(args?: any): Promise<T>;
  deleteMany(args?: any): Promise<{ count: number }>;
}

export class PrismaClient {
  department: Delegate<Department>;
  unit: Delegate<Unit>;
  position: Delegate<Position>;
  employee: Delegate<Employee>;
  contract: Delegate<Contract>;
  credentialCategory: Delegate<CredentialCategory>;
  credentialTemplate: Delegate<CredentialTemplate>;
  credentialRequirement: Delegate<CredentialRequirement>;
  credential: Delegate<Credential>;
  shiftAssignment: Delegate<ShiftAssignment>;
  notification: Delegate<Notification>;
  auditEntry: Delegate<AuditEntry>;
  user: Delegate<User>;
  refreshSession: Delegate<RefreshSession>;

  $queryRaw<T = unknown>(query: TemplateStringsArray | string, ...values: any[]): Promise<T>;
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
}
`;
  fs.writeFileSync(path.join(dir, 'default.d.ts'), dts);
  fs.writeFileSync(path.join(dir, 'index.d.ts'), dts);
  console.log('Server Prisma stub written to', dir);
}

function writeBackendStub() {
  const dir = path.join(root, 'backend/node_modules/.prisma/client');
  fs.mkdirSync(dir, { recursive: true });
  const dts = `
export type AppRole = "SUPERVISOR" | "HEAD_NURSE" | "STAFF_NURSE" | "CHARGE_NURSE" | "DIRECTOR_OF_NURSING" | "HR_ADMIN" | "SYSTEM_ADMIN" | "AUDITOR" | "CHIEF_NURSE" | "QUALITY_OFFICER" | "NURSE_EDUCATOR" | "DEVELOPER" | "EMPLOYEE";
export const AppRole: Record<AppRole, AppRole>;

export type ScopeType = "SYSTEM" | "DEPARTMENT" | "UNIT";
export const ScopeType: Record<ScopeType, ScopeType>;

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
export const ApprovalStatus: Record<ApprovalStatus, ApprovalStatus>;

export interface Delegate<T = any> {
  findMany(args?: any): Promise<T[]>;
  findUnique(args?: any): Promise<T | null>;
  findFirst(args?: any): Promise<T | null>;
  create(args?: any): Promise<T>;
  createMany(args?: any): Promise<{ count: number }>;
  update(args?: any): Promise<T>;
  updateMany(args?: any): Promise<{ count: number }>;
  delete(args?: any): Promise<T>;
  deleteMany(args?: any): Promise<{ count: number }>;
  upsert(args?: any): Promise<T>;
  count(args?: any): Promise<number>;
}

export namespace Prisma {
  export type TransactionClient = PrismaClient;
  export class PrismaClientKnownRequestError extends Error {
    code: string;
    meta?: Record<string, unknown>;
  }
  export const sql: any;
  export const empty: any;
  export const join: any;
  export const raw: any;
  export const JsonNull: any;
  export const DbNull: any;
}

export class PrismaClient {
  userRoleAssignment: Delegate<{ id: string; userId: string; role: AppRole; scopeType: ScopeType; scopeIds: string[]; expiresAt: Date | null; grantedBy: string; grantedAt: Date; justification?: string; reason?: string; isActive: boolean; user: any }>;
  privilegedSession: Delegate<any>;
  adminApprovalRequest: Delegate<any>;
  auditEntry: Delegate<any>;
  idempotencyKey: Delegate<any>;
  unit: Delegate<any>;
  department: Delegate<any>;
  user: Delegate<any>;
  bedCapacityLog: Delegate<any>;
  workerLease: Delegate<any>;

  $queryRaw<T = unknown>(query: TemplateStringsArray | string, ...values: any[]): Promise<T>;
  $executeRaw<T = unknown>(query: TemplateStringsArray | string, ...values: any[]): Promise<T>;
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  $transaction<T>(promises: Promise<T>[]): Promise<T[]>;
}
`;
  fs.writeFileSync(path.join(dir, 'default.d.ts'), dts);
  fs.writeFileSync(path.join(dir, 'index.d.ts'), dts);
  console.log('Backend Prisma stub written to', dir);
}

writeServerStub();
writeBackendStub();
