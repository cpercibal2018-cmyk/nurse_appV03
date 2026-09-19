import React, { useState } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Form, Input, Select, InputNumber, Switch, message, Typography, Alert, Badge, Tooltip } from 'antd';
import { PlusOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useStore } from '../../lib/store';

const { Title, Text } = Typography;

export default function PositionsPage() {
  const { positions, employees, currentUser, addPosition, updatePosition, deletePosition, assignPosition } = useStore();
  const [isModal, setIsModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [filterActive, setFilterActive] = useState<boolean | undefined>(true);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assignForm] = Form.useForm();

  const filtered = positions.filter(p => {
    if (filterActive === true && !p.isActive) return false;
    if (filterActive === false && p.isActive) return false;
    return true;
  });

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        updatePosition(editing.code, values);
        message.success(`Position ${editing.code} updated — schedulability change triggers revalidation of future assignments`);
      } else {
        addPosition(values);
        message.success(`Position ${values.code} created — FK accepts new code automatically, no migration needed`);
      }
      setIsModal(false);
      setEditing(null);
      form.resetFields();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // Position Assignment writes employees.position — an Employee Master source
  // field. Spec §8.1 grants that to HR Admin only; the store re-checks the role
  // so the gate does not depend on this screen.
  const isHrAdmin = currentUser?.role === 'HR_ADMIN';

  const handleAssign = async () => {
    try {
      const values = await assignForm.validateFields();
      const { previous, positionCode } = assignPosition({
        employeeId: values.employeeId,
        positionCode: values.positionCode,
        reason: values.reason,
      });
      message.success(`Position assigned: ${previous} → ${positionCode}. No authorization role was granted (§8.2) — grant it separately if the new position needs one.`);
      setIsAssignOpen(false);
      assignForm.resetFields();
    } catch (e: any) {
      if (e?.errorFields) return; // antd validation, already shown inline
      message.error(e.message);
    }
  };

  const handleDelete = (code: string) => {
    Modal.confirm({
      title: `Soft-delete position ${code}?`,
      content: 'Sets is_active=false. Blocked if active employees hold this code or credential rules target it. Validation rejects deactivated code for new assignments.',
      onOk: () => {
        try {
          deletePosition(code);
          message.success(`Position ${code} soft-deleted`);
        } catch (e: any) {
          message.error(e.message);
        }
      }
    });
  };

  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 130, sorter: (a: any, b: any) => a.code.localeCompare(b.code) },
    { title: 'Full Title', dataIndex: 'fullTitle', key: 'fullTitle', sorter: (a: any, b: any) => a.fullTitle.localeCompare(b.fullTitle) },
    { title: 'Tier', dataIndex: 'tier', key: 'tier', filters: [...new Set(positions.map(p => p.tier))].map(t => ({ text: t, value: t })), onFilter: (v: any, r: any) => r.tier === v, render: (tier: string) => <Tag color={tier === 'Executive' ? 'red' : tier === 'Management' ? 'blue' : tier === 'Clinical' ? 'green' : 'default'}>{tier}</Tag> },
    { title: 'Schedulable', dataIndex: 'isSchedulable', key: 'isSchedulable', width: 110, render: (v: boolean) => v ? <Tag color="green">Yes</Tag> : <Tag color="red">No</Tag> },
    { title: 'Active', dataIndex: 'isActive', key: 'isActive', width: 90, render: (v: boolean) => v ? <Badge status="success" text="Active" /> : <Badge status="default" text="Inactive" /> },
    { title: 'Order', dataIndex: 'displayOrder', key: 'displayOrder', width: 70, sorter: (a: any, b: any) => a.displayOrder - b.displayOrder },
    { title: 'Employees', key: 'emp', width: 90, render: (_: any, r: any) => <Tag>{employees.filter(e => e.position === r.code && !(e as any).deletedAt).length}</Tag> },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: 'Actions', key: 'actions', width: 160, render: (_: any, r: any) => (
        <Space>
          <Button size="small" onClick={() => { setEditing(r); form.setFieldsValue(r); setIsModal(true); }}>Edit</Button>
          <Button size="small" danger disabled={!r.isActive} onClick={() => handleDelete(r.code)}>Delete</Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>Position Directory — Canonical (FK Enforced)</Title>
        <Space>
          <Select value={filterActive} onChange={setFilterActive} style={{ width: 160 }} options={[{ label: 'Active only (14)', value: true }, { label: 'Inactive (2 deprecated)', value: false }, { label: 'All (16)', value: undefined }]} />
          <Tooltip title={isHrAdmin ? 'Assign a position to an existing employee — HR Admin only' : `Position assignment requires HR_ADMIN (spec §8.1) — you are signed in as ${currentUser?.role ?? 'no role'}`}>
            <Button icon={<UserSwitchOutlined />} disabled={!isHrAdmin} onClick={() => { assignForm.resetFields(); setIsAssignOpen(true); }}>Position Assignment</Button>
          </Tooltip>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setIsModal(true); }}>Add Position</Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Position Directory CRUD (Section 3.1.1) — Full Implementation"
        description="Directory seeded with 16 positions (14 active, 2 deprecated AHN→ACTING_HEAD, CI→NURSE_EDUCATOR). FK on employees.position and credential_requirements.position. POST creates new code, FK accepts it automatically, no migration. PUT updates title/tier/schedulability, toggling is_schedulable to false demotes future published assignments to draft. DELETE soft-deletes (is_active=false) blocked when employees hold code. Audit trail for all mutations."
      />

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Position Assignment — HR Admin only"
        description={<>
          Assigning a position writes <Text code>employees.position</Text>, which is an <Text strong>Employee Master source field</Text>.
          Spec §8.1 grants Employee Master maintenance to <Text strong>HR Admin</Text> ("Maintain source fields within scope");
          Supervisor/Scheduler holds an assigned-unit read view with private fields suppressed, and Employee holds own profile and
          phone only — so neither may assign. The check lives in <Text code>store.assignPosition</Text>, not in this screen, so it
          holds for every caller.
          <br /><br />
          <Text strong>§8.2 — the title never auto-confers a role.</Text> DON, DEPUTY_DON, ADMIN, NS and ACTING_HEAD all keep
          staff self-service at registration; HR must separately grant the elevated authorization role and scope. This action
          therefore grants nothing, and records <Text code>authRoleGranted: null</Text> in the audit entry to prove it.
        </>}
      />

      <Card>
        <Table rowKey="code" dataSource={filtered} columns={columns as any} pagination={{ pageSize: 20 }} size="small" scroll={{ x: 1200 }} />
        <div style={{ marginTop: 16 }}>
          <Text strong>Position Tiers & Schedulability:</Text>
          <br />
          <Space wrap style={{ marginTop: 8 }}>
            <Tag color="red">Executive: DON, DEPUTY_DON — Non-schedulable</Tag>
            <Tag color="default">Administrative: ADMIN — Non-schedulable</Tag>
            <Tag color="blue">Management: NS, ACTING_HEAD, HN — Schedulable</Tag>
            <Tag color="purple">Specialist: NURSE_EDUCATOR — Schedulable</Tag>
            <Tag color="magenta">Advanced Practice: PRACTITIONER — Schedulable</Tag>
            <Tag>Clinical Lead: CN, Clinical: SN, Support: PCT/TEC/HCA, Specialist: MW</Tag>
          </Space>
        </div>
      </Card>

      <Modal title={editing ? `Edit Position ${editing.code}` : 'Add Position — No Migration Needed'} open={isModal} onCancel={() => { setIsModal(false); setEditing(null); }} onOk={handleCreate} okText={editing ? 'Update' : 'Create'} width={600} destroyOnClose>
        <Form form={form} layout="vertical">
          {!editing && <Form.Item name="code" label="Position Code (uppercase, 2-20 chars, immutable after creation)" rules={[{ required: true, pattern: /^[A-Z][A-Z0-9_]{1,19}$/, message: 'Uppercase alphanumeric + underscore, 2-20 chars' }]}><Input placeholder="NEW_POS" /></Form.Item>}
          <Form.Item name="fullTitle" label="Full Title" rules={[{ required: true, max: 100 }]}><Input /></Form.Item>
          <Form.Item name="tier" label="Tier" rules={[{ required: true }]}><Select options={['Executive', 'Administrative', 'Management', 'Specialist', 'Advanced Practice', 'Clinical Lead', 'Clinical', 'Clinical Specialist', 'Support'].map(t => ({ label: t, value: t }))} /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea /></Form.Item>
          <Space>
            <Form.Item name="isSchedulable" label="Schedulable" valuePropName="checked"><Switch /></Form.Item>
            <Form.Item name="displayOrder" label="Display Order"><InputNumber min={0} max={99} /></Form.Item>
          </Space>
          {editing && <Alert type="warning" showIcon message="Code is immutable. Toggling schedulability to false will demote future published assignments for employees with this position to draft and notify supervisors." />}
        </Form>
      </Modal>
      <Modal
        title="Position Assignment — HR Admin only"
        open={isAssignOpen}
        onCancel={() => { setIsAssignOpen(false); assignForm.resetFields(); }}
        onOk={handleAssign}
        okText="Assign Position"
        okButtonProps={{ disabled: !isHrAdmin }}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Employee Master write (spec §8.1)"
          description="HR Admin assigns the position. This grants no authorization role (§8.2) — the employee keeps staff self-service until HR grants an elevated role and scope separately."
        />
        <Form form={assignForm} layout="vertical">
          <Form.Item name="employeeId" label="Employee" rules={[{ required: true, message: 'Select an employee' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select employee"
              options={employees.filter(e => !(e as any).deletedAt).map(e => ({ label: `${e.name} — ${e.jobNumber} (${e.position})`, value: e.id }))}
            />
          </Form.Item>
          <Form.Item name="positionCode" label="New Position (active only)" rules={[{ required: true, message: 'Select a position' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select position"
              options={positions.filter(p => p.isActive).sort((a, b) => a.displayOrder - b.displayOrder).map(p => ({ label: `${p.code} - ${p.fullTitle} (${p.tier})`, value: p.code }))}
            />
          </Form.Item>
          <Form.Item name="reason" label="Reason (recorded in the audit trail)"><Input.TextArea rows={2} placeholder="e.g. promotion to Charge Nurse effective next roster" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
