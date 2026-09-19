#!/usr/bin/env python3
"""Second correction pass for v2.8.7: idempotency (F-09), worker leases (F-11),
FHIR (F-15), attendance (F-16), waivers (F-18), PDPL soft spots (F-19),
bundle budget (F-20), backup RPO (F-24), and P2 hygiene (F-25..F-32).
Runs after patch_v287.py; asserts exact match counts; aborts without writing
on any mismatch."""
import os
import pathlib

# Paths resolve relative to this script's directory (override with AIGH_ROOT).
ROOT = pathlib.Path(os.environ.get('AIGH_ROOT', pathlib.Path(__file__).resolve().parent))

DOC = ROOT / 'AIGH_Nursing_Workforce_Management_System_v2_8_7.md'
text = DOC.read_text(encoding='utf-8')
patches = []


def P(name, old, new, count=1):
    patches.append((name, old, new, count))


# ------------------------------------------------------------------ header
P("HDR-2.8.7b",
  "canonical audit schema, PDPL migration (V35), worker leases (V49)",
  "canonical audit schema, PDPL migration (V35), idempotency lease semantics, worker leases (V49)")

# ------------------------------------------------------------------ F-09 idempotency
P("F09-02-bullet",
  "- Onboarding, invitation creation and roster publication require UUID v4 idempotency keys at the HTTP boundary. The mutation and replay result commit in the same transaction.",
  "- Onboarding, invitation creation and roster publication require UUID v4 idempotency keys at the HTTP boundary. The key row is committed with the business mutation, and a processing lease prevents a crashed request from blocking the key for 24 hours (Section 9.5).")

P("F09-rule-store",
  "- The server stores the key, the response status code and a hash of the response body in a dedicated table, inside the same transaction as the business operation.",
  "- The server stores the key, the response status code, a hash of the full response body and a **minimal replay payload** (resource identifiers and status — never the full body, which can contain personal data) in a dedicated table. The key row is committed with the business mutation.")

P("F09-rule-409",
  "- If a request arrives with a key that is currently being processed (in-flight), the server returns `409 Conflict` with a `Retry-After` header. This prevents race conditions between concurrent duplicate submissions.",
  "- If a request arrives with a key that is currently being processed (in-flight) **and its processing lease is still live**, the server returns `409 Conflict` with a `Retry-After` header. If the lease has lapsed (the previous request crashed), this request retakes the key instead of failing — a stuck key can never block a client for the full 24 hours.")

P("F09-ddl-lease",
  """  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),

  CONSTRAINT uq_idempotency_key UNIQUE (key, actor_id)""",
  """  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  -- Processing lease: if the request that registered the key dies before
  -- completing, the lease lapses and the key can be retaken (see the guard).
  processing_lease_expires_at TIMESTAMPTZ,

  CONSTRAINT uq_idempotency_key UNIQUE (key, actor_id)""")

P("F09-guard-lease",
  """      } else if (existing.status === 'PROCESSING') {
        // Another request is currently processing with this key
        throw new ConflictException({
          message: 'A request with this idempotency key is already being processed',
          retryAfter: 2,
        });""",
  """      } else if (existing.status === 'PROCESSING') {
        // Another request is processing this key — unless its lease has lapsed
        // (crashed worker), in which case this request retakes the key.
        const leaseLive =
          existing.processingLeaseExpiresAt != null &&
          existing.processingLeaseExpiresAt > new Date();
        if (leaseLive) {
          throw new ConflictException({
            message: 'A request with this idempotency key is already being processed',
            retryAfter: 2,
          });
        }
        // Lease lapsed — fall through to the upsert below and retake the key.""")

P("F09-upsert-lease",
  """      create: {
        key: idempotencyKey,
        actorId,
        operation,
        requestPath: req.originalUrl,
        requestHash,
        status: 'PROCESSING',
      },
      update: {
        status: 'PROCESSING',
        requestHash,
        requestPath: req.originalUrl,
      },""",
  """      create: {
        key: idempotencyKey,
        actorId,
        operation,
        requestPath: req.originalUrl,
        requestHash,
        status: 'PROCESSING',
        processingLeaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      update: {
        status: 'PROCESSING',
        requestHash,
        requestPath: req.originalUrl,
        processingLeaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },""")

