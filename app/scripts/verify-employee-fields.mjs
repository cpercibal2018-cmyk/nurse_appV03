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
import { writeFileSync, readFileSync, mkdtempSync, existsSync } from 'fs';
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

// An unhandled rejection is fatal under Node — it is what used to kill this suite
// part-way through section [9], hiding every later failure — and is console noise
// in the browser. Registering a listener records it as a failure instead of
// letting it take the process down.
const unhandled = [];
process.on('unhandledRejection', (reason) => unhandled.push(reason?.message ?? String(reason)));

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
const { latestContractFor, renewalPeriodAfter, periodsOverlap, providesCoverage, isEmployeeRenewable } = await bundle('src/lib/contracts.ts');

check('contract for an unknown employee rejected', /EMPLOYEE_NOT_FOUND/.test(rejects(() => s().addContract({ employeeId: 99999, startDate: '2030-01-01', endDate: '2031-01-01', status: 'Draft' })) || ''), rejects(() => s().addContract({ employeeId: 99999, startDate: '2030-01-01', endDate: '2031-01-01', status: 'Draft' })));
const tempId = s().addEmployee({ firstName: 'Temp', lastName: 'Delete', jobNumber: 'TMP-DEL-1', unitId: 1, position: 'SN', contactEmail: 'tmp@aigh.sa', contractStart: '2026-01-01', contractEnd: '2026-06-30' });
s().deleteEmployee(tempId);
check('contract for a soft-deleted employee rejected', /EMPLOYEE_NOT_FOUND/.test(rejects(() => s().addContract({ employeeId: tempId, startDate: '2027-01-01', endDate: '2028-01-01', status: 'Draft' })) || ''));

// ── Fixture owned by sections [9]–[11] ───────────────────────────────────────
// These three sections used to read employee 1's SEEDED contract and assume it
// was Active 2023-01-15 → 2026-01-14. The demo seed now deliberately spreads
// statuses across the renewal states (employee 1 is Expired), so that premise is
// gone. Worse, the assertions are order-dependent: a check that *should* throw
// but does not still mutates the shared store, so later sections pass for the
// wrong reason. Build the coverage period explicitly instead — one employee this
// section owns — so a future seed edit cannot silently invalidate the guard.
const fxId = s().addEmployee({
  firstName: 'Fixture', lastName: 'Coverage', jobNumber: 'FX-1',
  unitId: 1, position: 'SN', contactEmail: 'fixture@aigh.sa',
  contractStart: '2023-01-15', contractEnd: '2026-01-14',
});
// addEmployee creates the onboarding contract as a Draft (no coverage yet);
// promote it so the fixture has a real coverage period to clash against.
const fxOnboardContract = s().contracts.find(c => c.employeeId === fxId);
check('onboarding creates the contract as a Draft', fxOnboardContract.status === 'Draft', fxOnboardContract.status);
s().updateContract(fxOnboardContract.id, { status: 'Active' });
check('fixture coverage period is Active 2023-01-15 → 2026-01-14',
  s().contracts.find(c => c.id === fxOnboardContract.id).status === 'Active');

check('overlapping Approved period rejected', /CONTRACT_PERIOD_OVERLAP/.test(rejects(() => s().addContract({ employeeId: fxId, startDate: '2025-01-01', endDate: '2025-12-31', status: 'Approved' })) || ''));
check('overlapping Active period rejected', /CONTRACT_PERIOD_OVERLAP/.test(rejects(() => s().addContract({ employeeId: fxId, startDate: '2025-01-01', endDate: '2025-12-31', status: 'Active' })) || ''));
const overlapMsg = rejects(() => s().addContract({ employeeId: fxId, startDate: '2025-01-01', endDate: '2025-12-31', status: 'Approved' })) || '';
check('overlap message names the clashing period', /2023-01-15/.test(overlapMsg), overlapMsg);
check('overlap message names the employee Job Number', /FX-1/.test(overlapMsg), overlapMsg);
check('a rejected overlap leaves no row behind',
  !s().contracts.some(c => c.employeeId === fxId && c.startDate === '2025-01-01' && c.status === 'Approved'));
