#!/usr/bin/env python3
"""Apply the independent-review corrections to produce v2.8.7.

Every patch asserts an exact match count; nothing is written unless all
patches land. Re-run-safe: always reads the v2.8.6 source.
"""
import os
import pathlib

# Paths resolve relative to this script's directory (override with AIGH_ROOT).
ROOT = pathlib.Path(os.environ.get('AIGH_ROOT', pathlib.Path(__file__).resolve().parent))

SRC = ROOT / 'uploads' / 'AIGH_Nursing_Workforce_Management_System_v2_8_6.md'
OUT = ROOT / 'AIGH_Nursing_Workforce_Management_System_v2_8_7.md'

text = SRC.read_text(encoding='utf-8')
patches = []


def P(name, old, new, count=1):
    patches.append((name, old, new, count))


# ---------------------------------------------------------------- P0-1 header
P("HDR-revision",
  "**Document revision:** 2.8.6 — urgent decision deadlines, hosting cascade analysis, credential policy workshop, SCFHS integration initiation plan",
  "**Document revision:** 2.8.7 — independent-review corrections: hospital-directory totals, runtime/container alignment, session-cookie and CSRF defects, privilege-separation scope, canonical audit schema, PDPL migration (V35), worker leases (V49)")

# ---------------------------------------------------------------- contents
P("TOC-1",
  """2. Technical architecture
   - 2.9 Hospital organizational structure""",
  """2. Technical architecture
   - 2.8 Frontend code-splitting and bundle optimization
   - 2.9 Hospital organizational structure""")

P("TOC-2",
  """3. Identity, authentication and onboarding
   - 3.1.1 Position directory""",
  """3. Identity, authentication and onboarding
   - 3.1.1 Position directory
   - 3.4 Browser session hardening""")

P("TOC-3",
  """6. Roster eligibility and publication
   - 6.1.2 Emergency eligibility waivers""",
  """6. Roster eligibility and publication
   - 6.1.1 Configurable grace periods
   - 6.1.2 Emergency eligibility waivers""")

P("TOC-4",
  """9. Audit and persistence
10. Deployment, migrations and operations""",
  """9. Audit and persistence
   - 9.2 Request-level audit
   - 9.5 Request idempotency
10. Deployment, migrations and operations""")

P("TOC-5",
  """11. Verification and acceptance
12. Implementation status
13. Roadmap and outstanding decisions
   - 13.4 Urgent decision action plans and deadlines""",
  """11. Verification and acceptance
   - 11.4 Node 20 / PostgreSQL 15 validation runbook
   - 11.5 Skipped unit test investigation and resolution
12. Implementation status
13. Roadmap and outstanding decisions
   - 13.1 Four-phase roadmap
   - 13.2 Remaining gaps and priority order
   - 13.3 Decisions required before production sizing
   - 13.4 Urgent decision action plans and deadlines""")

# ---------------------------------------------------------------- F-01 totals
P("F01-a",
  "**Summary:** 5 departments, 49 nursing units, total bed capacity: 747.",
  """**Summary:** 5 departments, 47 nursing units, total bed capacity: 582.

These totals are derived from the unit catalog above and from the seed data in this section; both were reconciled in revision 2.8.7. If the Hospital Master Unit Directory reports a different unit list or total, HR must add the missing units to the catalog **before** the V28 acceptance test can pass — the two sources must agree.""")

P("F01-b",
  "| Units seeded | 49 nursing units exist with correct department assignments and bed counts |",
  "| Units seeded | 47 nursing units exist with correct department assignments and bed counts |")

P("F01-c",
  "| Bed capacity total | Sum of all unit bed counts equals 747 |",
  "| Bed capacity total | Sum of all unit bed counts equals 582 |")

P("F01-d",
  "| Hospital organizational structure | 5 departments and 49 units seeded with correct hierarchy and bed counts (total 747); department/unit/bed CRUD operations work with referential safety; soft deletes exclude from active views but preserve history; bed capacity changes logged with actor and reason; coverage monitoring reads bed_count; frontend selectors grouped by department |",
  "| Hospital organizational structure | 5 departments and 47 units seeded with correct hierarchy and bed counts (total 582); department/unit/bed CRUD operations work with referential safety; soft deletes exclude from active views but preserve history; bed capacity changes logged with actor and reason; coverage monitoring reads bed_count; frontend selectors grouped by department |")