P("F09-interceptor-payload",
  """          data: {
            status: 'COMPLETED',
            responseCode: res.statusCode,
            responseBody: responseBody,
            responseHash: createHash('sha256')
              .update(JSON.stringify(responseBody))
              .digest('hex'),
            completedAt: new Date(),
          },""",
  """          data: {
            status: 'COMPLETED',
            responseCode: res.statusCode,
            // Minimal replay payload — identifiers only. Storing the full body
            // would keep a second, unlogged copy of personal data for 24 hours
            // (PDPL, Section 8.3).
            responseBody: { id: (responseBody as any)?.id ?? null },
            responseHash: createHash('sha256')
              .update(JSON.stringify(responseBody))
              .digest('hex'),
            completedAt: new Date(),
          },""")

P("F09-cleanup-reap",
  """      const result = await this.prisma.$executeRaw`
        DELETE FROM idempotency_keys WHERE expires_at < now()
      `;
      this.logger.log(`Cleaned up ${result} expired idempotency keys`);""",
  """      const result = await this.prisma.$executeRaw`
        DELETE FROM idempotency_keys
        WHERE expires_at < now()
           OR (status = 'PROCESSING'
               AND processing_lease_expires_at < now() - interval '1 hour')
      `;
      this.logger.log(`Cleaned up ${result} expired idempotency keys`);""")

P("F09-acceptance",
  "| Request idempotency | Duplicate onboarding/invitation/publication requests with same key return original result; concurrent duplicates receive 409; missing key returns 400; expired keys are cleaned up; transient failures use bounded retries |",
  "| Request idempotency | Duplicate onboarding/invitation/publication requests with same key return original result; concurrent duplicates receive 409 while the lease is live; a key whose lease lapsed is retaken rather than blocked; missing key returns 400; expired keys and lapsed leases are cleaned up; stored replay payloads contain identifiers only, never full response bodies |")

# ------------------------------------------------------------------ F-11 worker leases
P("F11-101-table",
  "| V48 | Policy transitions & emergency waivers | 6.1.2 | Implementation spec |",
  """| V48 | Policy transitions & emergency waivers | 6.1.2 | Implementation spec |
| V49 | Worker leases (replaces session-scoped advisory locks) | 10.3 | Implementation spec |""")

