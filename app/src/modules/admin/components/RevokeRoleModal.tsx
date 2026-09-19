import React, { useState } from 'react';
import { Modal, Input, Alert, Typography, Tag } from 'antd';
import { RoleAssignment, useRevokeRole } from '../../../lib/api/roles.api';

const { Text } = Typography;

interface Props {
  assignment: RoleAssignment | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function RevokeRoleModal({ assignment, open, onClose, onSuccess }: Props) {
  const [reason, setReason] = useState('');
  const revokeMutation = useRevokeRole();

  const handleOk = async () => {
    if (!assignment) return;
    try {
      await revokeMutation.mutateAsync({ id: assignment.id, reason });
      setReason('');
      onSuccess?.();
      onClose();
    } catch {}
  };

  if (!assignment) return null;

  return (
    <Modal
      title="Revoke Role Assignment"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={revokeMutation.isPending}
      okText="Revoke"
      okButtonProps={{ danger: true, disabled: reason.length < 10 }}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="Immediate Revocation + Cache Invalidation"
        description="Revoking sets isActive=false, revokedAt=now(), revokedBy=actor. Redis perms:userId deleted, next request reads fresh DB. Cannot revoke own assignment — requires another admin (prevents lockout). Cannot revoke last SYSTEM_ADMIN."
      />

      <div style={{ marginBottom: 12 }}>
        <Text strong>Assignment: </Text>
        <Tag color={assignment.role === 'SYSTEM_ADMIN' ? 'red' : assignment.role === 'HR_ADMIN' ? 'blue' : 'green'}>{assignment.role}</Tag>
        <Text>{assignment.userName} ({assignment.email}) — {assignment.scopeType} {assignment.scopeNames.join(', ')}</Text>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Text>Granted: {new Date(assignment.grantedAt).toLocaleString()} — Reason: {assignment.reason}</Text>
      </div>

      <Input.TextArea
        rows={3}
        placeholder="Revoke reason >=10 chars — e.g. Assignment ended, ACTING_HEAD rotation completed per policy #123"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      {assignment.role === 'SYSTEM_ADMIN' && (
        <Alert type="error" showIcon style={{ marginTop: 12 }} message="High-Impact Revocation" description="Revoking SYSTEM_ADMIN is high priority audit. Ensure at least one SYSTEM_ADMIN remains, otherwise 403." />
      )}

      {revokeMutation.isError && (
        <Alert type="error" showIcon style={{ marginTop: 12 }} message="Revoke Failed" description={(revokeMutation.error as any)?.message} />
      )}
    </Modal>
  );
}
