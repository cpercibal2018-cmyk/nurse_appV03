#!/usr/bin/env node
// Verifies the Workforce onboarding contract by executing the real store and
// the real Hijri module — not a copy of their logic.
//
//   node scripts/verify-employee-fields.mjs
//
// esbuild (already present via Vite) bundles the TypeScript sources, the bundle
// is imported into this process, and the store's addEmployee / addContract are
// driven directly. Exits non-zero on any failed assertion so it can gate CI.

import { build } from 'esbuild';
import { writeFileSync, readFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'aigh-verify-'));

// zustand/persist expects a storage backend; the browser's is not available here.
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

async function bundle(entry, tag) {
  const res = await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'node',
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
  });
  // A distinct filename gives a distinct module instance, so a second call
  // re-runs the module — needed to exercise zustand's rehydrate/migrate path.
  const file = join(dir, entry.replace(/[\\/]/g, '_') + (tag ? '_' + tag : '') + '.mjs');
  writeFileSync(file, res.outputFiles[0].text);
  return import(pathToFileURL(file).href);
}

let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok    ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail === undefined ? '' : '  → got ' + JSON.stringify(detail))); }
};
const rejects = fn => { try { fn(); return null; } catch (e) { return e.message; } };

const { toHijri, toHijriShort, toHijriIso } = await bundle('src/lib/hijri.ts');
const storeMod = await bundle('src/lib/store.tsx');
const { useStore } = storeMod;
const s = () => useStore.getState();

console.log('\n[1] Job Number carries no format rule');
const seeded = s().employees;
check('demo employees present', seeded.length === 8, seeded.length);
check('demo job numbers are plain', seeded.map(e => e.jobNumber).join(' ') === '1001 1002 2003 2004 3005 3006 4007 4008', seeded.map(e => e.jobNumber));
check('no demo job number uses the retired AIGH- pattern', seeded.every(e => !/AIGH-/i.test(e.jobNumber)));

console.log('\n[2] Full Name is derived from First + Middle + Last');
check('demo rows compose correctly', seeded.every(e => e.name === [e.firstName, e.middleName, e.lastName].filter(Boolean).join(' ')));
const idNoMiddle = s().addEmployee({
  firstName: '  Nora  ', middleName: '', lastName: ' Al-Salem ',
  jobNumber: '5001', jobTitle: 'Staff Nurse', fileNo: '5001', rankGrade: 'Grade 7',
  nationality: 'Saudi', jobPostLocation: 'Buraydah', actualWorkPlace: 'ER Main',
  specialty: 'Emergency', maritalStatus: 'Others', salary: 9200,
  unitId: 1, position: 'SN', contactEmail: 'nora@aigh.sa',
  contractStart: '2026-09-19', contractEnd: '2029-09-18',
});
const noMiddle = s().employees.find(e => e.id === idNoMiddle);
check('middle name omitted → no double space', noMiddle.name === 'Nora Al-Salem', noMiddle.name);
check('name parts are trimmed', noMiddle.firstName === 'Nora' && noMiddle.lastName === 'Al-Salem');
const idWithMiddle = s().addEmployee({
  firstName: 'Khalid', middleName: ' bin ', lastName: 'Salem',
  jobNumber: 'EMP2026X', jobTitle: 'Charge Nurse', fileNo: '5002', rankGrade: 'Grade 8',
  nationality: 'Egyptian', jobPostLocation: 'Unaizah', actualWorkPlace: 'NICU',
  specialty: 'Neonatal', maritalStatus: 'Married', salary: 10500,
  unitId: 15, position: 'CN', contactEmail: 'khalid@aigh.sa',
  contractStart: '2026-01-14', contractEnd: '2029-01-13',
  contractStartHijri: '1447-07-25', contractEndHijri: '1450-07-24',
});
const withMiddle = s().employees.find(e => e.id === idWithMiddle);
check('first + middle + last compose', withMiddle.name === 'Khalid bin Salem', withMiddle.name);