P("F11-spec",
  "**Specification:** PostgreSQL advisory locks prevent duplicate processing when running multiple worker instances. Only one worker can hold a given lock at a time.",
  """**Specification:** Exactly one worker instance may run each scheduled job at a time. Workers acquire a **lease** from the `worker_leases` table (V49) before starting, renew it with a heartbeat while running, and release it on completion. A lease that stops being renewed expires and can be taken over, so a crashed worker never blocks a job indefinitely.

**Correction applied in 2.8.7.** Earlier revisions used session-scoped `pg_try_advisory_lock`. That pattern is unsafe behind a connection pool: Prisma may route the acquire and release calls to different pooled connections, and a crash leaves the lock held on a connection that returns to the pool. The advisory-lock helper shown at the end of this section is retained only as legacy reference — all workers use the lease service below. The existing advisory-lock identifiers (100001–100007) are reused as lease keys so code and runbooks that reference them stay valid.

**Implementation — worker lease service (V49, canonical):**

```sql
-- prisma/migrations/V49_worker_leases.sql
CREATE TABLE worker_leases (
  job_name      VARCHAR(100) PRIMARY KEY,   -- e.g. 'notifications.daily_scan'
  holder_id     UUID         NOT NULL,      -- worker instance identity
  acquired_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  heartbeat_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ  NOT NULL,      -- heartbeat_at + lease duration
  lease_seconds INTEGER      NOT NULL DEFAULT 300
);

CREATE INDEX idx_worker_leases_expiry ON worker_leases(expires_at);
```

```typescript
// src/common/worker-lease/worker-lease.service.ts
@Injectable()
export class WorkerLeaseService {
  private readonly holderId = randomUUID(); // one identity per worker process

  /**
   * Runs `job` only if this instance can take the lease for `jobName`.
   * The heartbeat keeps the lease alive while the job runs; if the process
   * dies, the lease expires and another instance takes over on its next run.
   */
  async withLease(
    jobName: string,
    leaseSeconds: number,
    job: () => Promise<void>,
  ): Promise<boolean> {
    // Take the lease only if it is free, expired, or already ours.
    const taken = await this.prisma.$executeRaw`
      INSERT INTO worker_leases (job_name, holder_id, expires_at, lease_seconds)
      VALUES (${jobName}, ${this.holderId},
              now() + make_interval(secs => ${leaseSeconds}), ${leaseSeconds})
      ON CONFLICT (job_name) DO UPDATE
        SET holder_id    = EXCLUDED.holder_id,
            acquired_at  = now(),
            heartbeat_at = now(),
            expires_at   = EXCLUDED.expires_at
        WHERE worker_leases.holder_id = ${this.holderId}
           OR worker_leases.expires_at < now()
    `;
    if (taken === 0) return false; // another live worker holds the lease

    const heartbeat = setInterval(() => {
      void this.prisma.$executeRaw`
        UPDATE worker_leases
        SET heartbeat_at = now(),
            expires_at   = now() + make_interval(secs => ${leaseSeconds})
        WHERE job_name = ${jobName} AND holder_id = ${this.holderId}
      `;
    }, Math.max(1000, (leaseSeconds * 1000) / 3));

    try {
      await job();
      return true;
    } finally {
      clearInterval(heartbeat);
      await this.prisma.$executeRaw`
        DELETE FROM worker_leases
        WHERE job_name = ${jobName} AND holder_id = ${this.holderId}
      `;
    }
  }
}
```

**Usage:**

```typescript
@Cron('0 3 * * *')
async dailyScan() {
  await this.workerLease.withLease('notifications.daily_scan', 900, async () => {
    await this.scanContractExpiries();    // 90-day window
    await this.scanCredentialExpiries();  // 60-day window + expired
    await this.gracePeriodService.expireGraceWindows();
  });
}
```

**Lease keys in use:** `notifications.daily_scan` (900 s), `notifications.smtp_queue` (120 s), `scfhs.nightly_sync` (1800 s), `credentials.grace_expiry` (600 s), `idempotency.cleanup` (300 s), `backup.freshness_check` (600 s), `quarantine.scan` (300 s).""")

P("F11-legacy-heading",
  """**Implementation:**

```typescript
// src/modules/notifications/notification.worker.ts
const DAILY_SCAN_LOCK_ID  = 100001;""",
  """**Implementation — legacy advisory-lock worker (SUPERSEDED by the V49 lease service above; retained for reference only):**

```typescript
// src/modules/notifications/notification.worker.ts
const DAILY_SCAN_LOCK_ID  = 100001;""")

P("F11-seealso",
  """// See also: SCFHS_SYNC_LOCK_ID          = 100003 (Section 5.4)
// See also: GRACE_EXPIRY_LOCK_ID        = 100004 (Section 6.1.1)
// See also: IDEMPOTENCY_CLEANUP_LOCK_ID = 100005 (Section 9.5)
// See also: BACKUP_MONITOR_LOCK_ID      = 100006 (Section 10.6)
// See also: QUARANTINE_SCAN_LOCK_ID     = 100007 (Section 5.3.2)""",
  """// Remaining legacy lock IDs: 100003 SCFHS sync, 100004 grace expiry,
// 100005 idempotency cleanup, 100006 backup monitor, 100007 quarantine scan.
// These are retained as lease keys for the V49 service (Section 10.3) and are
// no longer used as session-scoped advisory locks.""")

P("F11-helper-warning",
  """  private async tryLock(lockId: number): Promise<boolean> {
    const result = await this.prisma.$queryRaw`
      SELECT pg_try_advisory_lock(${lockId}) AS acquired
    `;""",
  """  // SUPERSEDED (2.8.7): session-scoped advisory locks — safe only on a
  // single dedicated connection. Migrate to WorkerLeaseService.withLease (V49).
  private async tryLock(lockId: number): Promise<boolean> {
    const result = await this.prisma.$queryRaw`
      SELECT pg_try_advisory_lock(${lockId}) AS acquired
    `;""",
  count=2)