const draftCount = s().contracts.length;
s().addContract({ employeeId: fxId, startDate: '2025-01-01', endDate: '2025-12-31', status: 'Draft' });
check('overlapping Draft allowed (provides no coverage)', s().contracts.length === draftCount + 1);
check('end on or before start rejected', /after start/.test(rejects(() => s().addContract({ employeeId: fxId, startDate: '2030-05-05', endDate: '2030-05-05', status: 'Draft' })) || ''));
const beforeRenewal = s().contracts.length;
s().addContract({ employeeId: fxId, startDate: '2026-01-15', endDate: '2029-01-14', status: 'Approved' });
check('renewal starting the day after the previous end accepted', s().contracts.length === beforeRenewal + 1);
check('renewal carries Hijri dates', /^\d{4}-\d{2}-\d{2}$/.test(s().contracts[s().contracts.length - 1].startDateHijri || ''), s().contracts[s().contracts.length - 1].startDateHijri);

console.log('\n[10] updateContract enforces the same rule');
check('unknown contract id rejected', /CONTRACT_NOT_FOUND/.test(rejects(() => s().updateContract(99999, { status: 'Active' })) || ''));
const draft = s().contracts.find(c => c.employeeId === fxId && c.status === 'Draft' && c.startDate === '2025-01-01');
check('target Draft located', !!draft, draft && draft.startDate);
check('promoting an overlapping Draft to Approved rejected', /CONTRACT_PERIOD_OVERLAP/.test(rejects(() => s().updateContract(draft.id, { status: 'Approved' })) || ''));
s().updateContract(draft.id, { status: 'Terminated' });
check('terminating an overlapping Draft is allowed (no coverage)', s().contracts.find(c => c.id === draft.id).status === 'Terminated');
const renewal = s().contracts.find(c => c.employeeId === fxId && c.startDate === '2026-01-15');
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
const latest = latestContractFor(s().contracts, fxId);
check('latestContractFor prefers the coverage period with the furthest end', latest.status === 'Approved' && latest.startDate === '2026-01-15', latest && [latest.status, latest.startDate]);
check('latestContractFor for an unknown employee is undefined', latestContractFor(s().contracts, 424242) === undefined);

console.log('\n[12] A browser session saved before 2.8.7c is migrated, not replayed');
// zustand persist stores to localStorage under this key. The exported helpers
// are read off the already-loaded module (this import is a module-cache hit, not
// a fresh instance); the genuine rehydration test is the `bundle(…, 'migrated')`
// call below, whose distinct filename forces a second module instance so persist
// actually runs its migrate step against what we put in localStorage.
const { normalizePersistedEmployees, stripRetiredIdentifierPrefix, STORE_VERSION } =
  await import(pathToFileURL(join(dir, 'src_lib_store.tsx.mjs')).href);
