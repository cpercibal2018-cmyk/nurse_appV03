import { PrismaClient } from '@prisma/client';
import SEED from './seed-data.json';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Shared demo data is GENERATED, not inlined.
//
// DEPARTMENTS, NURSING_UNITS, POSITIONS, CREDENTIAL_CATEGORIES,
// CREDENTIAL_TEMPLATES, EMPLOYEES, CONTRACTS and CREDENTIAL_REQUIREMENTS come
// from seed-data.json, which app/scripts/export-seed-data.mjs writes out of
// app/src/data/seed.ts. Regenerate with:
//
//     (cd app && node scripts/export-seed-data.mjs)
//
// Do not hand-edit seed-data.json, and do not re-inline these rows here. They
// were inlined until 2026-09-21 and had drifted: all eight contracts were
// 'Active' even though six ended between 2025-12-18 and 2026-07-11, so an
// API-connected app painted lapsed staff green "Active" while the adjacent
// date-bounded Coverage column said "No coverage", and reported the same person
// as both covered and renewable; five credential templates had been reduced to
// `fields: []`, dropping the issue/expiry date definitions credential tracking
// depends on; and em/en dashes had been flattened to hyphens. Section [20] of
// the app test suite now fails if this snapshot goes stale.
//
// Why a generated snapshot rather than importing the app module directly: the
// api service is built with `build: ./server` (docker-compose.yml:29), so the
// image contains server/ and nothing else, and server/Dockerfile's CMD runs
// `npx tsx prisma/seed.ts` at boot. `../../app/src/data/seed` would not exist in
// the container and the API would fail to start. The snapshot lives in prisma/,
// which the Dockerfile already copies explicitly (`COPY prisma ./prisma`).
//
// `as any` because JSON import infers `status: string` where Prisma wants the
// ContractStatus enum. The previously inlined CREDENTIAL_TEMPLATES and
// CREDENTIAL_REQUIREMENTS needed the same cast at their createMany call sites.
// ---------------------------------------------------------------------------
const {
  DEPARTMENTS,
  NURSING_UNITS,
  POSITIONS,
  CREDENTIAL_CATEGORIES,
  CREDENTIAL_TEMPLATES,
  EMPLOYEES,
  CONTRACTS,
  CREDENTIAL_REQUIREMENTS,
} = SEED as any;

// Server-only. The standalone demo seeds no credentials and no published shifts,
// so these have no counterpart to stay in sync with.
const CREDENTIALS = [
  { id: 1, employeeId: 1, templateId: 5, validityStatus: 'Valid', issueDate: '2023-01-01', expiryDate: '2026-06-01', trackingData: { scfhs_number: 'SCFHS-001' }, syncStatus: 'SYNCED' },
  { id: 2, employeeId: 1, templateId: 12, validityStatus: 'Valid', issueDate: '2024-01-01', expiryDate: '2026-01-01', trackingData: {}, syncStatus: 'SYNCED' },
  { id: 3, employeeId: 2, templateId: 5, validityStatus: 'ExpiringSoon', issueDate: '2023-01-01', expiryDate: '2025-10-15', trackingData: {}, syncStatus: 'STALE' },
];

const today = new Date().toISOString().split('T')[0];
const SHIFT_ASSIGNMENTS = [
  { id: 1, employeeId: 1, unitId: 13, shiftDate: today, shiftName: 'Morning', startTime: '07:00', endTime: '15:00', status: 'Published' },
  { id: 2, employeeId: 3, unitId: 15, shiftDate: today, shiftName: 'Evening', startTime: '15:00', endTime: '23:00', status: 'Draft' },
];

async function main() {
  console.log('Seeding AIGH database...');
  // Clear (dev-only) then insert in FK-safe order.
  await prisma.shiftAssignment.deleteMany();
  await prisma.credential.deleteMany();
  await prisma.credentialRequirement.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.credentialTemplate.deleteMany();
  await prisma.credentialCategory.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.department.deleteMany();
  await prisma.position.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditEntry.deleteMany();

  await prisma.department.createMany({ data: DEPARTMENTS });
  await prisma.unit.createMany({ data: NURSING_UNITS });
  await prisma.position.createMany({ data: POSITIONS });
  await prisma.credentialCategory.createMany({ data: CREDENTIAL_CATEGORIES });
  await prisma.credentialTemplate.createMany({ data: CREDENTIAL_TEMPLATES as any });
  await prisma.employee.createMany({ data: EMPLOYEES });
  await prisma.contract.createMany({ data: CONTRACTS });
  await prisma.credentialRequirement.createMany({ data: CREDENTIAL_REQUIREMENTS as any });
  await prisma.credential.createMany({ data: CREDENTIALS as any });
  await prisma.shiftAssignment.createMany({ data: SHIFT_ASSIGNMENTS });

  const counts = {
    departments: await prisma.department.count(),
    units: await prisma.unit.count(),
    positions: await prisma.position.count(),
    employees: await prisma.employee.count(),
    contracts: await prisma.contract.count(),
    templates: await prisma.credentialTemplate.count(),
    credentials: await prisma.credential.count(),
    shifts: await prisma.shiftAssignment.count(),
  };
  console.log('Seed complete:', counts);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