P("F01-e",
  "| Capacity context | 747 beds, 49 nursing units, estimated 800–1500 nursing staff | Peak concurrent users during scheduling windows TBD |",
  "| Capacity context | 582 beds, 47 nursing units, estimated 800–1500 nursing staff | Peak concurrent users during scheduling windows TBD |")

# ---------------------------------------------------------------- F-02 Dockerfile
P("F02-dockerfile",
  """# Dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]""",
  """# Dockerfile
# Runtime target: Node 20 LTS (Sections 0.2 and 11.4). Keep this tag in step
# with the `engines` field in package.json and the CI runner image.

FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# --ignore-scripts suppresses postinstall hooks, so Prisma's client generation
# must be run explicitly below.
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate && npm run build

# Production dependencies only — keeps build tooling out of the runtime image.
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
# The generated Prisma client lives inside node_modules and is not produced by
# the --omit=dev --ignore-scripts install above; copy it from the build stage.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \\
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]""")

# ---------------------------------------------------------------- F-21 compose
P("F21-compose",
  """services:
  api:
    build: .
    command: ["node", "dist/main.js"]
    ports: ["3000:3000"]
    environment:
      - ENABLE_SCHEDULER=false
      - APP_ORIGIN=${APP_ORIGIN}
    depends_on: [db, redis]

  worker:
    build: .
    command: ["node", "dist/main-worker.js"]
    environment:
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
    depends_on: [db]
    restart: unless-stopped

  db:
    image: postgres:15
    volumes: ["pgdata:/var/lib/postgresql/data"]

  redis:
    image: redis:7-alpine""",
  """services:
  # Only the HTTPS entry point is reachable from the hospital network.
  # The API port is never published to the host (see `expose` below).
  proxy:
    image: nginx:1.27-alpine
    ports: ["443:443", "80:80"]
    volumes:
      - ./deploy/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./deploy/tls:/etc/nginx/tls:ro
    depends_on:
      api: { condition: service_healthy }
    restart: unless-stopped

  api:
    build: .
    command: ["node", "dist/main.js"]
    expose: ["3000"]                      # private network only
    environment:
      - NODE_ENV=production
      - ENABLE_SCHEDULER=false
      - APP_ORIGIN=${APP_ORIGIN}
      - DATABASE_URL=${DATABASE_URL}      # nurseapp_runtime (Section 10.7)
      - REDIS_URL=${REDIS_URL}
    depends_on:
      db:    { condition: service_healthy }
      redis: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
    restart: unless-stopped

  worker:
    build: .
    command: ["node", "dist/main-worker.js"]
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_PORT=${SMTP_PORT}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped

  db:
    image: postgres:15
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}   # deployment secret store
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped""")

# ---------------------------------------------------------------- F-03 / F-17 cookies
P("F03-const",
  """// src/modules/identity/auth.controller.ts
@Post('login')""",
  """// src/modules/identity/auth.controller.ts

// Path-scoped cookie name. The __Host- prefix is deliberately NOT used here:
// browsers reject any __Host- cookie whose Path is not exactly "/", and this
// cookie is scoped to the auth endpoints.
const REFRESH_COOKIE = 'nurseapp_refresh';

@Post('login')""")

P("F03-login",
  """  res.cookie('__Host-refresh', refreshToken, {
    httpOnly: true,          // not accessible to JavaScript
    secure:   true,          // HTTPS only
    sameSite: 'strict',      // no cross-site sending
    path:     '/api/v1/auth', // only sent to auth endpoints
    maxAge:   24 * 60 * 60 * 1000, // 24h absolute boundary
  });""",
  """  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,          // not accessible to JavaScript
    secure:   true,          // HTTPS only
    sameSite: 'lax',         // Lax, not Strict: Strict blocks the IdP redirect planned in Section 3.5
    path:     '/api/v1/auth', // only sent to auth endpoints
    maxAge:   24 * 60 * 60 * 1000, // 24h absolute boundary
  });""")