check('store version is declared and bumped for the contract-status migration', STORE_VERSION === 2, STORE_VERSION);
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
// The filter is a real function now, so assert its behaviour rather than
// grepping the JSX for a string that proves nothing on its own.
const { checkContractCopyCandidate, CONTRACT_COPY_ACCEPT, PDF_MAGIC } = await bundle('src/lib/contracts.ts', 'filter');
const realPdf = { name: 'contract-signed.pdf', type: 'application/pdf', size: 20480, head: PDF };
const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]);
check('picker accept value is PDF only', CONTRACT_COPY_ACCEPT === 'application/pdf,.pdf', CONTRACT_COPY_ACCEPT);
check('PDF_MAGIC is %PDF-', PDF_MAGIC === '%PDF-');
check('a real .pdf is accepted', checkContractCopyCandidate(realPdf).ok === true);
check('an uppercase .PDF is accepted', checkContractCopyCandidate({ ...realPdf, name: 'C.PDF' }).ok === true);
for (const bad of ['contract.jpg', 'contract.pdf.exe', 'contract', 'contract.PDF.txt']) {
  const v = checkContractCopyCandidate({ ...realPdf, name: bad });
  check(`"${bad}" is refused`, v.ok === false && v.code === 'NOT_A_PDF', v);
}
check('a file RENAMED to .pdf is still refused once its bytes are read', (() => {
  const v = checkContractCopyCandidate({ name: 'invoice.pdf', type: 'application/pdf', size: 4096, head: exe });
  return v.ok === false && v.code === 'CONTENT_VERIFICATION_FAILED';
})());
check('...and the picker reads those bytes, so this fires at pick time', /await file\.slice\(0, PDF_MAGIC\.length\)\.arrayBuffer\(\)/.test(contractsPage));
check('a mismatched declared type is refused', (() => {
  const v = checkContractCopyCandidate({ ...realPdf, type: 'text/plain' });
  return v.ok === false && v.code === 'CONTENT_TYPE_MISMATCH';
})());
check('an empty file is refused', checkContractCopyCandidate({ ...realPdf, size: 0, head: new Uint8Array(0) }).code === 'EMPTY_FILE');
check('an oversized file is refused', checkContractCopyCandidate({ ...realPdf, size: MAX_CONTRACT_COPY_BYTES + 1 }).code === 'FILE_TOO_LARGE');
check('the declared size wins over a short head prefix', checkContractCopyCandidate({ ...realPdf, size: MAX_CONTRACT_COPY_BYTES + 1, head: PDF }).code === 'FILE_TOO_LARGE');
check('the size is inferred from the bytes when the picker does not report one', checkContractCopyCandidate({ name: 'c.pdf', type: 'application/pdf', head: new Uint8Array(0) }).code === 'EMPTY_FILE');
check('screen and store share one rule, so they cannot drift', /checkContractCopyCandidate\(/.test(contractsPage) && /checkContractCopyCandidate\(\{ name: file\.name, type: file\.type, head: file\.bytes \}\)/.test(storeSrc));
// Behavioural, not a grep for a comment: what actually makes Ant Design upload a
// file is an `action=` URL or a `customRequest`. Neither is present, and every
// picker's beforeUpload cancels the request after verifying the bytes itself.
// Scoped per picker, because `return true` is legitimate in the onRemove handlers.
const uploadBlocks = contractsPage.split('<Upload.Dragger').slice(1);
check('the contract-copy picker is present in all three flows', uploadBlocks.length === 3, uploadBlocks.length);
for (const [i, block] of uploadBlocks.entries()) {
  const atGate = block.indexOf('beforeUpload=');
  const atRemove = block.indexOf('onRemove=');
  check(`picker ${i + 1} declares a beforeUpload gate before onRemove`, atGate > -1 && atRemove > atGate, { atGate, atRemove });
  const propsRegion = block.slice(0, atGate);
  const gateBody = block.slice(atGate, atRemove);
  check(`picker ${i + 1} has no action= URL, so AntD cannot auto-POST the file`, !/\baction=/.test(propsRegion));
  check(`picker ${i + 1} has no customRequest, so nothing uploads the bytes`, !/customRequest/.test(block));
  check(`picker ${i + 1} verifies the bytes itself before accepting`, /checkContractCopyCandidate\(/.test(gateBody) && /arrayBuffer\(\)/.test(gateBody));
  check(`picker ${i + 1} cancels the request (beforeUpload returns false)`, /return false;/.test(gateBody));
  check(`picker ${i + 1} never returns true from beforeUpload`, !/return true;/.test(gateBody));
}
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

console.log('\n[16] The seeded contract spread feeds Create and Renew correctly');
// Read from the seed module rather than the live store: by now earlier sections
// have added employees and contracts, and these assertions are about the shipped
// demo data, not about what the run happens to have mutated.
const { CONTRACTS_SEED, EMPLOYEES_SEED } = await bundle('src/data/seed.ts', 'seedspread');
const AS_OF_ISO = '2026-06-01';                    // fixed, so the suite is not date-sensitive
const AS_OF = new Date(`${AS_OF_ISO}T00:00:00Z`);
const COVERAGE = ['Approved', 'Active'];
const PRE_COVERAGE = ['Draft', 'PendingApproval'];
const RENEWAL_ELIGIBLE = ['Expired', 'Suspended', 'Terminated', 'Superseded'];

check('every seeded contract carries a known status',
  CONTRACTS_SEED.every(c => [...COVERAGE, ...PRE_COVERAGE, ...RENEWAL_ELIGIBLE].includes(c.status)),
  [...new Set(CONTRACTS_SEED.map(c => c.status))]);
check('providesCoverage agrees with the coverage set on every seeded row',
  CONTRACTS_SEED.every(c => providesCoverage(c.status) === COVERAGE.includes(c.status)));
check('the seed gives the Renew dropdown something to show',
  EMPLOYEES_SEED.some(e => isEmployeeRenewable(CONTRACTS_SEED, e.id, AS_OF)));
check('the seed gives the coverage view something to show',
  EMPLOYEES_SEED.some(e => !isEmployeeRenewable(CONTRACTS_SEED, e.id, AS_OF)));
check('no seeded employee is simultaneously covered and renewable',
  EMPLOYEES_SEED.every(e => {
    const coveredNow = CONTRACTS_SEED.some(c =>
      c.employeeId === e.id && providesCoverage(c.status) &&
      c.startDate <= AS_OF_ISO && c.endDate >= AS_OF_ISO);
    return isEmployeeRenewable(CONTRACTS_SEED, e.id, AS_OF) !== coveredNow;
  }),
  EMPLOYEES_SEED.filter(e => isEmployeeRenewable(CONTRACTS_SEED, e.id, AS_OF)).map(e => e.id));

// The rule Contracts → Create Contract implements: a brand-new hire (no contract
// at all) or a fresh onboard still at Draft/PendingApproval. Someone whose
// contract merely lapsed is an existing employee and belongs under Renew.
const inCreateList = (contracts, employeeId) => {
  const latest = latestContractFor(contracts, employeeId);
  return !latest || PRE_COVERAGE.includes(latest.status);
};
check('no seeded employee is offered under Create — they all have a contract on record',
  EMPLOYEES_SEED.every(e => !inCreateList(CONTRACTS_SEED, e.id)),
  EMPLOYEES_SEED.filter(e => inCreateList(CONTRACTS_SEED, e.id)).map(e => e.id));
check('lapsed coverage is not mistaken for a new hire', !inCreateList(CONTRACTS_SEED, 1));
check('current coverage is not offered under Create', !inCreateList(CONTRACTS_SEED, 4));
check('an employee with no contract at all is offered under Create', inCreateList(CONTRACTS_SEED, 424243));
const newHireId = s().addEmployee({
  firstName: 'Brand', lastName: 'New', jobNumber: 'NEW-1', unitId: 1, position: 'SN',
  contactEmail: 'new@aigh.sa', contractStart: '2028-01-01', contractEnd: '2029-01-01',
});
check('a freshly onboarded employee (Draft contract) IS offered under Create', inCreateList(s().contracts, newHireId));
check('approving that contract removes the employee from Create', (() => {
  const draft = s().contracts.find(c => c.employeeId === newHireId);
  s().updateContract(draft.id, { status: 'Active' });
  return !inCreateList(s().contracts, newHireId);
})());

console.log('\n[17] The API layer is inert in standalone mode and correct when configured');
// This is the regression that used to terminate the suite. `syncWrite(api.create(…))`
// evaluates its argument before syncWrite runs, so a guard inside syncWrite cannot
// prevent the request; the guard has to be in the request itself.
const realFetch = globalThis.fetch;
let seen = [];
globalThis.fetch = (url, init) => {
  seen.push([String(url), init?.method]);
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 7 }) });
};

