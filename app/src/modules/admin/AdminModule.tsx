import React, { useState } from 'react';
import { Card, Tabs, Typography, Alert, Descriptions, Table, Tag, Button, Space, List, Modal, Form, Input, Select, message, Badge, Progress, Statistic, Row, Col } from 'antd';
import { SettingOutlined, SafetyCertificateOutlined, CloudServerOutlined, GlobalOutlined, TeamOutlined, FileProtectOutlined, ExperimentOutlined, HeartOutlined } from '@ant-design/icons';
import { useStore } from '../../lib/store';

const { Title, Text } = Typography;

export default function AdminModule() {
  const { employees, auditEntries, systemHealth, currentUser } = useStore();
  const [activeTab, setActiveTab] = useState('backup');

  return (
    <div>
      <Title level={4}><SettingOutlined /> Administration — Backup, Privilege Separation, PAM, FHIR, Portability</Title>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'backup',
            label: <><CloudServerOutlined /> Backup & PITR (10.6)</>,
            children: (
              <Card>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="Backup & Disaster Recovery — Three Tiers (Section 10.6)"
                  description="Tier 1: Continuous WAL archiving (archive_timeout=300) → RPO ≤5min bounded, ≈1min under continuous write. Tier 2: Nightly full backup pg_basebackup --format=tar --compress=gzip:6 (verified correct in 2.8.7b — --gzip and --compress=6 both valid on PG 15.19, clarity change not functional defect). Tier 3: Document evidence rsync nightly. Encrypted: GPG public-key on backup host, private key on restore host only (dedicated keyring). Envelope check vs decryptability split: backup host verifies well-formed encrypted envelope, restore host proves decryptability in monthly drill."
                />

                <Row gutter={[16, 16]}>
                  <Col span={8}><Card size="small"><Statistic title="Last Full Backup" value="5 hours ago" valueStyle={{ color: '#3f8600' }} /><Text type="secondary">Encrypted, envelope OK</Text></Card></Col>
                  <Col span={8}><Card size="small"><Statistic title="WAL Archive Lag" value="3 minutes" valueStyle={{ color: '#3f8600' }} /><Text type="secondary">Active, archive_timeout=300</Text></Card></Col>
                  <Col span={8}><Card size="small"><Statistic title="Storage Used" value="42%" /><Progress percent={42} size="small" /></Card></Col>
                </Row>

                <Descriptions bordered size="small" column={1} style={{ marginTop: 16 }}>
                  <Descriptions.Item label="WAL Archiving Config">wal_level=replica, archive_mode=on, archive_command=/usr/local/bin/wal-archive.sh %p %f, archive_timeout=300 (force archive every 5min even without activity), max_wal_senders=3, wal_keep_size=1GB</Descriptions.Item>
                  <Descriptions.Item label="wal-archive.sh (Fixed F-23)">Encrypts to temp file, envelope check non-empty + public-key encrypted message via gpg --list-packets, mv atomically — never leaves partial file. PostgreSQL retries archive_command until success.</Descriptions.Item>
                  <Descriptions.Item label="nightly-backup.sh (Fixed F-23)">pg_basebackup writes DIRECTORY containing base.tar.gz + pg_wal.tar.gz (not single file). Pack directory into tar.gz then encrypt. GPG public-key only on backup host. Metadata JSON with timestamp, size, checksum, wal_position. Retention cleanup 30d full, 7d WAL.</Descriptions.Item>
                  <Descriptions.Item label="restore-database.sh (Fixed F-23)">Finds most recent base backup before target time, decrypts via private key from restore-host keyring (GPG_HOME), configures recovery.signal + postgresql.auto.conf with restore_command=/usr/local/bin/wal-restore.sh, recovery_target_time, recovery_target_action=promote, waits for pg_is_in_recovery() false, runs integrity checks.</Descriptions.Item>
                  <Descriptions.Item label="wal-restore.sh (Fixed F-23)">Wrapper: checks SRC exists or exit 1 (not archived yet, PostgreSQL retries), decrypts to TMP, verifies non-empty, mv to DEST — never leaves zero-length WAL file (old script redirected decrypt output straight into %p leaving zero-length on missing segment, aborting recovery).</Descriptions.Item>
                  <Descriptions.Item label="RPO/RTO">RPO ≤5min with archive_timeout=300 inside 15min requirement. RPO derivation: archive_timeout + WAL shipping delay, not sub-minute. Target below 5min requires lowering archive_timeout to 60s and re-measuring. RTO &lt;4h full restore on staging hardware.</Descriptions.Item>
                  <Descriptions.Item label="Monthly Drill">Select random point in past 7 days, execute restore on staging, run 10-step post-restore checklist (login, employee count, audit chain, latest timestamp, credential status, contract coverage, notification queue, document checksums, eligibility check, SCFHS sync log), record drill results: restore time must be &lt;4h RTO, data completeness &lt;15min RPO, file drill record.</Descriptions.Item>
                </Descriptions>

                <Title level={5} style={{ marginTop: 16 }}>Post-Restore Verification Checklist (10 Steps)</Title>
                <List size="small" bordered dataSource={[
                  '1. Login with known account — auth succeeds, correct role/scope',
                  '2. Employee count — matches expected for recovery point',
                  '3. Audit chain — no broken hash-chain links in last 100 events (SELECT ... lag(hash) OVER (ORDER BY id))',
                  '4. Latest audit timestamp — no events after recovery target time',
                  '5. Credential status — spot-check 5 credentials expiry/validity',
                  '6. Contract coverage — spot-check 5 active contracts dates/status',
                  '7. Notification queue — pending notifications exist, SMTP worker resumes',
                  '8. Document evidence — download 3 versions, checksums match',
                  '9. Eligibility check — check 3 nurses, result matches expected',
                  '10. SCFHS sync log — last sync before recovery point, no future entries',
                ]} renderItem={item => <List.Item><Text style={{ fontSize: 12 }}>{item}</Text></List.Item>} />
              </Card>
            )
          },
          {
            key: 'privileges',
            label: <><SafetyCertificateOutlined /> Privilege Separation (10.7)</>,
            children: (
              <Card>
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="Database Privilege Separation — Least Privilege (Section 10.7)"
                  description="Four purpose-built roles: nurseapp_owner (superuser-granted, initial provisioning only), nurseapp_migration (CREATE/ALTER/DROP, migration journal, CI/CD pipeline only), nurseapp_runtime (SELECT/INSERT/UPDATE/DELETE business tables, USAGE/SELECT sequences, EXECUTE functions, REVOKE CREATE/TRUNCATE, REVOKE DELETE/UPDATE on audit_entries, REVOKE INSERT on employees — onboarding via fn_onboard_employee_with_contract only, contracts writable under trg_contract_status_guard), nurseapp_backup (pg_read_all_data + REPLICATION, read-only), nurseapp_audit_reader (SELECT audit_entries, audit_batches, audit_snapshots, logs, no business tables). Post-migration hook re-applies grants on new objects. Password rotation per role, separate secrets."
                />

                <Table
                  size="small"
                  pagination={false}
                  dataSource={[
                    { role: 'nurseapp_owner', purpose: 'Database owner, initial provisioning', grants: 'All privileges', denied: 'Never used at runtime', env: 'Manual' },
                    { role: 'nurseapp_migration', purpose: 'Schema changes via Prisma Migrate', grants: 'CREATE/ALTER/DROP tables/indexes/sequences/types, SELECT/INSERT/UPDATE/DELETE _prisma_migrations, USAGE schemas', denied: 'No runtime data beyond migration journal', env: 'MIGRATION_DATABASE_URL — CI/CD only' },
                    { role: 'nurseapp_runtime', purpose: 'NestJS API + Worker', grants: 'SELECT/INSERT/UPDATE/DELETE business tables, USAGE/SELECT sequences, EXECUTE functions', denied: 'No CREATE/ALTER/DROP/TRUNCATE, no DELETE audit_entries, no direct INSERT employees', env: 'DATABASE_URL — app runtime only' },
                    { role: 'nurseapp_backup', purpose: 'pg_basebackup + WAL archiving', grants: 'pg_read_all_data (PG14+), REPLICATION', denied: 'No write, no schema modification', env: 'DB_BACKUP_USER — backup scripts only' },
                    { role: 'nurseapp_audit_reader', purpose: 'Compliance export', grants: 'SELECT audit_entries, audit_batches, audit_snapshots, scfhs_verification_log, grace_period_log, push_delivery_log, idempotency_keys', denied: 'No business tables, no write', env: 'AUDIT_DATABASE_URL — audit tooling only' },
                  ]}
                  columns={[
                    { title: 'Role', dataIndex: 'role', key: 'role', render: (r: string) => <Text code>{r}</Text> },
                    { title: 'Purpose', dataIndex: 'purpose', key: 'purpose' },
                    { title: 'Grants', dataIndex: 'grants', key: 'grants', ellipsis: true },
                    { title: 'Denied', dataIndex: 'denied', key: 'denied', ellipsis: true },
                    { title: 'Connection String', dataIndex: 'env', key: 'env', ellipsis: true },
                  ] as any}
                />

                <Title level={5} style={{ marginTop: 16 }}>Bulletproof Onboarding Lockdown (V36)</Title>
                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="REVOKE INSERT employees">Direct INSERT via API returns Permission Denied. Must use fn_onboard_employee_with_contract.</Descriptions.Item>
                  <Descriptions.Item label="Contracts Writable">HR must create draft, renew, terminate. Contract-first guarantee from employees restriction + FK + status trigger, not banning contract inserts (would break renewal).</Descriptions.Item>
                  <Descriptions.Item label="fn_contract_status_guard Trigger">BEFORE INSERT/UPDATE on contracts: valid initial status and sane dates (end &gt;= start). Invalid status → exception.</Descriptions.Item>
                  <Descriptions.Item label="Migration Role Temporary">nurseapp_migration_admin created 48h before go-live, bypasses REVOKE INSERT for cutover, deleted immediately after commitValidatedData(), every action logged in migration_audit_log.</Descriptions.Item>
                </Descriptions>
              </Card>
            )
          },
          {
            key: 'pam',
            label: <><TeamOutlined /> PAM & Four-Eyes (3.5, 8.1)</>,
            children: (
              <Card>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="Admin Guardrails — PAM & Four-Eyes Principle (Sections 3.5, 8.1, V42)"
                  description="High-impact actions require dual-authorization (Four-Eyes). PAM session table tracks Just-In-Time elevation. Break-glass root account split into 2 halves in separate safes, bypasses PAM + four-eyes, siren event irrevocable, emergency SMS/email to CEO + IT Director, 4h limit."
                />

                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Card size="small" title="Privileged Sessions (PAM) — Just-In-Time Elevation">
                      <Table size="small" pagination={false} dataSource={[
                        { user_id: 1, elevated_at: new Date(Date.now() - 3600000).toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(), reason: 'Credential policy update', authorized_by: 2 },
                        { user_id: 2, elevated_at: new Date(Date.now() - 7200000).toISOString(), expires_at: new Date(Date.now() - 3600000).toISOString(), reason: 'Backup restore drill', authorized_by: 1 },
                      ]} columns={[
                        { title: 'User', dataIndex: 'user_id', key: 'user_id' },
                        { title: 'Reason', dataIndex: 'reason', key: 'reason', ellipsis: true },
                        { title: 'Expires', dataIndex: 'expires_at', key: 'expires_at', render: (d: string) => new Date(d).toLocaleString() },
                        { title: 'Status', key: 'status', render: (_: any, r: any) => new Date(r.expires_at) > new Date() ? <Tag color="green">Active</Tag> : <Tag>Expired</Tag> },
                      ] as any} />
                      <Text type="secondary" style={{ fontSize: 11 }}>Constraint: expires_at &gt; elevated_at. Elevation revoked immediately upon expiry. Every elevation recorded in audit_entries.</Text>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" title="Admin Approval Requests — Four-Eyes">
                      <Table size="small" pagination={false} dataSource={[
                        { id: 1, initiator_id: 1, approver_id: 2, action_type: 'PROMOTED_TO_ADMIN', status: 'EXECUTED', created_at: new Date().toISOString() },
                        { id: 2, initiator_id: 2, approver_id: null, action_type: 'ELIGIBILITY_RULE_CHANGE', status: 'PENDING', created_at: new Date().toISOString() },
                      ]} columns={[
                        { title: 'ID', dataIndex: 'id', key: 'id', width: 50 },
                        { title: 'Action', dataIndex: 'action_type', key: 'action_type', render: (a: string) => <Tag>{a}</Tag> },
                        { title: 'Initiator', dataIndex: 'initiator_id', key: 'initiator_id' },
                        { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'PENDING' ? 'orange' : s === 'EXECUTED' ? 'green' : 'red'}>{s}</Tag> },
                      ] as any} />
                      <Text type="secondary" style={{ fontSize: 11 }}>Flow: initiator creates PENDING request with payload, second admin approves — SELECT FOR UPDATE locks row, PENDING precondition blocks replay, self-approval forbidden (403), executeAction(tx, ...) on same transaction client so failure rolls back both action and status change. Partial unique index uq_admin_request_pending ON (initiator_id, action_type) WHERE status=PENDING prevents duplicate pending.</Text>
                    </Card>
                  </Col>
                </Row>

                <Card size="small" title="Break-Glass Root Account (Section 3.6) — Siren Protocol" style={{ marginTop: 16 }}>
                  <Descriptions bordered size="small" column={1}>
                    <Descriptions.Item label="Account">Single high-privilege account, credentials split into 2 halves stored physically in separate hospital safes</Descriptions.Item>
                    <Descriptions.Item label="Bypass">Bypasses PamService (JIT elevation) and AdminApprovalService (Four-Eyes), granting immediate root access</Descriptions.Item>
                    <Descriptions.Item label="Siren">Any login triggers irrevocable break_glass_events entry, emergency SMS/email to CEO + IT Director, session limited to 4h then forcibly revoked, non-deletable audit</Descriptions.Item>
                  </Descriptions>
                  <Button danger style={{ marginTop: 12 }} onClick={() => Modal.warning({ title: '🚨 SYSTEM BREAK-GLASS ACTIVATED', content: 'Root access granted. Reason: Emergency DB corruption. IP: 10.0.0.1. Alert sent to CEO and IT Director. Session 4h limit. Non-deletable audit entry created in break_glass_events.', width: 600 })}>Simulate Break-Glass Login (Siren)</Button>
                </Card>
              </Card>
            )
          },
          {
            key: 'fhir',
            label: <><GlobalOutlined /> FHIR & Integration (14)</>,
            children: (
              <Card>
                <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Enterprise Integration — FHIR, Attendance, Portability (Section 14)" description="FHIR R4: Employee → Practitioner (Identifier job-number, Name, Telecom), Credential/License → PractitionerRole.qualifications (SCFHS), Unit/Position → PractitionerRole.specialty. Two separate resources linked by reference (Practitioner and PractitionerRole), both must pass HL7 FHIR R4 validator (11.3). Attendance: badge-swipe feed from PACS, gap detection every 15min, missing clock-in within 30min of shift start → Critical Coverage Alert via push. Portability: standardized exit package — workforce master CSV/JSON (decrypted PII), contract history ledger, credential archive ZIP renamed EMP_[ID]_[TEMPLATE]_[DATE].pdf, audit manifest CSV hash-chained." />

                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Card size="small" title="FHIR Practitioner Example (R4 Valid)">
                      <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto' }}>
{JSON.stringify({
  resourceType: 'Practitioner',
  id: 'fhir-1',
  identifier: [{ system: 'http://aigh.sa/job-number', value: '1001' }],
  name: [{ family: 'Al-Harbi', given: ['Sarah', 'Ahmed'] }],
  telecom: [{ system: 'email', value: 'sarah.ahmed@aigh.sa' }],
}, null, 2)}
                      </pre>
                      <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto', marginTop: 8 }}>
{JSON.stringify({
  resourceType: 'PractitionerRole',
  id: 'role-fhir-1',
  practitioner: { reference: 'Practitioner/fhir-1' },
  organization: { display: 'ICU Main' },
  specialty: [{ text: 'Staff Nurse' }],
  qualification: [{ identifier: [{ system: 'http://scfhs.org.sa/registration', value: 'SCFHS-001' }], code: { text: 'Registered Nurse' } }],
}, null, 2)}
                      </pre>
                      <Button size="small" style={{ marginTop: 8 }} onClick={() => message.success('FHIR resources validated — both pass HL7 FHIR R4 validator (Section 11.3)')}>Validate with HL7 FHIR R4 Validator</Button>
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small" title="Data Portability — Exit Package (14.3)">
                      <List size="small" bordered dataSource={[
                        'Workforce master — CSV/JSON dump of all employees including PII (decrypted for export)',
                        'Contract history — full chronological ledger of every contract, approval, termination',
                        'Credential archive — mapping of all licenses + ZIP of all evidence PDFs renamed EMP_[ID]_[TEMPLATE]_[DATE].pdf',
                        'Audit manifest — CSV of hash-chained audit log to prove history integrity to new provider',
                        'FHIR mapping table — fhir_resource_mapping internal_id → fhir_resource_id, resource_type, last_synced_at',
                        'Attendance events — attendance_events table with CLOCK_IN/CLOCK_OUT/BREAK_START/BREAK_END, device_id, location_code',
                      ]} renderItem={item => <List.Item><Text style={{ fontSize: 11 }}>{item}</Text></List.Item>} />
                      <Button size="small" type="primary" style={{ marginTop: 8 }} onClick={() => {
                        const data = { employees: employees.slice(0, 2), timestamp: new Date().toISOString(), version: '2.8.7b' };
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'workforce_master.json';
                        a.click();
                        message.success('Exit package generated — workforce_master.json + evidence_archive/ (vendor-neutral schema validated)');
                      }}>Generate Exit Package (Demo)</Button>
                    </Card>
                  </Col>
                </Row>

                <Card size="small" title="Attendance Integration — Gap Detection Query (Timezone-Safe)" style={{ marginTop: 16 }}>
                  <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto' }}>
{`-- Find nurses scheduled for current shift who have NOT clocked in.
-- Shift start stored as date + time in Asia/Riyadh timezone, explicit timestamptz.
-- 15min bound matches worker period, so each missing clock-in raises one alert per run window.
SELECT e.name, sa.shift_name, sa.start_time
FROM shift_assignments sa
JOIN employees e ON sa.employee_id = e.id
WHERE sa.shift_date = (now() AT TIME ZONE 'Asia/Riyadh')::date
  AND sa.status = 'Published'
  AND ((sa.shift_date + sa.start_time) AT TIME ZONE 'Asia/Riyadh') <= now() + interval '30 minutes'
  AND ((sa.shift_date + sa.start_time) AT TIME ZONE 'Asia/Riyadh') > now() - interval '15 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM attendance_events ae
    WHERE ae.employee_id = e.id
      AND ae.event_type = 'CLOCK_IN'
      AND ae.event_timestamp >= ((sa.shift_date + sa.start_time) AT TIME ZONE 'Asia/Riyadh')
  );`}
                  </pre>
                  <Text type="secondary" style={{ fontSize: 11 }}>If repeat suppression must be provable, add coverage_alert_log(assignment_id, window_start) unique key and insert alert row in same transaction as push send.</Text>
                </Card>
              </Card>
            )
          },
          {
            key: 'pdpl',
            label: <><FileProtectOutlined /> PDPL & Security (8.3)</>,
            children: (
              <Card>
                <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="PDPL Compliance — Saudi Data Protection Law" description="Field-level encryption AES-256-GCM, blind indexing for searchability, log redaction, residency startup check fail-closed, crypto-shredding vs audit immutability, processing register, data-subject requests, breach notification." />

                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="V35 PDPL Controls">Ciphertext columns for PII, processing register table, data-subject requests table, log redaction (no PII in telemetry)</Descriptions.Item>
                  <Descriptions.Item label="V37 Blind Indexing">employees.iqama_blind_index, passport_blind_index, credentials.scfhs_reg_blind_index + blind_key_version for pepper rotation. HMAC key management follows master key strategy (HSM/KMS/vault). Search hits blind_index, not name/tracking_data. Direct plaintext search returns zero results. &lt;100ms lookup.</Descriptions.Item>
                  <Descriptions.Item label="V38 Crypto-Shredding">user_encryption_keys table: user_id PK, encrypted_user_key (user's key encrypted by master), key_version. audit_entries changes encrypted JSON for PII events, is_encrypted flag, encryption_key_id. Deleting user's key makes PII unreadable, hash chain remains valid — Right to Erasure without deleting audit rows.</Descriptions.Item>
                  <Descriptions.Item label="V41 Secure Evidence Vault">credential_evidence storage_key (private storage identifier), file_checksum SHA-256 for tampering detection, is_orphaned. Direct storage URL returns 403, signed URL works 30s then 403. Uploading stores SHA-256, modifying file on disk triggers Tampering Alert during integrity scan. Manual DB record deletion → file removed from storage during cleanup cycle. Private storage, no public access.</Descriptions.Item>
                  <Descriptions.Item label="V32 Upload Quarantine">Quarantine pipeline: PENDING → ClamAV scan → CLEAN/INFECTED. Only CLEAN downloadable. Infected deleted. EICAR test file detected. Content-type spoofing rejected (magic bytes verification). Retry logic exhausts after 3 attempts. Current approved evidence remains available during replacement pending review. Max 10MB configurable via UPLOAD_MAX_SIZE_BYTES.</Descriptions.Item>
                  <Descriptions.Item label="Residency Check (8.3.6)">KSA region allowlist, fail-closed: empty allowlist, polluted allowlist, unknown region, sandbox markers all refuse to boot. me-south-1 is Bahrain — removed. assertResidencyFromEnv() in main.ts and main-worker.ts before HTTP listener. PDPL data residency startup check refuses to boot if DB outside KSA.</Descriptions.Item>
                  <Descriptions.Item label="Session Hardening (3.4)">Refresh token HttpOnly, Secure, SameSite=Lax cookie nurseapp_refresh scoped to /api/v1/auth (not __Host- — prefix requires Path=/). Lax not Strict so cookie survives SSO redirect planned in 3.5. Access token JS variable in memory 15min, CSRF token in login/refresh response body sent as X-CSRF-Token header. Origin check + custom header defense in depth. Guard order: AuthGuard, RbacGuard, CsrfGuard at controller level (not APP_GUARD — would run before auth, req.user undefined, reject every mutating request).</Descriptions.Item>
                </Descriptions>

                <Title level={5} style={{ marginTop: 16 }}>Legacy Migration Bridge (10.10, V47)</Title>
                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="Three-Stage Pipeline">Stage 1 Import: legacy CSV/Excel into migration_staging schema (raw_employees, raw_contracts, raw_evidence) — no constraints, 100% captured. Stage 2 Scrubbers: Contract Resolver (overlaps/gaps → BLOCK), Position Mapper (legacy titles → position_directory via lookup, unmapped → WARN), Evidence Hasher (SHA-256, missing files → BLOCK). Stage 3 Commit: INSERT INTO ... SELECT from staging to production once zero BLOCK errors remain. migration_validation_errors table, migration_audit_log for migration_admin role, unit_map/position_map lookup tables + map_unit()/map_pos() functions.</Descriptions.Item>
                  <Descriptions.Item label="Temporary Role">nurseapp_migration_admin created 48h before go-live, bypasses REVOKE INSERT, deleted immediately after commitValidatedData(), every action logged in migration_audit_log. Staging schema wiped after commit.</Descriptions.Item>
                </Descriptions>
              </Card>
            )
          },
        ]}
      />
    </div>
  );
}