console.log('\n[3] Fields after Job Number are captured in order');
for (const [field, expected] of Object.entries({
  jobTitle: 'Charge Nurse', fileNo: '5002', rankGrade: 'Grade 8', nationality: 'Egyptian',
  jobPostLocation: 'Unaizah', actualWorkPlace: 'NICU', specialty: 'Neonatal',
  maritalStatus: 'Married', salary: 10500,
})) check(field + ' stored', withMiddle[field] === expected, withMiddle[field]);
check('demo rows carry all nine HR fields', seeded.every(e => e.jobTitle && e.fileNo && e.rankGrade && e.nationality && e.jobPostLocation && e.actualWorkPlace && e.specialty && e.maritalStatus && typeof e.salary === 'number'));
check('demo file numbers are plain (no prefix, no formatting)', seeded.every(e => /^\d+$/.test(e.fileNo)), seeded.map(e => e.fileNo));
const storeSrc = readFileSync(join(root, 'src/lib/store.tsx'), 'utf8');
check('File No. carries no format rule in the store either', !/fileNo[\s\S]{0,120}pattern/i.test(storeSrc));

console.log('\n[4] Contract dates carry both calendars');
const c1 = s().contracts.find(c => c.employeeId === idNoMiddle);
check('Gregorian start stored', c1.startDate === '2026-09-19', c1.startDate);
check('Hijri start converted', c1.startDateHijri === '1448-04-08', c1.startDateHijri);
check('Hijri end converted', c1.endDateHijri === '1451-05-09', c1.endDateHijri);
check('caller-supplied Hijri preserved', s().contracts.find(c => c.employeeId === idWithMiddle).startDateHijri === '1447-07-25');
s().addContract({ employeeId: 1, startDate: '2026-03-01', endDate: '2027-02-28', status: 'Draft' });
const derived = s().contracts.filter(c => c.employeeId === 1).pop();
check('addContract derives Hijri when omitted', /^\d{4}-\d{2}-\d{2}$/.test(derived.startDateHijri || '') && /^\d{4}-\d{2}-\d{2}$/.test(derived.endDateHijri || ''), [derived.startDateHijri, derived.endDateHijri]);

console.log('\n[5] Guard rails');
check('duplicate job number rejected', /Duplicate job number/i.test(rejects(() => s().addEmployee({ firstName: 'X', lastName: 'Y', jobNumber: '5001', unitId: 1, position: 'SN', contactEmail: 'x@aigh.sa', contractStart: '2026-01-01', contractEnd: '2027-01-01' })) || ''));
check('blank job number rejected', /required/i.test(rejects(() => s().addEmployee({ firstName: 'X', lastName: 'Y', jobNumber: '   ', unitId: 1, position: 'SN', contactEmail: 'x2@aigh.sa', contractStart: '2026-01-01', contractEnd: '2027-01-01' })) || ''));
check('missing First Name rejected', /First Name is required/i.test(rejects(() => s().addEmployee({ firstName: '', lastName: 'Y', jobNumber: '9999', unitId: 1, position: 'SN', contactEmail: 'x3@aigh.sa', contractStart: '2026-01-01', contractEnd: '2027-01-01' })) || ''));
check('missing Last Name rejected', /Last Name is required/i.test(rejects(() => s().addEmployee({ firstName: 'A', lastName: '', jobNumber: '9996', unitId: 1, position: 'SN', contactEmail: 'x6@aigh.sa', contractStart: '2026-01-01', contractEnd: '2027-01-01' })) || ''));
check('negative salary rejected', /positive number in SAR/i.test(rejects(() => s().addEmployee({ firstName: 'A', lastName: 'B', jobNumber: '9998', salary: -5, unitId: 1, position: 'SN', contactEmail: 'x4@aigh.sa', contractStart: '2026-01-01', contractEnd: '2027-01-01' })) || ''));
check('contract end before start rejected', /after start/i.test(rejects(() => s().addEmployee({ firstName: 'A', lastName: 'B', jobNumber: '9997', unitId: 1, position: 'SN', contactEmail: 'x5@aigh.sa', contractStart: '2027-01-01', contractEnd: '2026-01-01' })) || ''));
check('deactivated position rejected', /POSITION_NOT_ACTIVE/.test(rejects(() => s().addEmployee({ firstName: 'A', lastName: 'B', jobNumber: '9995', unitId: 1, position: 'AHN', contactEmail: 'x7@aigh.sa', contractStart: '2026-01-01', contractEnd: '2027-01-01' })) || ''));