P("F03-read",
  "  const oldRefresh = req.cookies['__Host-refresh'];",
  "  const oldRefresh = req.cookies[REFRESH_COOKIE];")

P("F03-refresh",
  """  res.cookie('__Host-refresh', refreshToken, {
    httpOnly: true, secure: true, sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: 24 * 60 * 60 * 1000,
  });""",
  """  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true, secure: true, sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: 24 * 60 * 60 * 1000,
  });""")

P("F03-table",
  "| Refresh token | `HttpOnly`, `Secure`, `SameSite=strict` cookie scoped to `/api/v1/auth` | 24 hours | Obtain new access tokens |",
  "| Refresh token | `HttpOnly`, `Secure`, `SameSite=Lax` cookie named `nurseapp_refresh`, scoped to `/api/v1/auth` | 24 hours | Obtain new access tokens. Not `__Host-`: that prefix requires `Path=/`. Lax (not Strict) so the cookie survives the SSO redirect planned in Section 3.5 |")

P("F03-outcomes",
  "- CSRF attacks are blocked — `SameSite: strict` plus the `X-CSRF-Token` header provide defense in depth.",
  "- CSRF attacks are blocked — the Origin check plus the `X-CSRF-Token` header provide defense in depth. `SameSite=Lax` keeps the cookie usable across the IdP redirect (Section 3.5) while still refusing cross-site POSTs.")

# ---------------------------------------------------------------- F-04 CSRF ordering
P("F04-guard-comment",
  """    // Validate CSRF token from header matches session token
    const headerToken = req.headers['x-csrf-token'];""",
  """    // Validate CSRF token from header matches session token.
    // PRECONDITION: the authentication guard has already run — see the
    // registration note below. If req.user is empty, this guard must fail
    // closed rather than fall through.
    const headerToken = req.headers['x-csrf-token'];""")

P("F04-registration",
  """Register `CsrfGuard` globally:

```typescript
// src/app.module.ts
providers: [
  { provide: APP_GUARD, useClass: CsrfGuard },
],
```""",
  """Register `CsrfGuard` **after** authentication. NestJS runs global guards
before controller-scoped guards, so an `APP_GUARD`-registered CSRF guard reads
`req.user` before the auth guard has populated it and rejects every
state-changing request. Apply the guards together at controller level, in order:

```typescript
// src/modules/workforce/controllers/workforce.controller.ts
@Controller('api/v1/workforce')
@UseGuards(AuthGuard, RbacGuard, CsrfGuard) // order matters: authenticate, then check CSRF
export class WorkforceController {}

// src/app.module.ts — do NOT register CsrfGuard as APP_GUARD
// providers: [{ provide: APP_GUARD, useClass: CsrfGuard }]   ← removed in 2.8.7
```

If a single global check is preferred, the guard must resolve the session
itself (from the refresh cookie and the session store) instead of reading
`req.user`.""")

# ---------------------------------------------------------------- F-05 privilege scope
P("F05-grants",
  """-- ============================================================
-- Onboarding lockdown (bulletproof contract-first)
-- ============================================================
-- Revoke direct INSERT rights from the runtime API role
-- This prevents any bypass of the contract-first rule
REVOKE INSERT ON employees FROM nurseapp_runtime;
REVOKE INSERT ON contracts FROM nurseapp_runtime;

-- Grant the API permission to execute the secure gatekeeper function instead
GRANT EXECUTE ON FUNCTION fn_onboard_employee_with_contract TO nurseapp_runtime;""",
  """-- ============================================================
-- Onboarding lockdown (bulletproof contract-first)
-- ============================================================
-- Revoke direct INSERT rights on employees only. Employee creation must go
-- through fn_onboard_employee_with_contract, which creates the employee and
-- its first approved contract atomically.
REVOKE INSERT ON employees FROM nurseapp_runtime;

-- Contracts remain writable: HR must create draft contracts, renew them and
-- terminate them (Section 4). The contract-first guarantee comes from the
-- employees restriction plus the FK and the status trigger below — not from
-- banning contract inserts, which would break renewal.
GRANT EXECUTE ON FUNCTION fn_onboard_employee_with_contract TO nurseapp_runtime;

-- Guard every contract insert/update: valid initial status and sane dates.
CREATE OR REPLACE FUNCTION fn_contract_status_guard() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('Draft', 'PendingApproval', 'Approved', 'Active',
                        'Expired', 'Suspended', 'Terminated', 'Superseded') THEN
    RAISE EXCEPTION 'Invalid contract status %', NEW.status;
  END IF;
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'Contract end date precedes start date';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = pg_catalog, public;

CREATE TRIGGER trg_contract_status_guard
  BEFORE INSERT OR UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION fn_contract_status_guard();""")

