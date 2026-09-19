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

async function bundle(entry) {
  const res = await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'node',
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
  });
  const file = join(dir, entry.replace(/[\\/]/g, '_') + '.mjs');
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
const { useStore } = await bundle('src/lib/store.tsx');
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
  jobNumber: '5001', jobTitle: 'Staff Nurse', fileNo: 'F-5001', rankGrade: 'Grade 7',
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
  jobNumber: 'EMP2026X', jobTitle: 'Charge Nurse', fileNo: 'F-5002', rankGrade: 'Grade 8',
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
  jobTitle: 'Charge Nurse', fileNo: 'F-5002', rankGrade: 'Grade 8', nationality: 'Egyptian',
  jobPostLocation: 'Unaizah', actualWorkPlace: 'NICU', specialty: 'Neonatal',
  maritalStatus: 'Married', salary: 10500,
})) check(field + ' stored', withMiddle[field] === expected, withMiddle[field]);
check('demo rows carry all nine HR fields', seeded.every(e => e.jobTitle && e.fileNo && e.rankGrade && e.nationality && e.jobPostLocation && e.actualWorkPlace && e.specialty && e.maritalStatus && typeof e.salary === 'number'));

console.log('\n[4] Contract dates carry both calendars');
const c1 = s().contracts.find(c => c.employeeId === idNoMiddle);
check('Gregorian start stored', c1.startDate === '2026-09-19', c1.startDate);
check('Hijri start converted', c1.startDateHijri === '1448-04-08', c1.startDateHijri);
check('Hijri end converted', c1.endDateHijri === '1451-05-09', c1.endDateHijri);
check('caller-supplied Hijri preserved', s().contracts.find(c => c.employeeId === idWithMiddle).startDateHijri === '1447-07-25');
s().addContract({ employeeId: 1, startDate: '2026-03-01', endDate: '2027-02-28', status: 'Approved' });
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
