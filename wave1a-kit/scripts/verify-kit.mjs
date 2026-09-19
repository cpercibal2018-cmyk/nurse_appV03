#!/usr/bin/env node
// scripts/verify-kit.mjs
// Static self-check for the Wave 1A kit. Runs with plain Node (no deps) and
// catches the class of mistake that causes production incidents: a file
// missing from the drop-in set, a contradicting constant, or a worker that
// still uses the superseded advisory-lock pattern.
//
// Usage:  node scripts/verify-kit.mjs [kitRoot]

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.argv[2] ?? '.';
let pass = 0;
const failures = [];

const ok = (msg) => { pass++; console.log(`  ok    ${msg}`); };
const fail = (msg) => { failures.push(msg); console.log(`  FAIL  ${msg}`); };

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const exists = (rel) => existsSync(join(ROOT, rel));

/**
 * Strip comments before pattern matching. Files legitimately document the
 * pattern they replaced ("BEFORE: pg_try_advisory_lock ..."), and matching
 * that prose produced false failures.
 *   - TS/JS: // line comments and block comments
 *   - SQL:   -- line comments and block comments
 *   - TSX:   {/* ... *\/}
 */
const stripComments = (src, { sql = false } = {}) => {
  let out = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')          // block comments
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')    // JSX comments
    .replace(/^[ \t]*\/\/.*$/gm, ' ');           // // line comments
  if (sql) out = out.replace(/^[ \t]*--.*$/gm, ' '); // -- line comments
  return out;
};

// ── 1. Required files ────────────────────────────────────────────────────────
console.log('\n[1] Required files');
const REQUIRED = [
  'backend/prisma/migrations/V49_worker_leases.sql',
  'backend/prisma/migrations/V36b_harden_onboarding_function.sql',
  'backend/src/common/worker-lease/worker-lease.service.ts',
  'backend/src/common/worker-lease/worker-lease.module.ts',
  'backend/src/common/idempotency/idempotency.guard.ts',
  'backend/src/common/idempotency/idempotency.interceptor.ts',
  'backend/src/common/idempotency/idempotency-cleanup.worker.ts',
  'backend/src/modules/notifications/notification.worker.ts',
  'backend/src/modules/observability/consistency-auditor.worker.ts',
  'backend/src/modules/eligibility/eligibility-state.service.ts',
  'backend/src/modules/workforce/workforce-bulk-capacity.service.ts',
  'backend/src/modules/workforce/controllers/units.controller.ts',
  'backend/src/modules/workforce/dto/bulk-bed-capacity.dto.ts',
  'backend/src/modules/workforce/dto/import-units.dto.ts',
  'backend/src/modules/config/residency.check.ts',
  'frontend/src/modules/workforce/UnitCapacityGrid.tsx',
  'scripts/check-bundle-size.mjs',
  'scripts/verify-kit.mjs',
  'ci/ci.yml',
];
for (const f of REQUIRED) {
  exists(f) ? ok(f) : fail(`missing: ${f}`);
}

// ── 2. Residency allow/deny lists must be disjoint and KSA-correct ───────────
console.log('\n[2] Residency configuration');
try {
  const src = read('backend/src/modules/config/residency.check.ts');
  const list = (name) => {
    const m = src.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm'));
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
  };
  const deny = list('KSA_DENY_REGIONS');
  const allow = list('KSA_ALLOW_REGIONS');

  if (!deny || !allow) fail('could not parse region lists');
  else {
    const overlap = allow.filter((r) => deny.includes(r));
    overlap.length === 0
      ? ok('allow and deny region lists are disjoint')
      : fail(`region in BOTH lists: ${overlap.join(', ')}`);

    deny.includes('me-south-1') && deny.includes('me-central-1')
      ? ok('non-KSA regions denied (Bahrain me-south-1, UAE me-central-1)')
      : fail('deny list must contain me-south-1 and me-central-1');

    /fail closed/i.test(src) || /Refusing to start/i.test(src)
      ? ok('fail-closed behaviour present')
      : fail('expected explicit fail-closed handling');
  }
} catch (e) {
  fail(`residency check unreadable: ${e.message}`);
}

// ── 3. No superseded advisory locks in migrated workers ─────────────────────
console.log('\n[3] Advisory-lock migration');
const MIGRATED = [
  'backend/src/common/idempotency/idempotency-cleanup.worker.ts',
  'backend/src/modules/notifications/notification.worker.ts',
  'backend/src/modules/observability/consistency-auditor.worker.ts',
];
for (const f of MIGRATED) {
  if (!exists(f)) { fail(`missing: ${f}`); continue; }
  const src = stripComments(read(f));
  const usesAdvisory = /pg_try_advisory_lock|pg_advisory_unlock/.test(src);
  const usesLease = /withLease|WorkerLeaseService/.test(src);
  !usesAdvisory && usesLease
    ? ok(`${f.split('/').pop()} uses leases, no advisory locks`)
    : fail(`${f}: advisory=${usesAdvisory} lease=${usesLease}`);
}