P("F05-role-table",
  "No `CREATE`, `ALTER`, `DROP`, `TRUNCATE`; no `DELETE` on `audit_entries`; no direct `INSERT` on `employees`/`contracts` (onboarding via `fn_onboard_employee_with_contract` only) |",
  "No `CREATE`, `ALTER`, `DROP`, `TRUNCATE`; no `DELETE` on `audit_entries`; no direct `INSERT` on `employees` (onboarding via `fn_onboard_employee_with_contract` only); contract writes constrained by `trg_contract_status_guard` |")

P("F05-acceptance",
  "| Database privilege separation | Runtime cannot `ALTER`/`DROP` tables, cannot `DELETE` audit entries, and cannot directly `INSERT` into `employees`/`contracts`; migration role can modify schema but not read business data; backup role is read-only with replication; post-migration grants apply to new tables automatically |",
  "| Database privilege separation | Runtime cannot `ALTER`/`DROP` tables, cannot `DELETE` audit entries, and cannot directly `INSERT` into `employees`; contract rows are accepted only through the status/date trigger; HR can still create, renew and terminate contracts; migration role is confined to the release pipeline; backup role is read-only with replication; post-migration grants apply to new tables automatically |")

P("F05-status-row",
  "| Database privilege separation | Implementation specification (onboarding lockdown added) | Section 10.7 |",
  "| Database privilege separation | Implementation specification (onboarding lockdown scoped to `employees`; contract writes trigger-guarded) | Section 10.7 |")

# ---------------------------------------------------------------- F-06 audit schema
P("F06-audit-ddl",
  """**Core audited records:** registration invitations, employee contacts, credential requirements, coverage requirements, credential document versions, notifications, registration rate limits, pending data/renewal progress, publication metadata, refresh-token hashes.""",
  """**Implementation — canonical audit schema (baseline, `audit_entries`):**

```sql
-- Baseline schema (applied by the existing V01–V26 chain). Reproduced here
-- because this table is referenced by every module, by the privilege grants in
-- Section 10.7 and by the restore procedure in Section 10.6.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE audit_entries (
  id            BIGSERIAL PRIMARY KEY,
  actor_id      INTEGER,                    -- NULL for scheduled/system events
  action        VARCHAR(100) NOT NULL,
  resource      VARCHAR(100) NOT NULL,
  resource_id   VARCHAR(100),
  changes       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- sanitized names/transitions only
  previous_hash VARCHAR(64),
  hash          VARCHAR(64) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_resource ON audit_entries(resource, resource_id, created_at DESC);
CREATE INDEX idx_audit_actor    ON audit_entries(actor_id, created_at DESC);

-- Single supported write path. Serialized with a transaction-scoped advisory
-- lock so concurrent writers cannot fork the chain (Section 9.1).
CREATE OR REPLACE FUNCTION fn_append_audit_entry(
  p_actor_id    INTEGER,
  p_action      VARCHAR,
  p_resource    VARCHAR,
  p_resource_id VARCHAR,
  p_changes     JSONB
) RETURNS BIGINT AS $$
DECLARE
  v_previous_hash VARCHAR(64);
  v_hash          VARCHAR(64);
  v_id            BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit_entries_chain'));

  SELECT hash INTO v_previous_hash
  FROM audit_entries
  ORDER BY id DESC
  LIMIT 1;

  v_hash := encode(
    digest(
      coalesce(v_previous_hash, '') || p_action || p_resource ||
      coalesce(p_resource_id, '') || coalesce(p_changes::text, '') ||
      extract(epoch FROM clock_timestamp())::text,
      'sha256'
    ),
    'hex'
  );

  INSERT INTO audit_entries
    (actor_id, action, resource, resource_id, changes, previous_hash, hash)
  VALUES
    (p_actor_id, p_action, p_resource, p_resource_id,
     coalesce(p_changes, '{}'::jsonb), v_previous_hash, v_hash)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql
   SET search_path = pg_catalog, public;

-- The is_encrypted and encryption_key_id columns are added by V38 (crypto-shredding).
```

**Rules:**

1. `fn_append_audit_entry` is the only supported write path; application code never inserts into `audit_entries` directly.
2. The hash is computed over the payload **after** any PII encryption, so destroying a user key (V38) does not invalidate the chain.
3. `nurseapp_runtime` holds `EXECUTE` on the function plus `SELECT`/`INSERT` on the table, but no `UPDATE` or `DELETE` (Section 10.7).

**Core audited records:** registration invitations, employee contacts, credential requirements, coverage requirements, credential document versions, notifications, registration rate limits, pending data/renewal progress, publication metadata, refresh-token hashes.""")