const standalone = await bundle('src/lib/api.ts', 'standalone');
check('a build without VITE_API_URL reports the API disabled',
  standalone.API_ENABLED === false && standalone.api.enabled === false);
check('standalone api.create resolves to null instead of throwing',
  (await standalone.api.create('employees', { id: 1 })) === null);
await standalone.api.bootstrap();
standalone.syncWrite(standalone.api.update('employees', 1, { salary: 1 }));
standalone.syncWrite(standalone.api.remove('shift-assignments', 1));
await new Promise(r => setTimeout(r, 20));
check('standalone mode issues no fetch at all', seen.length === 0, seen.map(x => x[0]));

seen = [];
const headcount = s().employees.length;
s().addEmployee({
  firstName: 'No', lastName: 'Network', jobNumber: 'NONET-1', unitId: 1, position: 'SN',
  contactEmail: 'nonet@aigh.sa', contractStart: '2028-01-01', contractEnd: '2029-01-01',
});
await new Promise(r => setTimeout(r, 20));
check('the store write path still works with no backend', s().employees.length === headcount + 1);
check('onboarding performs no network I/O in standalone mode', seen.length === 0, seen.map(x => x[0]));

// Configured build: the URL must come from VITE_API_URL, never from "undefined".
const cfgBuild = await build({
  entryPoints: [join(root, 'src/lib/api.ts')], bundle: true, format: 'esm', write: false,
  platform: 'node', define: { 'import.meta.env.VITE_API_URL': '"https://api.example.sa"' },
});
const cfgFile = join(dir, 'api_configured.mjs');
writeFileSync(cfgFile, cfgBuild.outputFiles[0].text);
const configured = await import(pathToFileURL(cfgFile).href);
check('a build with VITE_API_URL reports the API enabled', configured.API_ENABLED === true);
seen = [];
await configured.api.create('employees', { id: 7 });
await configured.api.remove('shift-assignments', 3);
await configured.api.bootstrap();
check('the request URL is built from VITE_API_URL',
  seen[0][0] === 'https://api.example.sa/api/employees', seen[0][0]);