// ── 4. Lease service correctness markers ────────────────────────────────────
console.log('\n[4] Lease service');
try {
  const src = read('backend/src/common/worker-lease/worker-lease.service.ts');
  const checks = [
    ['conditional upsert (race-free acquire)', /ON CONFLICT \(job_name\) DO UPDATE/],
    ['expiry predicate in take-over', /expires_at < now\(\)/],
    ['heartbeat interval', /setInterval/],
    ['release only own lease', /holder_id = \$\{this\.holderId\}/],
    ['per-process identity', /randomUUID\(\)/],
  ];
  for (const [label, re] of checks) re.test(src) ? ok(label) : fail(`lease service: ${label} missing`);
} catch (e) {
  fail(`lease service unreadable: ${e.message}`);
}

// ── 5. Idempotency lease semantics ──────────────────────────────────────────
console.log('\n[5] Idempotency guard');
try {
  const guard = read('backend/src/common/idempotency/idempotency.guard.ts');
  const interceptor = read('backend/src/common/idempotency/idempotency.interceptor.ts');

  /processingLeaseExpiresAt/.test(guard)
    ? ok('guard references the processing lease')
    : fail('guard: processing lease not referenced');
  /leaseLive/.test(guard)
    ? ok('409 only while the lease is live; lapsed keys are retaken')
    : fail('guard: lease-lapse retake logic missing');

  !/responseBody:\s*responseBody/.test(interceptor)
    ? ok('interceptor does not store the full response body (PDPL)')
    : fail('interceptor stores the full response body — PII retention risk');
  /minimalPayload|REPLAY_ID_KEYS/.test(interceptor)
    ? ok('interceptor reduces the replay payload to identifiers')
    : fail('interceptor: minimal replay payload missing');
} catch (e) {
  fail(`idempotency files unreadable: ${e.message}`);
}

// ── 6. Guard ordering + onboarding hardening + bulk caps ────────────────────
console.log('\n[6] Other Wave 1A items');
try {
  const ctrl = read('backend/src/modules/workforce/controllers/units.controller.ts');
  /@UseGuards\(AuthGuard, RbacGuard, CsrfGuard\)/.test(ctrl)
    ? ok('B-04 guard order: authenticate → authorize → CSRF')
    : fail('B-04: guard order not enforced at controller level');

  const fn = stripComments(
    read('backend/prisma/migrations/V36b_harden_onboarding_function.sql'),
    { sql: true },
  );
  /SET search_path = pg_catalog, public/.test(fn)
    ? ok('B-11 onboarding fn: search_path pinned')
    : fail('B-11: search_path not pinned');
  !/EXCEPTION WHEN OTHERS/.test(fn)
    ? ok('B-11 onboarding fn: no blanket exception handler')
    : fail('B-11: blanket EXCEPTION WHEN OTHERS still present');
  /fn_append_audit_entry/.test(fn)
    ? ok('B-11 onboarding fn: audit via the chained path')
    : fail('B-11: raw audit insert still used');

  const bulk = read('backend/src/modules/workforce/workforce-bulk-capacity.service.ts');
  /dryRun \?\? true|dryRun: boolean = true/.test(
    read('backend/src/modules/workforce/dto/import-units.dto.ts'),
  )
    ? ok('B-24 CSV import: dry-run is the default')
    : fail('B-24: import is not dry-run by default');
  /bedCapacityLog\.create/.test(bulk)
    ? ok('B-24 bulk update: per-unit capacity log written')
    : fail('B-24: capacity log missing');

  const elig = read('backend/src/modules/eligibility/eligibility-state.service.ts');
  /tx: PrismaLike = this\.prisma/.test(elig)
    ? ok('B-09 refreshState accepts the caller transaction')
    : fail('B-09: refreshState is not transaction-aware');

  const auditor = read('backend/src/modules/observability/consistency-auditor.worker.ts');
  /if \(!actual\)/.test(auditor)
    ? ok('B-13 auditor handles a missing state row')
    : fail('B-13: null-state branch missing');

  const bundle = read('scripts/check-bundle-size.mjs');
  /ENTRY_BUDGET_KB = 200/.test(bundle) && /CHUNK_BUDGET_KB = 150/.test(bundle)
    ? ok('B-19 bundle budgets: 200 KB entry / 150 KB chunk (gzipped)')
    : fail('B-19: bundle budgets wrong');

  const ci = read('ci/ci.yml');
  /node-version: '20'/.test(ci) && /postgres:15/.test(ci)
    ? ok('B-02 CI runs the production target (Node 20 / PG 15)')
    : fail('B-02: CI not on the production target');
} catch (e) {
  fail(`section 6 error: ${e.message}`);
}

// ── Summary ─────────────────────────────────────────────────────────────────
const total = pass + failures.length;
console.log(`\n${'─'.repeat(60)}`);
console.log(`Wave 1A kit check: ${pass}/${total} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('All static checks passed.');