P("F11-quarantine-rule",
  "5. The quarantine scan worker uses advisory lock `100007` to prevent concurrent workers from scanning the same file.",
  "5. The quarantine scan worker acquires the `quarantine.scan` worker lease (Section 10.3, V49) so only one worker scans at a time; if the worker dies mid-scan the lease expires and the file is re-scanned by the next run.")

P("F11-outcomes",
  "- Fault isolation: a worker crash does not take down the API.",
  """- Fault isolation: a worker crash does not take down the API.
- Bounded recovery: a crashed worker's lease expires within its lease duration, so the next scheduled run takes over without manual intervention.""")

P("F11-12-row",
  "| Separate background worker | Implemented in reviewed production composition; container acceptance pending | Sections 0.2, 10.2–10.3 |",
  """| Separate background worker | Implemented in reviewed production composition; container acceptance pending | Sections 0.2, 10.2–10.3 |
| Worker leases (replaces session-scoped advisory locks) | Implementation specification | Sections 10.3, 10.1 (V49) |""")

# ------------------------------------------------------------------ F-15 FHIR
P("F15-fhir-endpoint",
  """```typescript
// src/modules/interop/fhir.service.ts
@Get('fhir/Practitioner/:id')
async getPractitionerFHIR(@Param('id') id: number) {
  const emp = await this.workforceService.getEmployee(id);

  // Transform internal model to FHIR JSON standard
  return {
    resourceType: "Practitioner",
    id: emp.fhirId,
    identifier: [{ system: "http://aigh.sa/job-number", value: emp.jobNumber }],
    name: [{ family: emp.lastName, given: [emp.firstName] }],
    telecom: [{ system: "email", value: emp.email }],
    // Link to their Role (Unit/Position)
    practitionerRole: [{ reference: `PractitionerRole/${emp.roleFhirId}` }]
  };
}
```""",
  """FHIR R4 models `Practitioner` and `PractitionerRole` as **two separate resources** linked by reference. (Earlier revisions returned a `practitionerRole` element inside `Practitioner`; that element does not exist in the specification, and the output failed the HL7 validator that Section 11.3 requires it to pass.)

```typescript
// src/modules/interop/fhir.controller.ts
// Both resources must pass the HL7 FHIR R4 validator (Section 11.3).
@Controller('api/v1/fhir')
@UseGuards(AuthGuard, RbacGuard)
export class FhirController {
  constructor(
    private readonly workforceService: WorkforceService,
    private readonly credentialsService: CredentialsService,
  ) {}

  @Get('Practitioner/:id')
  async getPractitionerFHIR(@Param('id') id: number) {
    const emp = await this.workforceService.getEmployee(id);

    return {
      resourceType: 'Practitioner',
      id: emp.fhirId,
      identifier: [{ system: 'http://aigh.sa/job-number', value: emp.jobNumber }],
      name: [{ family: emp.lastName, given: [emp.firstName] }],
      telecom: [{ system: 'email', value: emp.email }],
    };
  }

  @Get('PractitionerRole/:id')
  async getPractitionerRoleFHIR(@Param('id') id: number) {
    const emp = await this.workforceService.getEmployee(id);
    const creds = await this.credentialsService.getForEmployee(id);

    return {
      resourceType: 'PractitionerRole',
      id: emp.roleFhirId,
      practitioner: { reference: `Practitioner/${emp.fhirId}` },
      organization: { display: emp.unitName },
      specialty: [{ text: emp.positionTitle }],
      qualification: creds.map((c) => ({
        identifier: [{ system: 'http://scfhs.org.sa/registration', value: c.scfhsRegNumber }],
        code: { text: c.professionalClassification },
      })),
    };
  }
}
```""")