console.log('\n[6] Audit trail');
const changes = s().auditEntries.filter(a => a.action === 'EMPLOYEE_ONBOARDED').pop().changes;
check('job_number logged verbatim', changes.job_number === 'EMP2026X', changes.job_number);
check('name parts logged', changes.first_name === 'Khalid' && changes.middle_name === 'bin' && changes.last_name === 'Salem');
check('full_name logged', changes.full_name === 'Khalid bin Salem', changes.full_name);
check('both calendars logged', changes.contract_start_hijri === '1447-07-25' && changes.contract_end_hijri === '1450-07-24');
check('salary and marital status logged', changes.salary === 10500 && changes.marital_status === 'Married');
check('retired AIGH- pattern absent from every audit record', !JSON.stringify(s().auditEntries).includes('AIGH-'));

console.log('\n[7] Hijri conversion against independently published anchors (Umm al-Qura)');
for (const [gregorian, hijri] of [
  ['2024-07-07', '1446-01-01'], // 1 Muharram 1446
  ['2025-06-26', '1447-01-01'], // 1 Muharram 1447
  ['2026-06-16', '1448-01-01'], // 1 Muharram 1448
  ['2026-09-19', '1448-04-08'], // 8 Rabi al-Thani 1448
  ['2025-03-01', '1446-09-01'], // 1 Ramadan 1446
  ['2025-03-30', '1446-10-01'], // Eid al-Fitr 1446
  ['2024-04-10', '1445-10-01'], // Eid al-Fitr 1445
  ['2023-01-15', '1444-06-22'], // 22 Jumada al-Akhirah 1444
]) check(`${gregorian} = ${hijri}`, toHijriIso(gregorian) === hijri, toHijriIso(gregorian));
check('short form is DD/MM/YYYY', toHijriShort('2026-09-19') === '08/04/1448', toHijriShort('2026-09-19'));
check('full form names the Hijri month', toHijri('2026-09-19').includes('ربيع الآخر') && toHijri('2026-09-19').includes('هـ'), toHijri('2026-09-19'));
check('dayjs-like values accepted', toHijriIso({ toDate: () => new Date('2026-06-01T00:00:00Z') }) === '1447-12-15', toHijriIso({ toDate: () => new Date('2026-06-01T00:00:00Z') }));
check('invalid input is safe', toHijriIso('not-a-date') === '' && toHijri(null) === '-' && toHijriShort(undefined) === '');


console.log('\n[8] Onboarding form declares the fields in the required order');
const page = readFileSync(join(root, 'src/modules/workforce/WorkforcePage.tsx'), 'utf8');
const declared = [...page.matchAll(/<Form\.Item name="([A-Za-z]+)"/g)].map(m => m[1]);
const required = ['firstName', 'middleName', 'lastName', 'fullName', 'jobNumber', 'jobTitle', 'fileNo',
  'rankGrade', 'nationality', 'jobPostLocation', 'actualWorkPlace', 'specialty',
  'contractStart', 'contractEnd', 'maritalStatus', 'salary'];
