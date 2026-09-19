import React, { useState, useEffect } from 'react';
import { Drawer, Form, Select, Input, DatePicker, Alert, Button, Space, Typography } from 'antd';
import { useStore } from '../../../lib/store';
import { GrantRoleDto, AppRole, ScopeType, useGrantRole } from '../../../lib/api/roles.api';
import dayjs from 'dayjs';

export default function GrantRoleDrawer({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess?: () => void }) {
  const [form] = Form.useForm();
  const { employees, departments, units } = useStore();
  const grantMutation = useGrantRole();
  const [scopeType, setScopeType] = useState<ScopeType>('UNIT');
  const [selectedRole, setSelectedRole] = useState<AppRole>('HR_ADMIN');

  useEffect(() => {
    if (open) {
      form.resetFields();
      setScopeType('UNIT');
      setSelectedRole('HR_ADMIN');
    }
  }, [open, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const dto: GrantRoleDto = {
        userId: String(values.userId),
        role: values.role,
        scopeType: values.scopeType,
        scopeIds: values.scopeType === 'SYSTEM' ? [] : (values.scopeIds || []).map((id: any) => String(id)),
        reason: values.reason,
        expiresAt: values.expiresAt ? values.expiresAt.toISOString() : undefined,
      };
      await grantMutation.mutateAsync(dto);
      form.resetFields();
      onSuccess?.();
      onClose();
    } catch (e: any) {
      if (e?.status === 202) {
        onSuccess?.();
        onClose();
      }
    }
  };

  const scopeOptions = scopeType === 'DEPARTMENT'
    ? (departments as any[]).map((d: any) => ({ label: `${d.code} — ${d.name}`, value: String(d.id) }))
    : (units as any[]).map((u: any) => ({ label: `${u.code} — ${u.name}`, value: String(u.id) }));

  const userOptions = (employees as any[]).map((u: any) => ({
    label: `${u.name} — ${u.contactEmail} [${u.position}]`,
    value: String(u.id),
  }));

  const selectedUserId = Form.useWatch('userId', form);
  const selectedUser = (employees as any[]).find((u: any) => String(u.id) === String(selectedUserId));
  const isExecutive = selectedUser && ['DON', 'DEPUTY_DON', 'ADMIN'].includes(selectedUser.position || '');

  return (
    <Drawer
      title="Grant Role — Explicit Assignment Required (§8)"
      open={open}
      onClose={onClose}
      width={600}
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={grantMutation.isPending} onClick={handleSubmit}>Grant Role</Button>
        </Space>
      }
    >
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Default Deny — Position Never Auto-Confors Admin" description="All 14 positions receive EMPLOYEE at registration. DON/DEPUTY_DON/ADMIN/NS/ACTING_HEAD do NOT auto-grant elevated roles. HR must explicitly assign with scope + reason >=20 chars. Idempotency-Key prevents duplicate grants." />

      <Form form={form} layout="vertical" initialValues={{ scopeType: 'UNIT', role: 'HR_ADMIN' }}>
        <Form.Item name="userId" label="Target User (Employee)" rules={[{ required: true, message: 'Select user' }]}>
          <Select showSearch options={userOptions} placeholder="Search user by name/email" filterOption={(input: any, option: any) => (option?.label as string).toLowerCase().includes(input.toLowerCase())} />
        </Form.Item>

        {isExecutive && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={`Executive position ${selectedUser?.position} — explicit reason required`} description="DON/DEPUTY_DON/ADMIN do not automatically confer system privileges. You must provide detailed justification (>=20 chars) per §8.2. This will be audit logged." />
        )}

        <Form.Item name="role" label="Role" rules={[{ required: true }]}>
          <Select onChange={(v) => setSelectedRole(v)} options={[
            { label: 'HR_ADMIN — Onboarding V36, dept/unit/bed CRUD, positions CRUD, credential catalog, contracts lifecycle', value: 'HR_ADMIN' },
            { label: 'SUPERVISOR — Scoped compliance view, draft & publish roster, waivers 72h', value: 'SUPERVISOR' },
            { label: 'SYSTEM_ADMIN — Full admin, PAM, break-glass, requires Four-Eyes + PAM elevation (2h)', value: 'SYSTEM_ADMIN' },
          ]} />
        </Form.Item>

        {selectedRole === 'SYSTEM_ADMIN' && (
          <Alert type="error" showIcon style={{ marginBottom: 16 }} message="High-Impact — Four-Eyes Required" description="Granting SYSTEM_ADMIN will create PENDING approval request (202). Requires different admin to approve via SELECT FOR UPDATE lock. Self-approval forbidden 403." />
        )}

        <Form.Item name="scopeType" label="Scope Type" rules={[{ required: true }]}>
          <Select onChange={(v) => setScopeType(v)} options={[
            { label: 'SYSTEM — System-wide (requires SYSTEM_ADMIN or HR_ADMIN system-wide, triggers Four-Eyes if HR_ADMIN)', value: 'SYSTEM' },
            { label: 'DEPARTMENT — Scoped to departments', value: 'DEPARTMENT' },
            { label: 'UNIT — Scoped to units (recommended for SUPERVISOR)', value: 'UNIT' },
          ]} />
        </Form.Item>

        {scopeType !== 'SYSTEM' && (
          <Form.Item name="scopeIds" label={scopeType === 'DEPARTMENT' ? 'Departments' : 'Units'} rules={[{ required: true, message: 'Select at least one scope' }]}>
            <Select mode="multiple" options={scopeOptions} placeholder={`Select ${scopeType.toLowerCase()}s`} />
          </Form.Item>
        )}

        <Form.Item name="reason" label="Justification (Reason)" rules={[{ required: true, min: 20, message: 'Reason must be >=20 chars' }]}>
          <Input.TextArea rows={3} placeholder="e.g. NS needs multi-unit scope for night shift coverage — ICU, ER, Ward A per hospital policy #123" />
        </Form.Item>

        <Form.Item name="expiresAt" label="Expires At (Optional — for ACTING_HEAD temporary)" extra="SUPERVISOR max 90 days, HR_ADMIN max 365 days. Leave empty for permanent until revoked. Auto-revoked by RoleExpiryWorker.">
          <DatePicker showTime style={{ width: '100%' }} disabledDate={(current) => current && current.isBefore(dayjs().startOf('day'))} />
        </Form.Item>

        <Alert type="warning" showIcon message="Server-Evaluated Scope" description="Passing nurse ID from browser does NOT establish access. Server checks actor's own assignments via assertScopeCoverage. Scope violation → 403. Idempotency-Key prevents duplicate grants — 409 only while live lease." />

        {grantMutation.isError && <Alert type="error" showIcon style={{ marginTop: 16 }} message="Grant Failed" description={(grantMutation.error as any)?.message || 'Unknown error'} />}
      </Form>
    </Drawer>
  );
}