# ------------------------------------------------------------------ F-16 attendance
P("F16-attendance-sql",
  """```sql
-- Find nurses scheduled for current shift who have NOT clocked in
SELECT e.name, sa.shift_name, sa.start_time
FROM shift_assignments sa
JOIN employees e ON sa.employee_id = e.id
WHERE sa.shift_date = CURRENT_DATE
  AND sa.status = 'Published'
  AND sa.start_time <= (now() + interval '30 minutes')
  AND NOT EXISTS (
    SELECT 1 FROM attendance_events ae
    WHERE ae.employee_id = e.id
      AND ae.event_type = 'CLOCK_IN'
      AND ae.event_timestamp >= sa.start_date
  );
```""",
  """```sql
-- Find nurses scheduled for the current shift who have NOT clocked in.
-- Shift start is stored as date + time in the hospital timezone; build a
-- timestamptz explicitly. The trailing 15-minute bound matches the worker
-- period, so each missing clock-in raises one alert per run window instead of
-- re-alerting for the whole shift.
SELECT e.name, sa.shift_name, sa.start_time
FROM shift_assignments sa
JOIN employees e ON sa.employee_id = e.id
WHERE sa.shift_date = (now() AT TIME ZONE 'Asia/Riyadh')::date
  AND sa.status = 'Published'
  AND ((sa.shift_date + sa.start_time) AT TIME ZONE 'Asia/Riyadh')
        <= now() + interval '30 minutes'
  AND ((sa.shift_date + sa.start_time) AT TIME ZONE 'Asia/Riyadh')
        > now() - interval '15 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM attendance_events ae
    WHERE ae.employee_id = e.id
      AND ae.event_type = 'CLOCK_IN'
      AND ae.event_timestamp
            >= ((sa.shift_date + sa.start_time) AT TIME ZONE 'Asia/Riyadh')
  );
```

If repeat suppression must be provable rather than window-bounded, add a
`coverage_alert_log(assignment_id, window_start)` unique key and insert the
alert row in the same transaction as the push send.""",)

# ------------------------------------------------------------------ F-18 waivers
P("F18-v48-table",
  """CREATE TABLE credential_waivers (
  id                BIGSERIAL PRIMARY KEY,
  employee_id       INTEGER NOT NULL REFERENCES employees(id),
  template_id       INTEGER NOT NULL REFERENCES credential_templates(id),
  waived_by         INTEGER NOT NULL REFERENCES accounts(id),
  expiry_date       TIMESTAMPTZ NOT NULL,
  reason            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);""",
  """CREATE TABLE credential_waivers (
  id                BIGSERIAL PRIMARY KEY,
  employee_id       INTEGER NOT NULL REFERENCES employees(id),
  template_id       INTEGER NOT NULL REFERENCES credential_templates(id),
  waived_by         INTEGER NOT NULL REFERENCES accounts(id),
  expiry_date       TIMESTAMPTZ NOT NULL,
  reason            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The 72-hour maximum waiver window (Section 6.1.2) is enforced in the
  -- database, not only in the API.
  CONSTRAINT chk_waiver_max_window
    CHECK (expiry_date <= created_at + interval '72 hours'),
  CONSTRAINT chk_waiver_future
    CHECK (expiry_date > created_at)
);""")

P("F18-enforcement-bullet",
  "- **Priority** — a valid waiver overrides any ineligible status for that specific credential during the waiver's validity period. The waiver is recorded in the eligibility reasons so the materialized state reflects the override.",
  """- **Priority** — a valid waiver overrides any ineligible status for that specific credential during the waiver's validity period. The waiver is recorded in the eligibility reasons so the materialized state reflects the override.
- **Enforcement in the database** — the 72-hour maximum and the future-expiry requirement are enforced by `chk_waiver_max_window` and `chk_waiver_future` on `credential_waivers` (V48); the API applies the same checks so callers receive a clear error before the constraint fires. Role authority remains an application-level check.""")

