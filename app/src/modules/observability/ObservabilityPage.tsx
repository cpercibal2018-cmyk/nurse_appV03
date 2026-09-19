import React from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Typography, Alert, Descriptions, Progress, List, Badge, Space } from 'antd';
import { HeartOutlined, ExperimentOutlined, CloudServerOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useStore } from '../../lib/store';

const { Title, Text } = Typography;

export default function ObservabilityPage() {
  const { systemHealth, eligibilityStates, auditEntries } = useStore();

  const driftRate = 0.2;
  const businessHealth = {
    overall: systemHealth.some(m => m.status === 'CRITICAL') ? 'CRITICAL' : 'HEALTHY',
    vitals: systemHealth,
    weeklyDrift: 1,
  };

  return (
    <div>
      <Title level={4}><HeartOutlined /> Deep Observability & Business Health (Section 10.8) + Operational Survivability (10.9)</Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Business Health Framework — Vital Signs, Not Hardware Metrics"
        description="Consistency Auditor (anti-drift): samples 1% workforce daily, runs check_nurse_eligibility vs employee_eligibility_state, logs consistency_audit_log, triggers refreshState, updates eligibility_drift_rate metric. Vital sign monitoring: SCFHS sync freshness, PAM-audit gap, storage integrity (SHA-256 weekly), backup verification age. Business health API: /api/v1/system/health/business returns JSON report for Hospital IT dashboard."
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="System Health Metrics (V43)">
            <List
              dataSource={systemHealth}
              renderItem={item => (
                <List.Item>
                  <List.Item.Meta
                    title={<Space><Badge status={item.status === 'HEALTHY' ? 'success' : item.status === 'WARNING' ? 'warning' : 'error'} />{item.metric}</Space>}
                    description={`${item.value} — ${new Date(item.lastUpdated).toLocaleString()}`}
                  />
                  <Tag color={item.status === 'HEALTHY' ? 'green' : item.status === 'WARNING' ? 'orange' : 'red'}>{item.status}</Tag>
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Consistency Auditor (V39 Drift Detection)">
            <Statistic title="Weekly Drift Count" value={businessHealth.weeklyDrift} suffix="/ sampled" />
            <Progress percent={driftRate} size="small" format={p => `${p}% drift`} style={{ marginTop: 8 }} />
            <Descriptions bordered size="small" column={1} style={{ marginTop: 16 }}>
              <Descriptions.Item label="Sample">1% workforce daily @ 03:00</Descriptions.Item>
              <Descriptions.Item label="Action on Drift">Log consistency_audit_log, refreshState(), update metric</Descriptions.Item>
              <Descriptions.Item label="Missing State Row">Logged as drift, refreshed, never dereferenced (B-13 null-safe)</Descriptions.Item>
            </Descriptions>
            <Alert type="warning" showIcon style={{ marginTop: 12 }} message="Simulate Drift" description="Manually change employee_eligibility_state via SQL — auditor detects and corrects within 24h (acceptance criteria)" />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Operational Survivability — Shadow Mode (10.9)">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Shadow Mode">New eligibility logic deployed as SHADOW, parallel execution active vs candidate, discrepancy logged in eligibility_shadow_log, promotion after 7d zero discrepancies or HR approval</Descriptions.Item>
              <Descriptions.Item label="Break-Glass (3.6)">Root account split into 2 halves in separate safes, bypasses PAM + four-eyes, siren event: irrevocable break_glass_events entry, emergency SMS/email to CEO + IT Director, 4h session limit, auto-revoked</Descriptions.Item>
              <Descriptions.Item label="API Versioning">/api/v1 current, /api/v2 new logic, sunset after 90d or all clients migrated. /api/v1 remains functional after /api/v2 deployed.</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Card title="Business Health API — /api/v1/system/health/business" style={{ marginTop: 16 }}>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto' }}>
{JSON.stringify({
  overall_status: businessHealth.overall,
  vitals: systemHealth.map(m => ({ metric: m.metric, value: m.value, status: m.status, last_updated: m.lastUpdated })),
  weekly_drift_count: businessHealth.weeklyDrift,
  timestamp: new Date().toISOString(),
  checks: {
    scfhs_sync: 'HEALTHY - last sync 2h ago, circuit breaker closed',
    eligibility_drift: 'HEALTHY - 0.2% drift rate, within threshold',
    backup_freshness: 'HEALTHY - last backup 5h ago, WAL lag 3min',
    pam_elevations: 'HEALTHY - 2 active privileged sessions',
    storage_integrity: 'HEALTHY - 100% evidence files passed SHA-256 weekly check',
  }
}, null, 2)}
        </pre>
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="Worker Leases V49 — 7 Jobs (Section 10.3)">
            <Table
              size="small"
              pagination={false}
              dataSource={[
                { job: 'notifications.daily_scan', lease: '900s', desc: 'Contract 90d + credential 60d + grace expiry, 06:00 Asia/Riyadh', status: 'HEALTHY' },
                { job: 'notifications.smtp_queue', lease: '120s', desc: 'SMTP delivery every 60s, Nodemailer', status: 'HEALTHY' },
                { job: 'scfhs.nightly_sync', lease: '1800s', desc: 'SCFHS verification nightly, mTLS, circuit breaker', status: 'HEALTHY' },
                { job: 'credentials.grace_expiry', lease: '600s', desc: 'Close expired grace windows, trigger revalidation', status: 'HEALTHY' },
                { job: 'idempotency.cleanup', lease: '300s', desc: 'Reap expired keys + lapsed leases', status: 'HEALTHY' },
                { job: 'backup.freshness_check', lease: '600s', desc: 'Stale backup >26h, WAL inactive, storage alerts', status: 'HEALTHY' },
                { job: 'quarantine.scan', lease: '300s', desc: 'ClamAV scan PENDING→CLEAN/INFECTED', status: 'HEALTHY' },
              ]}
              columns={[
                { title: 'Job Name', dataIndex: 'job', key: 'job', render: (j: string) => <Text code style={{ fontSize: 11 }}>{j}</Text> },
                { title: 'Lease', dataIndex: 'lease', key: 'lease', width: 80 },
                { title: 'Description', dataIndex: 'desc', key: 'desc' },
                { title: 'Status', dataIndex: 'status', key: 'status', width: 90, render: (s: string) => <Tag color="green">{s}</Tag> },
              ] as any}
            />
            <Alert type="info" showIcon style={{ marginTop: 12 }} message="V49 Semantics" description="Exactly one holder per job_name. Holder renews by heartbeat at 1/3 lease duration. If process dies, lease expires and next run takes over (bounded recovery). withLease returns false when another live worker holds lease — skip cycle, next catches up via window-based queries. Replaces unsafe pg_try_advisory_lock behind connection pool." />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Idempotency Lease Semantics (Section 9.5)">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Guard">Idempotency-Key header required on onboarding, invitation, publication, bulk endpoints. 400 if missing. 409 only while lease live. Lapsed lease retaken, not blocked.</Descriptions.Item>
              <Descriptions.Item label="Interceptor">Key row committed with business mutation in same transaction. Replay payload contains identifiers only, never full response bodies (PDPL).</Descriptions.Item>
              <Descriptions.Item label="Cleanup Worker">Daily @ 03:00 via lease, reaps expired keys + lapsed leases (processingLeaseExpiresAt).</Descriptions.Item>
              <Descriptions.Item label="Lease">Processing lease prevents crashed request blocking key for 24h. Stored replay = identifiers only.</Descriptions.Item>
            </Descriptions>

            <Title level={5} style={{ marginTop: 16 }}>Residency Check (B-25 — Fail-Closed KSA)</Title>
            <Alert type="warning" showIcon message="Fail-Closed KSA Region Allowlist" description="Empty allowlist, polluted allowlist, unknown region, sandbox markers all refuse to boot. me-south-1 is Bahrain — removed from KSA allowlist. Startup check assertResidencyFromEnv() in main.ts and main-worker.ts before HTTP listener. PDPL data residency: refuses to boot if DB outside KSA." />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