check('no request URL contains "undefined"', seen.every(([u]) => !u.includes('undefined')), seen.map(x => x[0]));
check('create POSTs, remove DELETEs, bootstrap GETs',
  seen[0][1] === 'POST' && seen[1][1] === 'DELETE' && seen[2][1] === undefined, seen);

// A failing backend must stay a console warning. syncWrite attaches its handler
// unconditionally, so a rejected write cannot become an unhandled rejection —
// which under Node would terminate the process, as the original bug did.
globalThis.fetch = () => Promise.reject(new Error('network down'));
const realWarn = console.warn;
let warnings = 0;
console.warn = () => { warnings++; };
configured.syncWrite(configured.api.update('employees', 1, { salary: 2 }));
configured.syncWrite(configured.api.remove('contracts', 1));
await new Promise(r => setTimeout(r, 20));
console.warn = realWarn;
check('a failing backend write is swallowed as a warning, not an unhandled rejection',
  warnings === 2, warnings);
globalThis.fetch = realFetch;

console.log('\n[18] The v2 migration refreshes demo rows without destroying real ones');
// A session persisted at v1 holds the old all-Active demo contracts. Refreshing
// those must not cost HR the contracts they created or amended since — the
// migration identifies demo rows by identity, not by replacing the array.
mem.set('aigh-workforce-storage', JSON.stringify({
  version: 1,
  state: {
    employees: [{ id: 1, name: 'Sarah Ahmed Al-Harbi', jobNumber: '1001', fileNo: '1001', jobTitle: 'Registered Nurse' }],
    contracts: [
      { id: 1, employeeId: 1, startDate: '2023-01-15', endDate: '2026-01-14', status: 'Active' },   // untouched demo row
      { id: 2, employeeId: 2, startDate: '2022-06-01', endDate: '2026-05-31', status: 'Terminated' }, // demo row HR terminated
      { id: 900, employeeId: 3, startDate: '2027-01-01', endDate: '2029-12-31', status: 'Approved' }, // HR-created
      { id: 901, employeeId: 4, startDate: '2026-02-01', endDate: '2028-01-31', status: 'Active' },   // HR-created and activated
    ],
  },
}));
const migratedV2 = await bundle('src/lib/store.tsx', 'migratedv2');
for (let i = 0; i < 20 && migratedV2.useStore.persist && !migratedV2.useStore.persist.hasHydrated(); i++) {
  await new Promise(r => setTimeout(r, 5));
}
const v2Contracts = migratedV2.useStore.getState().contracts;
const v2ById = (id) => v2Contracts.find(c => c.id === id);
check('an untouched demo row adopts the current seeded status', v2ById(1)?.status === 'Expired', v2ById(1)?.status);
check('a demo row HR had terminated is left exactly as HR left it', v2ById(2)?.status === 'Terminated', v2ById(2)?.status);
check('a contract HR created survives the migration',
  v2ById(900)?.status === 'Approved' && v2ById(900)?.endDate === '2029-12-31', v2ById(900));
check('a contract HR created AND activated is not mistaken for a demo row',
  v2ById(901)?.status === 'Active' && v2ById(901)?.startDate === '2026-02-01', v2ById(901));