# ------------------------------------------------------------------ F-19 PDPL
P("F19-blind-index",
  "The index stores a deterministic HMAC-SHA256 hash of the plaintext value, keyed with a secret `PDPL_BLIND_INDEX_PEPPER`. Search flow: the API hashes the user's search query using the pepper → queries the `_blind_index` column → retrieves the record → decrypts the ciphertext for display.",
  "The index stores a deterministic HMAC-SHA256 hash of the plaintext value, keyed with a secret `PDPL_BLIND_INDEX_PEPPER` that lives in the deployment secret store, never in the database. Search flow: the API hashes the user's search query using the pepper → queries the `_blind_index` column → retrieves the record → decrypts the ciphertext for display. Digests record their key version in `*_blind_key_version` (V37), so the pepper can be rotated by writing new digests on update and re-indexing lazily — no single global re-index, no downtime.")

P("F19-residency",
  "- **Technical control** — the application performs a Residency Startup Check against the `DATA_RESIDENCY_REGION` environment variable. If the region is not in the `PDPL_ALLOWED_REGIONS` list, the application fails to boot.",
  "- **Technical control** — the application performs a Residency Startup Check against the `DATA_RESIDENCY_REGION` environment variable. If the region is not in the `PDPL_ALLOWED_REGIONS` list, the application fails to boot. Scope of this control: it detects a **misconfigured deployment**; it does not attest the physical location of data. Residency is evidenced by hosting contracts and infrastructure attestation, not by an environment variable.")

P("F19-erasure-scope",
  "The audit logs remain structurally intact (the hash chain is not broken), but all PII encrypted with that user's key becomes mathematically unreadable. This is legally accepted as irreversible destruction of data.",
  """The audit logs remain structurally intact (the hash chain is not broken), but all PII encrypted with that user's key becomes mathematically unreadable. This is legally accepted as irreversible destruction of data.
- **Scope of erasure (backups)** — crypto-shredding removes readability in the **live** database. Encrypted backups and WAL archives taken before key destruction still contain the ciphertext; the 30-day backup retention (Section 10.6) bounds how long that ciphertext exists. The destroyed key is never restored, and the erasure record captures both the key-destruction time and the date the affected backups expire — this is the evidence provided for a PDPL erasure request.""")

# ------------------------------------------------------------------ F-20 bundle
P("F20-vite-comment",
  """    // Raise the warning threshold now that route chunks are small
    chunkSizeWarningLimit: 250,  // KB""",
  """    // Coarse raw-kB warning only. Vite measures raw bytes, not gzip, so this
    // number must not be raised to silence the entry-bundle warning — the real
    // gate is the gzipped budget check implemented in the Rules below.
    chunkSizeWarningLimit: 250,  // KB (raw) — do not raise further""")

P("F20-manualchunks",
  "          'vendor-utils': ['dayjs', 'axios'],",
  "          'vendor-utils': ['dayjs', 'axios', '@tanstack/react-query'],")

P("F20-rule7",
  "7. After each dependency upgrade, verify that no route chunk exceeds 150 KB gzipped. Add a CI check that parses `vite build` output and fails if any chunk exceeds the threshold.",
  """7. After each dependency upgrade, run the bundle budget check. CI fails when the gzipped entry bundle exceeds 200 KB or any single chunk exceeds 150 KB. Vite's own `chunkSizeWarningLimit` is a raw-kB warning and must never be raised to silence it.

**Implementation — bundle budget check:**

```javascript
// scripts/check-bundle-size.mjs — fails the build when the gzipped budget is exceeded.
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const ASSETS = 'dist/assets';
const ENTRY_BUDGET_KB = 200;   // app shell + vendor-react, gzipped (Section 2.8)
const CHUNK_BUDGET_KB = 150;   // any single chunk, gzipped

const gzKb = (f) => gzipSync(readFileSync(`${ASSETS}/${f}`)).length / 1024;
let entryKb = 0;
let failed = false;

for (const f of readdirSync(ASSETS).filter((f) => f.endsWith('.js'))) {
  const size = gzKb(f);
  if (f.startsWith('index-') || f.startsWith('vendor-react')) entryKb += size;
  if (size > CHUNK_BUDGET_KB) {
    console.error(`FAIL ${f}: ${size.toFixed(2)} KB gz > ${CHUNK_BUDGET_KB} KB`);
    failed = true;
  }
}
if (entryKb > ENTRY_BUDGET_KB) {
  console.error(`FAIL entry bundle: ${entryKb.toFixed(2)} KB gz > ${ENTRY_BUDGET_KB} KB`);
  failed = true;
}
if (failed) process.exit(1);
console.log(`Bundle budget OK — entry ${entryKb.toFixed(2)} KB gz`);
```

Wire it into CI immediately after the frontend build: `node scripts/check-bundle-size.mjs`.""")