P("F06-restore-sql",
  """  -- Verify core tables are populated
  SELECT 'employees' AS tbl, count(*) FROM employees
  UNION ALL
  SELECT 'contracts', count(*) FROM contracts
  UNION ALL
  SELECT 'credentials', count(*) FROM credentials
  UNION ALL
  SELECT 'audit_events', count(*) FROM audit_events;

  -- Verify audit chain integrity (last 100 events)
  SELECT count(*) AS broken_chain_links
  FROM audit_events ae
  WHERE ae.previous_hash IS NOT NULL
    AND ae.previous_hash != (
      SELECT hash FROM audit_events
      WHERE id = ae.id - 1
    )
  LIMIT 100;

  -- Verify no data beyond target time
  SELECT max(created_at) AS latest_record FROM audit_events;""",
  """  -- Verify core tables are populated
  SELECT 'employees' AS tbl, count(*) FROM employees
  UNION ALL
  SELECT 'contracts', count(*) FROM contracts
  UNION ALL
  SELECT 'credentials', count(*) FROM credentials
  UNION ALL
  SELECT 'audit_entries', count(*) FROM audit_entries;

  -- Verify audit chain integrity (last 100 entries)
  SELECT count(*) AS broken_chain_links
  FROM (
    SELECT previous_hash,
           lag(hash) OVER (ORDER BY id) AS prev_row_hash
    FROM audit_entries
    ORDER BY id DESC
    LIMIT 100
  ) ae
  WHERE ae.previous_hash IS DISTINCT FROM ae.prev_row_hash;

  -- Verify no data beyond the recovery target time
  SELECT max(created_at) AS latest_record FROM audit_entries;""")

# ---------------------------------------------------------------- F-07a V32 tag
P("F07a-v32-tag",
  """-- Extends the existing credential_evidence table (or equivalent attachment table)
-- with quarantine tracking columns""",
  """-- prisma/migrations/V32_upload_quarantine_scan.sql
-- Extends the existing credential_evidence table (or equivalent attachment table)
-- with quarantine tracking columns""")