check('form field order matches the specification', JSON.stringify(declared.slice(0, required.length)) === JSON.stringify(required), declared);
check('Full Name field is read-only', /name="fullName"[\s\S]{0,200}readOnly/.test(page));
check('Contract Start and End are both required', (page.match(/name="contract(Start|End)"[\s\S]{0,120}required: true/g) || []).length === 2);
check('File No. placeholder shows a plain number', /name="fileNo"[\s\S]{0,120}placeholder="\d+"/.test(page), (page.match(/name="fileNo"[^>]*placeholder="([^"]*)"/) || [])[1]);


console.log('\n[9] Contract guards hold in the store, not just in a screen');
const { latestContractFor, renewalPeriodAfter, periodsOverlap, providesCoverage } = await bundle('src/lib/contracts.ts');

check('contract for an unknown employee rejected', /EMPLOYEE_NOT_FOUND/.test(rejects(() => s().addContract({ employeeId: 99999, startDate: '2030-01-01', endDate: '2031-01-01', status: 'Draft' })) || ''), rejects(() => s().addContract({ employeeId: 99999, startDate: '2030-01-01', endDate: '2031-01-01', status: 'Draft' })));
const tempId = s().addEmployee({ firstName: 'Temp', lastName: 'Delete', jobNumber: 'TMP-DEL-1', unitId: 1, position: 'SN', contactEmail: 'tmp@aigh.sa', contractStart: '2026-01-01', contractEnd: '2026-06-30' });
s().deleteEmployee(tempId);
check('contract for a soft-deleted employee rejected', /EMPLOYEE_NOT_FOUND/.test(rejects(() => s().addContract({ employeeId: tempId, startDate: '2027-01-01', endDate: '2028-01-01', status: 'Draft' })) || ''));

// Employee 1 carries the seeded Active contract 2023-01-15 → 2026-01-14.
const seededContract = s().contracts.find(c => c.employeeId === 1);
check('seeded coverage contract is Active', seededContract.status === 'Active', seededContract.status);
check('overlapping Approved period rejected', /CONTRACT_PERIOD_OVERLAP/.test(rejects(() => s().addContract({ employeeId: 1, startDate: '2025-01-01', endDate: '2025-12-31', status: 'Approved' })) || ''));
check('overlapping Active period rejected', /CONTRACT_PERIOD_OVERLAP/.test(rejects(() => s().addContract({ employeeId: 1, startDate: '2025-01-01', endDate: '2025-12-31', status: 'Active' })) || ''));
check('overlap message names the clashing period', /2023-01-15/.test(rejects(() => s().addContract({ employeeId: 1, startDate: '2025-01-01', endDate: '2025-12-31', status: 'Approved' })) || ''));
const draftCount = s().contracts.length;
s().addContract({ employeeId: 1, startDate: '2025-01-01', endDate: '2025-12-31', status: 'Draft' });
check('overlapping Draft allowed (provides no coverage)', s().contracts.length === draftCount + 1);
check('end on or before start rejected', /after start/.test(rejects(() => s().addContract({ employeeId: 1, startDate: '2030-05-05', endDate: '2030-05-05', status: 'Draft' })) || ''));
const beforeRenewal = s().contracts.length;
s().addContract({ employeeId: 1, startDate: '2026-01-15', endDate: '2029-01-14', status: 'Approved' });
check('renewal starting the day after the previous end accepted', s().contracts.length === beforeRenewal + 1);
check('renewal carries Hijri dates', /^\d{4}-\d{2}-\d{2}$/.test(s().contracts[s().contracts.length - 1].startDateHijri || ''), s().contracts[s().contracts.length - 1].startDateHijri);

console.log('\n[10] updateContract enforces the same rule');
check('unknown contract id rejected', /CONTRACT_NOT_FOUND/.test(rejects(() => s().updateContract(99999, { status: 'Active' })) || ''));
const draft = s().contracts.find(c => c.employeeId === 1 && c.status === 'Draft' && c.startDate === '2025-01-01');
check('target Draft located', !!draft, draft && draft.startDate);
check('promoting an overlapping Draft to Approved rejected', /CONTRACT_PERIOD_OVERLAP/.test(rejects(() => s().updateContract(draft.id, { status: 'Approved' })) || ''));
s().updateContract(draft.id, { status: 'Terminated' });
check('terminating an overlapping Draft is allowed (no coverage)', s().contracts.find(c => c.id === draft.id).status === 'Terminated');
const renewal = s().contracts.find(c => c.employeeId === 1 && c.startDate === '2026-01-15');
check('re-dating a coverage contract into an overlap rejected', /CONTRACT_PERIOD_OVERLAP/.test(rejects(() => s().updateContract(renewal.id, { startDate: '2025-06-01', endDate: '2027-06-01' })) || ''));
check('re-dating within the free window is allowed', (() => { s().updateContract(renewal.id, { endDate: '2028-12-31' }); return s().contracts.find(c => c.id === renewal.id).endDate === '2028-12-31'; })());

console.log('\n[11] Shared period helpers (Create Contract carries onboarding dates forward)');
check('providesCoverage: Approved/Active only', providesCoverage('Approved') && providesCoverage('Active') && !providesCoverage('Draft') && !providesCoverage('Terminated') && !providesCoverage('Expired'));
check('periodsOverlap is inclusive at both ends', periodsOverlap('2026-01-01', '2026-01-10', '2026-01-10', '2026-02-01') === true);
check('periodsOverlap: adjacent days do not clash', periodsOverlap('2026-01-01', '2026-01-10', '2026-01-11', '2026-02-01') === false);
const prior = { employeeId: 1, startDate: '2023-01-15', endDate: '2026-01-14', status: 'Active' };
const renewalWindow = renewalPeriodAfter(prior);
check('renewal starts the day after the previous end', renewalWindow.start === '2026-01-15', renewalWindow.start);
check('renewal runs for the same length', renewalWindow.end === '2029-01-14', renewalWindow.end);
check('renewal of nothing is null', renewalPeriodAfter(undefined) === null);
const latest = latestContractFor(s().contracts, 1);
check('latestContractFor prefers the coverage period with the furthest end', latest.status === 'Approved' && latest.startDate === '2026-01-15', latest && [latest.status, latest.startDate]);
check('latestContractFor for an unknown employee is undefined', latestContractFor(s().contracts, 424242) === undefined);

console.log('\n[12] A browser session saved before 2.8.7c is migrated, not replayed');
// zustand persist stores to localStorage under this key. Seed it with the
// pre-2.8.7c demo rows at version 0, then import a FRESH copy of the real
// store module so persist actually rehydrates and runs its migrate step.
const { normalizePersistedEmployees, stripRetiredIdentifierPrefix, STORE_VERSION } =
  await import(pathToFileURL(join(dir, 'src_lib_store.tsx.mjs')).href);
check('store version is declared', STORE_VERSION === 1, STORE_VERSION);
check('stripRetiredIdentifierPrefix removes F-', stripRetiredIdentifierPrefix('F-1001') === '1001', stripRetiredIdentifierPrefix('F-1001'));
check('stripRetiredIdentifierPrefix removes AIGH-', stripRetiredIdentifierPrefix('AIGH-1001') === '1001', stripRetiredIdentifierPrefix('AIGH-1001'));
check('stripRetiredIdentifierPrefix leaves a legal text+number job number alone', stripRetiredIdentifierPrefix('AIGH1002') === 'AIGH1002', stripRetiredIdentifierPrefix('AIGH1002'));
check('stripRetiredIdentifierPrefix leaves an HR-typed value alone', stripRetiredIdentifierPrefix('EMP2026X') === 'EMP2026X');
check('normalizePersistedEmployees maps every row', JSON.stringify(
  normalizePersistedEmployees([{ fileNo: 'F-1001', jobNumber: 'AIGH-1001' }, { fileNo: '2003', jobNumber: '2003' }])
) === JSON.stringify([{ fileNo: '1001', jobNumber: '1001' }, { fileNo: '2003', jobNumber: '2003' }]));

mem.set('aigh-workforce-storage', JSON.stringify({
  version: 0,
  state: {
    employees: [
      { id: 1, name: 'Sarah Ahmed Al-Harbi', jobNumber: 'AIGH-1001', fileNo: 'F-1001', jobTitle: 'Registered Nurse' },
      { id: 2, name: 'Mohammed Al-Rashid Al-Qahtani', jobNumber: '1002', fileNo: 'F-1002', jobTitle: 'Head Nurse' },
    ],
  },
}));
const migrated = await bundle('src/lib/store.tsx', 'migrated');
// persist may settle on a microtask; give rehydration a chance to finish.
for (let i = 0; i < 20 && migrated.useStore.persist && !migrated.useStore.persist.hasHydrated(); i++) {
  await new Promise(r => setTimeout(r, 5));
}
const rows = migrated.useStore.getState().employees;
check('migrated File No. is plain', rows.map(e => e.fileNo).join(' ') === '1001 1002', rows.map(e => e.fileNo));
check('migrated Job Number lost the retired AIGH- prefix', rows.map(e => e.jobNumber).join(' ') === '1001 1002', rows.map(e => e.jobNumber));
check('migration kept the rest of the persisted row', rows[0].name === 'Sarah Ahmed Al-Harbi' && rows[0].jobTitle === 'Registered Nurse', rows[0]);

console.log('\n[13] Onboarding defaults: Nursing Unit = Unassigned, Position = SN');
const { UNASSIGNED_UNIT_ID, DEFAULT_ONBOARD_POSITION, NURSING_UNITS } = await bundle('src/data/seed.ts');
check('Unassigned sentinel is 0', UNASSIGNED_UNIT_ID === 0, UNASSIGNED_UNIT_ID);
check('default position is SN', DEFAULT_ONBOARD_POSITION === 'SN', DEFAULT_ONBOARD_POSITION);
check('SN exists and is active in the directory', s().positions.some(p => p.code === 'SN' && p.isActive));
check('Unassigned is NOT a directory row (47-unit / 582-bed baseline intact)',
  !NURSING_UNITS.some(u => u.id === UNASSIGNED_UNIT_ID) && NURSING_UNITS.length === 47, NURSING_UNITS.length);
check('bed total is still 582', NURSING_UNITS.reduce((n, u) => n + u.bedCount, 0) === 582,
  NURSING_UNITS.reduce((n, u) => n + u.bedCount, 0));
check('form declares both defaults', /initialValues=\{\{ unitId: UNASSIGNED_UNIT_ID, position: DEFAULT_ONBOARD_POSITION \}\}/.test(page));
check('Nursing Unit select offers Unassigned', /value: UNASSIGNED_UNIT_ID/.test(page) && page.includes('Unassigned — not yet placed in a unit'));

const idUnassigned = s().addEmployee({
  firstName: 'Raneem', middleName: '', lastName: 'Al-Fahad',
  jobNumber: '6001', jobTitle: 'Staff Nurse', fileNo: '6001', rankGrade: 'Grade 6',
  nationality: 'Saudi', jobPostLocation: 'Buraydah', actualWorkPlace: 'Float Pool',
  specialty: 'General', maritalStatus: 'Single', salary: 8200,
  unitId: UNASSIGNED_UNIT_ID, position: DEFAULT_ONBOARD_POSITION, contactEmail: 'raneem@aigh.sa',
  contractStart: '2026-09-19', contractEnd: '2029-09-18',
});
const unassigned = s().employees.find(e => e.id === idUnassigned);
check('onboarding accepts the Unassigned sentinel', unassigned && unassigned.unitId === 0 && unassigned.position === 'SN',
  unassigned && [unassigned.unitId, unassigned.position]);
check('Full Name still derived for an Unassigned employee', unassigned.name === 'Raneem Al-Fahad', unassigned && unassigned.name);
check('an unknown unit id is still rejected', rejects(() => s().addEmployee({
  firstName: 'X', lastName: 'Y', jobNumber: '6002', unitId: 9999, position: 'SN',
  contactEmail: 'x@aigh.sa', contractStart: '2026-09-19', contractEnd: '2029-09-18',
}))?.includes('Invalid unit'));

console.log('\n[14] Position Assignment is an Employee Master write — HR Admin only (§8.1)');
const posPage = readFileSync(join(root, 'src/modules/workforce/PositionsPage.tsx'), 'utf8');
check('the assignment gate lives in the store, not the screen', /assignPosition: \(\{ employeeId, positionCode, reason \}\) => \{/.test(storeSrc));
check("the store checks the role before writing", /currentUser\?\.role !== 'HR_ADMIN'/.test(storeSrc));
check('the screen disables the button for other roles', /disabled=\{!isHrAdmin\}/.test(posPage));
check('the screen states HR Admin only', posPage.includes('Position Assignment — HR Admin only'));
check('the screen records that no auth role is granted (§8.2)', posPage.includes('§8.2'));

// Evaluate each rejection once — building the detail message by calling the
// action a second time would perform the write twice when the guard is absent.
const anonRejected = rejects(() => s().assignPosition({ employeeId: 1, positionCode: 'CN' }));
check('anonymous caller is refused', anonRejected?.startsWith('FORBIDDEN'), anonRejected);
s().logout(); s().login('employee@aigh.sa', 'demo123');
check('EMPLOYEE is refused', rejects(() => s().assignPosition({ employeeId: 1, positionCode: 'CN' }))?.includes('requires HR_ADMIN'));
s().logout(); s().login('supervisor@aigh.sa', 'demo123');
check('SUPERVISOR is refused (read view only)', rejects(() => s().assignPosition({ employeeId: 1, positionCode: 'CN' }))?.includes('requires HR_ADMIN'));
s().logout(); s().login('admin@aigh.sa', 'demo123');
check('SYSTEM_ADMIN is refused — the gate is HR_ADMIN specifically', rejects(() => s().assignPosition({ employeeId: 1, positionCode: 'CN' }))?.includes('requires HR_ADMIN'));

s().logout(); s().login('hr.admin@aigh.sa', 'demo123');
check("the documented HR demo account really is HR_ADMIN", s().currentUser?.role === 'HR_ADMIN', s().currentUser?.role);
const before = s().employees.find(e => e.id === 1).position;
const res = s().assignPosition({ employeeId: 1, positionCode: 'CN', reason: 'promotion effective next roster' });
check('HR Admin can assign', s().employees.find(e => e.id === 1).position === 'CN' && res.previous === before, res);
const audit = s().auditEntries.filter(a => a.action === 'POSITION_ASSIGNED').pop();
check('audit trail records the change', audit && audit.changes.position.from === before && audit.changes.position.to === 'CN', audit && audit.changes);
check('audit trail proves no authorization role was granted (§8.2)', audit && audit.changes.authRoleGranted === null, audit && audit.changes);
check('reason is recorded', audit && audit.changes.reason === 'promotion effective next roster');
const deprecatedRejected = rejects(() => s().assignPosition({ employeeId: 1, positionCode: 'AHN' }));
check('a deprecated position cannot be assigned', deprecatedRejected?.startsWith('POSITION_NOT_ACTIVE'), deprecatedRejected);
check('an unknown employee is refused', rejects(() => s().assignPosition({ employeeId: 424242, positionCode: 'CN' }))?.startsWith('EMPLOYEE_NOT_FOUND'));
check('a soft-deleted employee is refused', rejects(() => s().assignPosition({ employeeId: idUnassigned === 0 ? 1 : (s().deleteEmployee(idUnassigned), idUnassigned), positionCode: 'CN' }))?.startsWith('EMPLOYEE_NOT_FOUND'));
check('re-assigning the same position is refused', rejects(() => s().assignPosition({ employeeId: 1, positionCode: 'CN' }))?.startsWith('POSITION_UNCHANGED'));

console.log('\n[15] Create Contract attaches a contract copy [PDF]');
// Taken from the SAME module instance as the store being driven — the byte
// vault is module-level, so a second bundle would have an empty one.
const { MAX_CONTRACT_COPY_BYTES, getContractCopyBytes } = storeMod;
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3]);
const contractsPage = readFileSync(join(root, 'src/modules/contracts/ContractsPage.tsx'), 'utf8');

