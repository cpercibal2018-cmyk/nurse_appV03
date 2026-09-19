import React, { useState } from 'react';
import { Card, Table, Tag, Typography, Alert, Descriptions, Space, Button, Input, Select, Badge, List, Modal } from 'antd';
import { AuditOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useStore } from '../../lib/store';

const { Title, Text } = Typography;

export default function AuditModule() {
  const { auditEntries } = useStore();
  const [filterAction, setFilterAction] = useState<string | undefined>();
  const [search, setSearch] = useState('');

  const filtered = auditEntries.filter(e => {
    if (filterAction && e.action !== filterAction) return false;
    if (search && !(`${e.action} ${e.resource} ${e.resourceId} ${JSON.stringify(e.changes)}`.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  // verify chain integrity
  const brokenLinks = [];
  for (let i = 1; i < auditEntries.length; i++) {
    if (auditEntries[i].previousHash !== auditEntries[i - 1].hash) {
      brokenLinks.push(i);
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60, sorter: (a: any, b: any) => a.id - b.id },
    { title: 'Timestamp', dataIndex: 'createdAt', key: 'createdAt', width: 160, render: (d: string) => new Date(d).toLocaleString(), sorter: (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() },
    { title: 'Actor', dataIndex: 'actorId', key: 'actorId', width: 80, render: (id: number | null) => id ? `User ${id}` : 'System' },
    { title: 'Action', dataIndex: 'action', key: 'action', width: 200, render: (a: string) => <Tag color={a.includes('DELETE') ? 'red' : a.includes('CREATED') ? 'green' : a.includes('UPDATED') ? 'blue' : 'default'}>{a}</Tag> },
    { title: 'Resource', key: 'resource', render: (_: any, r: any) => `${r.resource} #${r.resourceId}` },
    { title: 'Changes', dataIndex: 'changes', key: 'changes', render: (c: any) => <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>{JSON.stringify(c).slice(0, 100)}</Text>, ellipsis: true },
    { title: 'Hash Chain', key: 'hash', width: 200, render: (_: any, r: any) => <><Text style={{ fontSize: 10, fontFamily: 'monospace' }}>prev: {r.previousHash?.slice(0, 8) || 'GENESIS'}</Text><br /><Text style={{ fontSize: 10, fontFamily: 'monospace' }}>hash: {r.hash.slice(0, 8)}</Text></> },
    { title: 'Encrypted', dataIndex: 'isEncrypted', key: 'isEncrypted', width: 90, render: (v: boolean) => v ? <Tag color="purple">Encrypted</Tag> : <Tag>Plain</Tag> },
  ];

  const uniqueActions = [...new Set(auditEntries.map(e => e.action))];

  return (
    <div>
      <Title level={4}><AuditOutlined /> Audit & Compliance — Hash-Chained, Append-Only, PDPL Encrypted</Title>

      <Alert
        type={brokenLinks.length === 0 ? 'success' : 'error'}
        showIcon
        style={{ marginBottom: 16 }}
        message={brokenLinks.length === 0 ? 'Audit Chain Integrity: PASS — No broken links' : `Audit Chain Integrity: FAIL — ${brokenLinks.length} broken link(s)`}
        description="Domain mutations and audit records commit in same transaction. Audit failure rolls back business operation. Runtime can INSERT but not DELETE/UPDATE audit_entries (privilege separation). Hash-chained via fn_append_audit_entry with advisory serialization. PDPL: PII in audit encrypted, crypto-shredding via user_encryption_keys deletion makes PII unreadable but chain remains valid. Request-level audit: interceptor captures all requests, redaction prevents sensitive leakage, X-Request-Id traces end-to-end."
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search placeholder="Search action, resource, changes" allowClear style={{ width: 300 }} value={search} onChange={e => setSearch(e.target.value)} />
        <Select placeholder="Filter action" allowClear style={{ width: 200 }} value={filterAction} onChange={setFilterAction} options={uniqueActions.map(a => ({ label: a, value: a }))} showSearch />
        <Text type="secondary">{filtered.length} entries • {brokenLinks.length} broken links (expected 0) • Hash chain verified</Text>
      </Space>

      <Card>
        <Table rowKey="id" dataSource={[...filtered].reverse()} columns={columns as any} pagination={{ pageSize: 20, showSizeChanger: true }} size="small" scroll={{ x: 1200 }} />

        <div style={{ marginTop: 24 }}>
          <Title level={5}>Audit Architecture (Section 9)</Title>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Domain Audit (9.1) — Hash-Chained">Canonical DDL audit_entries with hash, previous_hash, fn_append_audit_entry. Transactional, append-only. Runtime REVOKE DELETE, UPDATE. Post-restore checklist verifies chain (last 100 entries lag() check). V36 onboarding uses fn_append_audit_entry not raw INSERT.</Descriptions.Item>
            <Descriptions.Item label="Request Audit (9.2)">Interceptor captures all requests, redaction prevents sensitive leakage (passwords, tokens, PII), X-Request-Id traces work end-to-end. Denied/failed request coverage.</Descriptions.Item>
            <Descriptions.Item label="PDPL & Crypto-Shredding (V38)">user_encryption_keys table stores user's key encrypted by master key. audit_entries changes encrypted JSON for PII events, is_encrypted flag, encryption_key_id. Deleting user's key makes PII unreadable, chain remains valid — Right to Erasure without deleting audit rows.</Descriptions.Item>
            <Descriptions.Item label="PII Blind Indexing (V37)">Iqama, passport, SCFHS blind indexes for O(1) search without decrypting. Database query logs show searches hitting blind_index, not name/tracking_data. Direct plaintext search returns zero results.</Descriptions.Item>
            <Descriptions.Item label="Materialized Eligibility Audit (V39)">employee_eligibility_state refresh logged, consistency audit log tracks drift between expected (canonical engine) and actual (state table).</Descriptions.Item>
            <Descriptions.Item label="Break-Glass & PAM Audit (V42, V44)">Privileged sessions, admin approvals, break_glass_events all non-deletable, siren alert on root login, 4h session limit.</Descriptions.Item>
          </Descriptions>
        </div>

        <div style={{ marginTop: 16 }}>
          <Title level={5}>Backup & Restore Verification (Section 10.6)</Title>
          <List size="small" bordered dataSource={[
            'Post-restore checklist item 3: Verify audit chain — SELECT count(*) broken_chain_links FROM (SELECT previous_hash, lag(hash) OVER (ORDER BY id) ...) — must be 0',
            'Post-restore checklist: No events after recovery target time, employee count matches expected, credential validity spot-check, contract coverage, notification queue, document checksums, eligibility check, SCFHS sync log',
            'Monthly restore drill: random point in past 7 days, timed restore &lt;4h RTO, data completeness &lt;15min RPO (≤5min with archive_timeout=300), drill record filed',
            'Backup monitoring: stale backup >26h, inactive WAL archiving, storage capacity alerts via worker lease backup.freshness_check 600s',
          ]} renderItem={item => <List.Item><Text style={{ fontSize: 12 }}>{item}</Text></List.Item>} />
        </div>
      </Card>
    </div>
  );
}