check('the migration neither adds nor drops contract rows', v2Contracts.length === 4, v2Contracts.length);

console.log('\n[19] Nothing is left dangling');
await new Promise(r => setTimeout(r, 50));
check('the run produced no unhandled promise rejections', unhandled.length === 0, unhandled);

// [20] runs after the dangling check on purpose: it is entirely synchronous
// (file reads and comparisons), so it cannot introduce a rejection that [19]
// would have missed. Renumbering [19] instead would contradict
// ANALYSIS_2026-09-20.md, which cites these sections by number.
console.log('\n[20] The two seeds cannot drift apart again');
// server/prisma/seed-data.json is generated from app/src/data/seed.ts by
// scripts/export-seed-data.mjs, and server/prisma/seed.ts consumes it. Until
// 2026-09-21 the server seed kept its own inline copy, which had drifted: all
// eight contracts said 'Active' although six had lapsed (so an API-connected app
// painted them green "Active" beside a grey "No coverage" tag, and called them
// both covered and renewable); five credential templates were reduced to
// fields: [], dropping the issue/expiry definitions credential tracking needs;
// and em/en dashes had been flattened to hyphens. Nothing caught any of it.
const snapshotPath = join(root, '../server/prisma/seed-data.json');
const serverSeedPath = join(root, '../server/prisma/seed.ts');
const { buildSeedData, serialiseSeedData, SHARED_COLLECTIONS } = await import('./export-seed-data.mjs');
check('the generated snapshot is committed', existsSync(snapshotPath), snapshotPath);
const committed = existsSync(snapshotPath) ? readFileSync(snapshotPath, 'utf8') : '';
const fresh = serialiseSeedData(buildSeedData());
check('the snapshot matches app/src/data/seed.ts byte for byte', committed === fresh,
  'stale — regenerate with: (cd app && node scripts/export-seed-data.mjs)');

const data = committed ? JSON.parse(committed) : {};
check('every shared collection survived the round trip',
  Object.keys(SHARED_COLLECTIONS).every(k => Array.isArray(data[k]) && data[k].length > 0),
  Object.keys(data).filter(k => !k.startsWith('_')));
check('the 47-unit directory baseline is intact', (data.NURSING_UNITS || []).length === 47,
  (data.NURSING_UNITS || []).length);

// The substance of the original drift, asserted directly rather than via bytes.
const cById = id => ((data.CONTRACTS || []).find(c => c.id === id) || {});
check('lapsed demo contracts keep their renewal-intended statuses',
  cById(1).status === 'Expired' && cById(2).status === 'Suspended' && cById(3).status === 'Terminated'
  && cById(6).status === 'Superseded' && cById(7).status === 'Expired' && cById(8).status === 'Terminated',
  (data.CONTRACTS || []).map(c => `${c.id}:${c.status}`).join(' '));
check('only the two genuinely current contracts are Active',
  (data.CONTRACTS || []).filter(c => c.status === 'Active').map(c => c.id).join(',') === '4,5',
  (data.CONTRACTS || []).filter(c => c.status === 'Active').map(c => c.id).join(','));
const fieldDefs = (data.CREDENTIAL_TEMPLATES || []).reduce((n, t) => n + ((t.fields || []).length), 0);
check('no credential template lost its field definitions', fieldDefs === 14, fieldDefs);
const passport = (data.CREDENTIAL_TEMPLATES || []).find(t => t.id === 1) || {};
check('the passport template still carries its issue/expiry date fields',
  (passport.fields || []).some(f => f.isIssueDate) && (passport.fields || []).some(f => f.isExpiryDate),
  (passport.fields || []).map(f => f.key).join(','));

// Guard the consumption side too: a regenerated snapshot is worthless if the
// server seed stops reading it and re-inlines the rows.
const serverSeed = existsSync(serverSeedPath) ? readFileSync(serverSeedPath, 'utf8') : '';
check('server/prisma/seed.ts reads the generated snapshot',
  serverSeed.includes("from './seed-data.json'"), '');
check('server/prisma/seed.ts does not re-inline a CONTRACTS literal',
  !/const\s+CONTRACTS\s*=\s*\[/.test(serverSeed), '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