# ---------------------------------------------------------------- F-07b V35 body
P("F07b-v35",
  """**Implementation — environment configuration:**

```env
# .env.production — PII & search security""",
  """**Implementation — V35 PDPL controls (encryption columns, processing register, data-subject rights):**

```sql
-- prisma/migrations/V35_pdpl_controls.sql
-- Field-level encryption columns, processing register and data-subject rights.
-- Encryption is AES-256-GCM via FieldCryptoService (non-deterministic, so the
-- ciphertext column cannot be searched — blind indexes are added by V37).

ALTER TABLE employees
  ADD COLUMN iqama_ciphertext    BYTEA,
  ADD COLUMN passport_ciphertext BYTEA;

ALTER TABLE credentials
  ADD COLUMN scfhs_reg_ciphertext BYTEA;

-- Processing register: the documented lawful basis per sensitive category
-- (PDPL Art. 4 / SDAIA guidance). The application refuses to store a sensitive
-- field that has no active register row.
CREATE TABLE processing_register (
  id             SERIAL PRIMARY KEY,
  data_category  VARCHAR(50) NOT NULL,   -- 'IQAMA', 'PASSPORT', 'SCFHS_REG', 'IDENTITY_SCAN'
  lawful_basis   VARCHAR(50) NOT NULL,   -- 'EMPLOYMENT_CONTRACT', 'LEGAL_OBLIGATION'
  purpose        TEXT NOT NULL,
  retention_rule TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_processing_register UNIQUE (data_category, lawful_basis)
);

-- Data-subject rights (PDPL Art. 12–14): access, portability, rectification, erasure.
CREATE TABLE data_subject_requests (
  id            BIGSERIAL PRIMARY KEY,
  employee_id   INTEGER REFERENCES employees(id),
  request_type  VARCHAR(20) NOT NULL
    CHECK (request_type IN ('ACCESS', 'PORTABILITY', 'RECTIFICATION', 'ERASURE')),
  status        VARCHAR(20) NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ,
  decided_by    INTEGER REFERENCES accounts(id),
  decision_note TEXT,
  CONSTRAINT chk_decision_consistency
    CHECK ((status IN ('APPROVED', 'REJECTED', 'COMPLETED')) = (decided_at IS NOT NULL))
);

CREATE INDEX idx_dsr_status   ON data_subject_requests(status, requested_at DESC);
CREATE INDEX idx_dsr_employee ON data_subject_requests(employee_id, requested_at DESC);
```

The master encryption key is never stored in the database: it lives in the
hospital's key facility (HSM, KMS or file-based vault) and is referenced by
`PDPL_FIELD_ENCRYPTION_KEY` (below). Key storage strategy is decided with the
hosting decision (Section 13.4.1).

**Implementation — environment configuration:**

```env
# .env.production — PII & search security""")

# ---------------------------------------------------------------- F-07c V37 versions
P("F07c-v37",
  """-- 1. Add blind index columns to employees
ALTER TABLE employees
  ADD COLUMN iqama_blind_index VARCHAR(64),
  ADD COLUMN passport_blind_index VARCHAR(64);

-- 2. Add blind index columns to credentials (tracking_data is JSONB,
-- so we add separate columns for high-frequency search fields)
ALTER TABLE credentials
  ADD COLUMN scfhs_reg_blind_index VARCHAR(64);""",
  """-- 1. Add blind index columns to employees. The *_blind_key_version column
--    records which pepper version produced the digest, so the pepper can be
--    rotated by writing new digests and lazily re-indexing (Section 8.3.4).
ALTER TABLE employees
  ADD COLUMN iqama_blind_index VARCHAR(64),
  ADD COLUMN passport_blind_index VARCHAR(64),
  ADD COLUMN iqama_blind_key_version    SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN passport_blind_key_version SMALLINT NOT NULL DEFAULT 1;

-- 2. Add blind index columns to credentials (tracking_data is JSONB,
-- so we add separate columns for high-frequency search fields)
ALTER TABLE credentials
  ADD COLUMN scfhs_reg_blind_index VARCHAR(64),
  ADD COLUMN scfhs_blind_key_version SMALLINT NOT NULL DEFAULT 1;""")

# ---------------------------------------------------------------- F-08 runbook
P("F08-unit",
  "# Unit tests (61 expected)",
  "# Unit tests (68 expected)")

P("F08-pg",
  "# PostgreSQL workflow tests (16 expected)",
  "# PostgreSQL workflow tests (20 expected)")

P("F08-baseline-col",
  "| Check | Baseline (Node 24 / PG 18.4) | Target (Node 20 / PG 15) | Status |",
  "| Check | Baseline (Node 24 / PostgreSQL 17.11) | Target (Node 20 LTS / PostgreSQL 15) | Status |")

P("F08-step5",
  "**Step 5 — Compare results against baseline:**",
  "**Step 5 — Compare results against baseline.** Every `_Fill after run_` cell must be replaced with the observed value before the report is signed; an unfilled cell means the step was not executed:")