check('the Create Contract form carries the upload', /label="Contract Copy \[PDF\] — required"/.test(contractsPage));
check('the upload accepts PDF only', /accept="\.pdf,application\/pdf"/.test(contractsPage));
check('the upload never auto-POSTs — the store verifies the bytes', /return false; \/\/ never auto-POST/.test(contractsPage));
check('the form refuses to create a contract with no copy', /Contract copy \[PDF\] is required/.test(contractsPage));
check('the attachment gate lives in the store, not the screen', /attachContractCopy: \(\{ contractId, file \}\) => \{/.test(storeSrc));

// The contract under test, created by whoever is signed in at the time.
s().logout(); s().login('hr.admin@aigh.sa', 'demo123');
const cid = s().addContract({ employeeId: 3, startDate: '2031-01-01', endDate: '2033-12-31', status: 'Draft' });
check('addContract returns the new id', typeof cid === 'number' && s().contracts.some(c => c.id === cid), cid);

s().logout();
check('anonymous upload is refused', rejects(() => s().attachContractCopy({ contractId: cid, file: { name: 'c.pdf', type: 'application/pdf', bytes: PDF } }))?.startsWith('FORBIDDEN'));
s().login('employee@aigh.sa', 'demo123');
check('EMPLOYEE upload is refused', rejects(() => s().attachContractCopy({ contractId: cid, file: { name: 'c.pdf', type: 'application/pdf', bytes: PDF } }))?.includes('require HR_ADMIN'));
s().logout(); s().login('supervisor@aigh.sa', 'demo123');
check('SUPERVISOR upload is refused (reduced read, no attachments)', rejects(() => s().attachContractCopy({ contractId: cid, file: { name: 'c.pdf', type: 'application/pdf', bytes: PDF } }))?.includes('require HR_ADMIN'));
s().logout(); s().login('hr.admin@aigh.sa', 'demo123');

check('a non-PDF extension is refused', rejects(() => s().attachContractCopy({ contractId: cid, file: { name: 'contract.jpg', type: 'image/jpeg', bytes: PDF } }))?.startsWith('NOT_A_PDF'));
check('a mismatched declared content type is refused', rejects(() => s().attachContractCopy({ contractId: cid, file: { name: 'c.pdf', type: 'text/plain', bytes: PDF } }))?.startsWith('CONTENT_TYPE_MISMATCH'));
check('bytes that are not really a PDF are refused (§5.3.2 content verification)',
  rejects(() => s().attachContractCopy({ contractId: cid, file: { name: 'c.pdf', type: 'application/pdf', bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]) } }))?.startsWith('CONTENT_VERIFICATION_FAILED'));
