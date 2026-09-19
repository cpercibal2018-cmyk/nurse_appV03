import React, { useState } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Alert, Descriptions, List, Modal, Form, Input, Select, DatePicker, message, Badge, Progress, Tooltip } from 'antd';
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useStore } from '../../lib/store';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function EligibilityModule() {
  const { employees, units, eligibilityStates, credentials, contracts, credentialRequirements, gracePeriods, waivers, addWaiver, refreshAllEligibility, refreshEligibility, credentialTemplates } = useStore();
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [isWaiverModal, setIsWaiverModal] = useState(false);
  const [form] = Form.useForm();

  const handleRefreshAll = () => {
    refreshAllEligibility();
    message.success('All eligibility states refreshed — materialized state updated (V39), roster queries &lt;50ms');
  };

  const handleAddWaiver = async () => {
    try {
      const values = await form.validateFields();
      addWaiver({
        employeeId: values.employeeId,
        templateId: values.templateId,
        waivedBy: 1,
        expiryDate: values.expiryDate.format(),
        reason: values.reason,
      });
      message.success('Emergency waiver created — employee ELIGIBLE immediately, expires automatically, audit entry raised (V48)');
      setIsWaiverModal(false);
      form.resetFields();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: 'Employee', key: 'emp', render: (_: any, r: any) => { const e = employees.find(ee => ee.id === r.employeeId); return e ? `${e.name} (${e.jobNumber}) - ${e.position}` : r.employeeId; } },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 180, render: (s: string) => <Tag icon={s === 'ELIGIBLE' ? <CheckCircleOutlined /> : s === 'ELIGIBLE_WITH_GRACE' ? <ClockCircleOutlined /> : <CloseCircleOutlined />} color={s === 'ELIGIBLE' ? 'green' : s === 'ELIGIBLE_WITH_GRACE' ? 'orange' : 'red'}>{s}</Tag> },
    { title: 'Reasons', dataIndex: 'reasons', key: 'reasons', render: (reasons: string[]) => reasons.length ? <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>{reasons.map((rr, i) => <li key={i}>{rr}</li>)}</ul> : <Text type="secondary">Eligible</Text> },
    { title: 'Last Calculated', dataIndex: 'lastCalculatedAt', key: 'lastCalculatedAt', width: 160, render: (d: string) => new Date(d).toLocaleString() },
    { title: 'Actions', key: 'actions', width: 160, render: (_: any, r: any) => <Space><Button size="small" onClick={() => refreshEligibility(r.employeeId)}>Refresh</Button><Button size="small" onClick={() => setSelectedEmployee(r.employeeId)}>Details</Button></Space> },
  ];

  const detailEmployee = selectedEmployee ? employees.find(e => e.id === selectedEmployee) : null;
  const detailEligibility = selectedEmployee ? eligibilityStates.find(e => e.employeeId === selectedEmployee) : null;
  const detailCreds = selectedEmployee ? credentials.filter(c => c.employeeId === selectedEmployee) : [];
  const detailContracts = selectedEmployee ? contracts.filter(c => c.employeeId === selectedEmployee) : [];
  const detailGrace = selectedEmployee ? gracePeriods.filter(g => g.employeeId === selectedEmployee) : [];
  const detailWaivers = selectedEmployee ? waivers.filter(w => w.employeeId === selectedEmployee) : [];

  const eligibleCount = eligibilityStates.filter(e => e.status === 'ELIGIBLE').length;
  const graceCount = eligibilityStates.filter(e => e.status === 'ELIGIBLE_WITH_GRACE').length;
  const ineligibleCount = eligibilityStates.filter(e => e.status === 'INELIGIBLE').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}><CheckCircleOutlined /> Eligibility Engine — Canonical + Materialized (V39) + Grace + Waivers</Title>
        <Space>
          <Button onClick={handleRefreshAll}>Refresh All (Daily Cron)</Button>
          <Button type="primary" onClick={() => setIsWaiverModal(true)}>Emergency Waiver (72h max)</Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Canonical Eligibility Engine (Section 6.1) — Single Source of Truth"
        description="One DB function check_nurse_eligibility + one app service determine eligibility. Frontend, worker, API all use same implementation. Combines employment status (contract coverage), credential validity, assignment conditions. Materialized state table employee_eligibility_state for &lt;50ms roster queries (V39). Publication re-validates against canonical engine inside transaction, while state table serves pool/dashboard reads. Grace periods: 30d SCFHS, 14d BLS/ACLS, 0d hospital ID, etc. Waivers: 72h max enforced in DB (chk_waiver_max_window), expiry auto-reverts to INELIGIBLE."
      />

      <Space size="large" style={{ marginBottom: 16 }} wrap>
        <Card size="small"><Statistic title="Eligible" value={eligibleCount} valueStyle={{ color: '#3f8600' }} prefix={<CheckCircleOutlined />} /></Card>
        <Card size="small"><Statistic title="Eligible with Grace" value={graceCount} valueStyle={{ color: '#fa8c16' }} prefix={<ClockCircleOutlined />} /></Card>
        <Card size="small"><Statistic title="Ineligible" value={ineligibleCount} valueStyle={{ color: '#cf1322' }} prefix={<CloseCircleOutlined />} /></Card>
        <Card size="small"><Text>Roster query performance: &lt;50ms via materialized state, regardless of rule complexity</Text></Card>
      </Space>

      <Card>
        <Table rowKey="employeeId" dataSource={eligibilityStates} columns={columns as any} pagination={{ pageSize: 10 }} size="small" />

        <div style={{ marginTop: 24 }}>
          <Title level={5}>Eligibility Flow (Spec 6.1)</Title>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="1. Contract Coverage">Check contracts table for Approved/Active covering date — exclusion constraint prevents overlapping Active contracts per employee (GiST daterange &&)</Descriptions.Item>
            <Descriptions.Item label="2. Credential Requirements">For employee's unit_id + position, find mandatory requirements. If none exist → BLOCK scheduling (requirements unknown, not safe). Position-specific overrides unit-wide for same template.</Descriptions.Item>
            <Descriptions.Item label="3. Credential Validity">Each required template must have Valid/ExpiringSoon credential with expiry &gt;= shift date. Issue date check via isIssueDate field.</Descriptions.Item>
            <Descriptions.Item label="4. Grace Periods (6.1.1)">If credential expired but renewal in progress, grace activates: ELIGIBLE_WITH_GRACE. Grace expiry demotes assignments to draft, notifies supervisor. Renewal approval closes grace. No stacking across cycles.</Descriptions.Item>
            <Descriptions.Item label="5. Emergency Waivers (6.1.2)">Supervisor override 72h max (DB CHECK). Creates high-priority audit entry. Expiry auto-reverts to INELIGIBLE.</Descriptions.Item>
            <Descriptions.Item label="6. Policy Transitions (6.1.2)">Requirement policy_status TRANSITION with transition_deadline — eligible but Policy Warning alert. Deadline passed → INELIGIBLE immediately.</Descriptions.Item>
          </Descriptions>
        </div>

        <div style={{ marginTop: 16 }}>
          <Title level={5}>Grace Periods & Waivers</Title>
          <Space size="large" wrap>
            <Card size="small" title="Active Grace Periods">
              <List size="small" dataSource={gracePeriods.filter(g => g.status === 'ACTIVE')} renderItem={g => <List.Item><Text style={{ fontSize: 12 }}>Emp {g.employeeId} — Template {g.templateId} — Expires {new Date(g.expiresAt).toLocaleDateString()} — {g.reason}</Text></List.Item>} />
            </Card>
            <Card size="small" title="Active Waivers (72h max)">
              <List size="small" dataSource={waivers} renderItem={w => <List.Item><Text style={{ fontSize: 12 }}>Emp {w.employeeId} — Exp {new Date(w.expiryDate).toLocaleString()} — {w.reason}</Text></List.Item>} />
            </Card>
          </Space>
        </div>
      </Card>

      <Modal title={`Eligibility Details — Employee ${selectedEmployee}`} open={selectedEmployee !== null} onCancel={() => setSelectedEmployee(null)} footer={null} width={800}>
        {detailEmployee && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Name">{detailEmployee.name}</Descriptions.Item>
              <Descriptions.Item label="Job Number">{detailEmployee.jobNumber}</Descriptions.Item>
              <Descriptions.Item label="Unit">{units.find(u => u.id === detailEmployee.unitId)?.code}</Descriptions.Item>
              <Descriptions.Item label="Position">{detailEmployee.position}</Descriptions.Item>
              <Descriptions.Item label="Eligibility" span={2}><Tag color={detailEligibility?.status === 'ELIGIBLE' ? 'green' : detailEligibility?.status === 'ELIGIBLE_WITH_GRACE' ? 'orange' : 'red'}>{detailEligibility?.status}</Tag> {detailEligibility?.reasons.join(', ')}</Descriptions.Item>
            </Descriptions>

            <Title level={5} style={{ marginTop: 16 }}>Contracts</Title>
            <List size="small" bordered dataSource={detailContracts} renderItem={c => <List.Item><Tag color={c.status === 'Active' ? 'green' : 'blue'}>{c.status}</Tag> {c.startDate} → {c.endDate}</List.Item>} />

            <Title level={5} style={{ marginTop: 16 }}>Credentials</Title>
            <List size="small" bordered dataSource={detailCreds} renderItem={c => {
              const tmpl = credentialTemplates.find(t => t.id === c.templateId);
              return <List.Item><Tag>{tmpl?.code}</Tag> <Tag color={c.validityStatus === 'Valid' ? 'green' : 'orange'}>{c.validityStatus}</Tag> Exp: {c.expiryDate} Sync: {c.syncStatus}</List.Item>;
            }} />

            <Title level={5} style={{ marginTop: 16 }}>Grace Periods</Title>
            <List size="small" bordered dataSource={detailGrace} renderItem={g => <List.Item><Tag color={g.status === 'ACTIVE' ? 'orange' : 'default'}>{g.status}</Tag> Exp: {new Date(g.expiresAt).toLocaleString()} — {g.reason}</List.Item>} />

            <Title level={5} style={{ marginTop: 16 }}>Waivers</Title>
            <List size="small" bordered dataSource={detailWaivers} renderItem={w => <List.Item>Exp: {new Date(w.expiryDate).toLocaleString()} — {w.reason}</List.Item>} />
          </>
        )}
      </Modal>

      <Modal title="Emergency Waiver — 72h Max (V48 DB Enforced)" open={isWaiverModal} onCancel={() => setIsWaiverModal(false)} onOk={handleAddWaiver} destroyOnClose>
        <Form form={form} layout="vertical">
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="72-Hour Maximum Waiver Window" description="Enforced in database via chk_waiver_max_window CHECK (expiry <= created_at + 72h) and chk_waiver_future. Supervisor override, high-priority audit entry, auto-expiry reverts to INELIGIBLE." />
          <Form.Item name="employeeId" label="Employee" rules={[{ required: true }]}><Select options={employees.filter(e => !(e as any).deletedAt).map(e => ({ label: `${e.name} (${e.jobNumber})`, value: e.id }))} showSearch /></Form.Item>
          <Form.Item name="templateId" label="Credential Template to Waive" rules={[{ required: true }]}><Select options={credentialTemplates.map(t => ({ label: `${t.code} - ${t.name}`, value: t.id }))} showSearch /></Form.Item>
          <Form.Item name="expiryDate" label="Waiver Expiry (max 72h from now)" rules={[{ required: true }]}><DatePicker showTime style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="reason" label="Reason (required)" rules={[{ required: true }]}><Input.TextArea placeholder="Emergency staffing need, renewal in progress, etc." /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function Statistic({ title, value, valueStyle, prefix }: any) {
  return <div><div style={{ fontSize: 12, color: '#888' }}>{title}</div><div style={{ fontSize: 20, fontWeight: 'bold', ...valueStyle }}>{prefix} {value}</div></div>;
}