# ---------------------------------------------------------------- F-10 eligibility claims
P("F10-consistency",
  "- **Consistency guarantee** — all state updates occur within the same transaction as the trigger event. For example, approving a contract and updating the eligibility state are committed together.",
  "- **Consistency guarantee** — handlers that mutate contracts, credentials, position schedulability or waivers call `refreshState(tx, …)` **inside** the same transaction, so the state commits with the trigger event. Scheduled transitions (the daily midnight cron) run after commit and are covered by the consistency auditor (Section 10.8), which is why the auditor exists rather than being redundant.\n- **Authoritative source** — the state table is authoritative for pool, roster and dashboard reads. **Publication does not trust the snapshot**: `publishSchedule` re-validates the candidate set against the canonical engine inside the publication transaction (Section 6.2).")

P("F10-refresh-tx",
  """  async refreshState(employeeId: number, eventSource: string): Promise<void> {
    // 1. Run the heavy canonical calculation
    const result = await this.engine.calculate(employeeId, new Date());

    // 2. Update the materialized state table
    await this.prisma.employeeEligibilityState.upsert({""",
  """  async refreshState(
    employeeId: number,
    eventSource: string,
    // Callers inside a business transaction pass their client so the state
    // commits atomically with the trigger event (Section 6.1).
    tx: PrismaTransactionClient = this.prisma,
  ): Promise<void> {
    // 1. Run the heavy canonical calculation
    const result = await this.engine.calculate(employeeId, new Date(), tx);

    // 2. Update the materialized state table on the same client
    await tx.employeeEligibilityState.upsert({""")

P("F10-criterion",
  "| Materialized eligibility | Roster \"Available Nurses\" query returns results in < 50ms regardless of rule complexity; updating a credential status immediately reflects in `employee_eligibility_state`; daily cron refreshes all states without blocking the API; roster publication reads from the state table to prevent \"mid-publish\" eligibility changes |",
  "| Materialized eligibility | Roster \"Available Nurses\" query returns results in < 50ms regardless of rule complexity; updating a credential status immediately reflects in `employee_eligibility_state`; daily cron refreshes all states without blocking the API; roster publication re-validates candidates against the canonical engine inside the publication transaction, while the state table serves pool and dashboard reads |")

# ---------------------------------------------------------------- F-14 auditor null-safety
P("F14-auditor",
  """      const actual = await this.prisma.employeeEligibilityState.findUnique({
        where: { employee_id: emp.id }
      });
      const expected = await this.eligibilityEngine.calculate(emp.id, new Date());

      if (actual.status !== expected.eligibilityType) {""",
  """      const actual = await this.prisma.employeeEligibilityState.findUnique({
        where: { employee_id: emp.id }
      });
      const expected = await this.eligibilityEngine.calculate(emp.id, new Date());

      // A missing state row is itself a drift condition — never dereference it.
      if (!actual) {
        await this.prisma.consistencyAuditLog.create({
          data: {
            employee_id: emp.id,
            expected_status: expected.eligibilityType,
            actual_status: null,
            drift_detected: true,
          }
        });
        await this.eligibilityStateService.refreshState(emp.id, 'CONSISTENCY_AUDIT_MISSING_STATE');
        continue;
      }

      if (actual.status !== expected.eligibilityType) {""")