check('an empty file is refused', rejects(() => s().attachContractCopy({ contractId: cid, file: { name: 'c.pdf', type: 'application/pdf', bytes: new Uint8Array(0) } }))?.startsWith('EMPTY_FILE'));
check('an oversized file is refused', rejects(() => s().attachContractCopy({ contractId: cid, file: { name: 'c.pdf', type: 'application/pdf', bytes: new Uint8Array(MAX_CONTRACT_COPY_BYTES + 1) } }))?.startsWith('FILE_TOO_LARGE'));
check('an unknown contract is refused', rejects(() => s().attachContractCopy({ contractId: 424242, file: { name: 'c.pdf', type: 'application/pdf', bytes: PDF } }))?.startsWith('CONTRACT_NOT_FOUND'));

const v1 = s().attachContractCopy({ contractId: cid, file: { name: 'contract-signed.pdf', type: 'application/pdf', bytes: PDF } });
check('HR Admin can attach', v1.version === 1 && v1.scanStatus === 'CLEAN' && v1.fileName === 'contract-signed.pdf', v1);
check('a storage key is recorded instead of raw bytes', v1.storageKey === `vault/contracts/${cid}/v1/contract-signed.pdf`, v1.storageKey);
check('a real PDF round-trips through the vault', getContractCopyBytes(v1.id, v1.scanStatus).length === PDF.length);
check('an unscanned attachment is never downloadable (§5.3.2)', rejects(() => getContractCopyBytes(v1.id, 'PENDING'))?.startsWith('SCAN_NOT_CLEAN'));
check('an infected attachment is never downloadable', rejects(() => getContractCopyBytes(v1.id, 'INFECTED'))?.startsWith('SCAN_NOT_CLEAN'));