P("F20-criterion",
  "| Frontend code-splitting | Zero Vite chunk-size warnings; route chunks load on demand; vendor chunks separated; preloading on hover eliminates visible loading; initial bundle < 200 KB gzipped (currently **Unmet** at 266.47 KB) |",
  "| Frontend code-splitting | Route chunks load on demand; vendor chunks separated (react, antd, utils incl. react-query); preloading on hover eliminates visible loading; initial bundle < 200 KB gzipped; `scripts/check-bundle-size.mjs` fails CI when the entry exceeds 200 KB gz or any chunk exceeds 150 KB gz (entry currently **Unmet** at 266.47 KB) |")

# ------------------------------------------------------------------ F-24 RPO
P("F24-tier1",
  "| Continuous WAL archiving | PostgreSQL WAL streaming to encrypted storage | Continuous (every committed transaction) | 7 days of WAL segments | < 1 minute (bounded by WAL shipping delay) |",
  "| Continuous WAL archiving | PostgreSQL WAL streaming to encrypted storage (`archive_timeout = 300`) | Continuous while active; force-archived every 5 minutes when idle | 7 days of WAL segments | ≤ 5 minutes (bounded by `archive_timeout`; ≈ 1 minute under continuous write load) |")

P("F24-tier2",
  "| Full base backup | `pg_basebackup` compressed snapshot | Nightly at 01:00 Asia/Riyadh (22:00 UTC) | 30 days rolling | 24 hours (without WAL); < 1 minute (with WAL) |",
  "| Full base backup | `pg_basebackup` compressed snapshot | Nightly at 01:00 Asia/Riyadh (22:00 UTC) | 30 days rolling | 24 hours (without WAL); ≤ 5 minutes (with WAL, bounded as above) |")

P("F24-acceptance",
  "| RPO compliance | Recovery from the latest WAL shows data loss < 15 minutes (target: < 1 minute) |",
  """| RPO compliance | Recovery from the latest WAL shows data loss ≤ 5 minutes with `archive_timeout = 300` — inside the 15-minute requirement |

**RPO derivation (2.8.7 clarification):** the achievable RPO is `archive_timeout` plus WAL shipping delay, not the sub-minute figure quoted in earlier revisions. A target below 5 minutes requires lowering `archive_timeout` (for example to 60 seconds) and re-measuring under representative load; the acceptance evidence must state which timeout was in force.""")

# ------------------------------------------------------------------ P2 hygiene
P("F25-positions-endpoint",
  "The frontend position selector in the onboarding form replaces its hardcoded position list with `GET /api/v1/workforce/positions` and groups results by `tier`:",
  "The frontend position selector in the onboarding form replaces its hardcoded position list with `GET /api/v1/positions` and groups results by `tier`:")

P("F26-ns-workshop",
  "| `NS` (Nurse Specialist) | Mandatory credentials and any specialization-specific requirements | SCFHS license + ACLS + specialty certification |",
  "| `NS` (Nursing Supervisor) | Mandatory credentials and any specialization-specific requirements. **Naming caution:** in the position directory `NS` = **Nursing Supervisor** (Section 3.1.1); \"Nurse Specialist\" is an SCFHS professional classification, not a position code | SCFHS license + ACLS + specialty certification |")

P("F27-03-range",
  "Implementation-spec migrations V27–V40 reassigned to resolve collisions (see Section 10.1)",
  "Implementation-spec migrations V27–V48 reassigned to resolve collisions (see Section 10.1)")

P("F28-v45-section",
  "| V45 | Enterprise integration (FHIR/attendance/export) | 14.0 | Implementation spec |",
  "| V45 | Enterprise integration (FHIR/attendance/export) | 14.1–14.3 | Implementation spec |")