# ---------------------------------------------------------------- F-12 onboarding function
P("F12-function",
  """    -- Step A: Create the Employee Master
    INSERT INTO employees (name, job_number, unit_id, position, contact_email, created_at)
    VALUES (p_name, p_job_number, p_unit_id, p_position, p_contact_email, now())
    RETURNING id INTO v_employee_id;

    -- Step B: Create the Initial Approved Contract
    -- This physically enforces the \"Contract-First\" rule
    INSERT INTO contracts (employee_id, start_date, end_date, status, created_at)
    VALUES (v_employee_id, p_contract_start, p_contract_end, 'Approved', now());

    -- Step C: Log the Domain Audit Event
    INSERT INTO audit_entries (actor_id, action, resource, resource_id, timestamp)
    VALUES (p_actor_id, 'EMPLOYEE_ONBOARDED', 'employees', v_employee_id, now());

    RETURN v_employee_id;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Onboarding failed: Employee and Contract must be created together.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;""",
  """    -- Only active positions may be assigned (mirrors the WorkforceService check)
    IF NOT EXISTS (
      SELECT 1 FROM position_directory
      WHERE code = p_position AND is_active = true
    ) THEN
      RAISE EXCEPTION 'POSITION_NOT_ACTIVE: %', p_position USING ERRCODE = 'check_violation';
    END IF;

    -- Step A: Create the Employee Master
    INSERT INTO employees (name, job_number, unit_id, position, contact_email, created_at)
    VALUES (p_name, p_job_number, p_unit_id, p_position, p_contact_email, now())
    RETURNING id INTO v_employee_id;

    -- Step B: Create the Initial Approved Contract
    -- This physically enforces the \"Contract-First\" rule
    INSERT INTO contracts (employee_id, start_date, end_date, status, created_at)
    VALUES (v_employee_id, p_contract_start, p_contract_end, 'Approved', now());

    -- Step C: Log the domain audit event through the canonical chained path
    -- (Section 9.1). A direct INSERT would bypass the hash chain.
    PERFORM fn_append_audit_entry(
      p_actor_id,
      'EMPLOYEE_ONBOARDED',
      'employees',
      v_employee_id::text,
      jsonb_build_object('job_number', p_job_number)
    );

    RETURN v_employee_id;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   -- Required on SECURITY DEFINER functions to prevent search_path hijacking.
   SET search_path = pg_catalog, public;

-- Deliberately NO \"EXCEPTION WHEN OTHERS\" handler: it would mask duplicate
-- job-number, foreign-key and permission failures behind one generic message
-- and make support diagnosis impossible. The function is a single statement,
-- so any raised error still rolls the whole call back atomically.""")

# ---------------------------------------------------------------- F-13 four-eyes
P("F13-table",
  """  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT,

  CONSTRAINT uq_admin_request UNIQUE (initiator_id, action_type, created_at)
);""",
  """  approved_at       TIMESTAMPTZ,
  rejection_reason  TEXT
);

-- Prevent a second identical request while one is still pending.
-- (created_at has microsecond precision, so a UNIQUE constraint that includes
-- it would never fire.)
CREATE UNIQUE INDEX uq_admin_request_pending
  ON admin_approval_requests(initiator_id, action_type)
  WHERE status = 'PENDING';""")

P("F13-service",
  """  async approveAction(requestId: number, approverId: number) {
    const request = await this.prisma.adminApprovalRequest.findUnique({
      where: { id: requestId }
    });

    // CRITICAL: Prevent self-approval
    if (request.initiator_id === approverId) {
      throw new ForbiddenException('Self-approval of high-impact actions is forbidden.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Mark as approved
      await tx.adminApprovalRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', approver_id: approverId, approved_at: new Date() }
      });

      // 2. Execute the actual payload change (Logic depends on action_type)
      await this.executeAction(request.action_type, request.request_payload);

      // 3. Finalize as executed
      await tx.adminApprovalRequest.update({
        where: { id: requestId },
        data: { status: 'EXECUTED' }
      });
    });
  }""",
  """  // (imports: NotFoundException, ConflictException, ForbiddenException)
  async approveAction(requestId: number, approverId: number) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the request row so two approvers cannot both proceed
      const rows = await tx.$queryRaw<AdminApprovalRequest[]>`
        SELECT * FROM admin_approval_requests
        WHERE id = ${requestId}
        FOR UPDATE
      `;
      const request = rows[0];
      if (!request) throw new NotFoundException('Approval request not found');

      // 2. Only a PENDING request may be approved (blocks replay/re-approval)
      if (request.status !== 'PENDING') {
        throw new ConflictException(
          `Request ${requestId} is ${request.status} and cannot be approved`,
        );
      }

      // 3. Four-eyes: prevent self-approval
      if (request.initiator_id === approverId) {
        throw new ForbiddenException('Self-approval of high-impact actions is forbidden.');
      }

      // 4. Execute the payload on the SAME transaction client, so a failure
      //    rolls back both the action and the status change.
      await this.executeAction(tx, request.action_type, request.request_payload);

      // 5. Record the terminal state
      return tx.adminApprovalRequest.update({
        where: { id: requestId },
        data: { status: 'EXECUTED', approver_id: approverId, approved_at: new Date() },
      });
    });
  }""")

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

OUT.write_text(text, encoding='utf-8')
print(f"\nAll {len(patches)} patches applied. Wrote {OUT}")