const bigger = new Uint8Array(PDF.length + 512); bigger.set(PDF, 0);
const v2 = s().attachContractCopy({ contractId: cid, file: { name: 'contract-signed-amended.pdf', type: 'application/pdf', bytes: bigger } });
const copies = s().contracts.find(c => c.id === cid).contractCopy;
check('a second upload is a new version, not an overwrite (§5.3.1)', v2.version === 2 && copies.length === 2 && copies[0].id === v1.id, copies.map(c => c.version));
check('both versions are independently retrievable',
  getContractCopyBytes(v1.id, 'CLEAN').length === PDF.length && getContractCopyBytes(v2.id, 'CLEAN').length === bigger.length);

const attachAudit = s().auditEntries.filter(a => a.action === 'CONTRACT_COPY_ATTACHED');
check('every attachment is audited', attachAudit.length === 2 && attachAudit[1].changes.version === 2, attachAudit.map(a => a.changes.version));

// Bytes must not reach localStorage — only metadata is persisted.
const persisted = JSON.parse(mem.get('aigh-workforce-storage') || '{"state":{}}');
const persistedCopies = (persisted.state.contracts || []).flatMap(c => c.contractCopy || []);
check('attachment metadata is persisted', persistedCopies.some(a => a.id === v2.id), persistedCopies.map(a => a.id));
check('attachment BYTES are never persisted to localStorage',
  JSON.stringify(persistedCopies).length < 2000 && !JSON.stringify(persisted.state.contracts).includes('%PDF'), JSON.stringify(persistedCopies).length);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