P("F29-v47-audit",
  """CREATE TABLE migration_validation_errors (
  id                BIGSERIAL PRIMARY KEY,
  staging_table     VARCHAR(50),
  row_id            INTEGER,
  error_message     TEXT,
  severity          VARCHAR(10) CHECK (severity IN ('WARN', 'BLOCK')),
  resolved          BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now()
);""",
  """CREATE TABLE migration_validation_errors (
  id                BIGSERIAL PRIMARY KEY,
  staging_table     VARCHAR(50),
  row_id            INTEGER,
  error_message     TEXT,
  severity          VARCHAR(10) CHECK (severity IN ('WARN', 'BLOCK')),
  resolved          BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 4. Audit trail for the temporary migration role (Section 10.10).
-- Every statement executed by nurseapp_migration_admin is recorded here.
CREATE TABLE migration_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  actor_role   VARCHAR(50) NOT NULL DEFAULT 'nurseapp_migration_admin',
  action       VARCHAR(100) NOT NULL,
  target_table VARCHAR(50) NOT NULL,
  row_count    INTEGER,
  statement    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Lookup tables and mapper functions used by the Stage 3 commit.
-- HR maintains the mappings before the commit stage runs; unmapped values
-- are flagged in migration_validation_errors and block the commit.
CREATE TABLE migration_staging.unit_map (
  raw_unit  TEXT PRIMARY KEY,
  unit_code VARCHAR(20) NOT NULL REFERENCES nursing_units(code)
);

CREATE TABLE migration_staging.position_map (
  raw_position  TEXT PRIMARY KEY,
  position_code VARCHAR(20) NOT NULL REFERENCES position_directory(code)
);

CREATE OR REPLACE FUNCTION map_unit(raw TEXT) RETURNS INTEGER AS $$
  SELECT nu.id
  FROM migration_staging.unit_map um
  JOIN nursing_units nu ON nu.code = um.unit_code
  WHERE um.raw_unit = raw;
$$ LANGUAGE sql STABLE SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION map_pos(raw TEXT) RETURNS VARCHAR AS $$
  SELECT position_code
  FROM migration_staging.position_map
  WHERE raw_position = raw;
$$ LANGUAGE sql STABLE SET search_path = pg_catalog, public;""")

P("F30-migration-criterion",
  "| Migration restricted | `nurseapp_migration` can create and alter tables but cannot read business data beyond `_prisma_migrations` |",
  "| Migration restricted | `nurseapp_migration` credentials exist only in the release pipeline and are never present on application hosts; it holds DDL rights while the grant scripts run as `nurseapp_owner`. **Note:** DDL rights on business tables imply read access — the control is credential custody and pipeline scope, not SQL-level read isolation |")

P("F31-12-count",
  "Thirty subsystems have complete implementation specifications",
  "Thirty-nine sections have complete implementation specifications")

P("F32-contents-note",
  """14. Enterprise integration
   - 14.1 FHIR interoperability adapter
   - 14.2 Real-time attendance integration
   - 14.3 Data portability & vendor neutrality

---""",
  """14. Enterprise integration
   - 14.1 FHIR interoperability adapter
   - 14.2 Real-time attendance integration
   - 14.3 Data portability & vendor neutrality

> **2.8.7 note:** the contents list covers top-level sections and selected subsections. Subsections 2.3–2.7, 3.2–3.3, 3.5–3.6, 5.2–5.3, 6.2–6.3, 7.2–7.5, 8.2, 8.3.1–8.3.6, 9.1–9.4, 10.2–10.10, 11.1–11.3 and 14.1–14.3 appear in the body of the document.

---""")

print(f"Patches defined: {len(patches)}")
failures = []
for name, old, new, count in patches:
    found = text.count(old)
    if found != count:
        failures.append((name, found, count))
        print(f"FAIL  {name}: found {found}, expected {count}")
    else:
        text = text.replace(old, new)
        print(f"ok    {name} ({count})")

if failures:
    print(f"\n{len(failures)} patch(es) failed — output NOT written.")
    raise SystemExit(1)

DOC.write_text(text, encoding='utf-8')
print(f"\nAll {len(patches)} patches applied. Updated {DOC}")
