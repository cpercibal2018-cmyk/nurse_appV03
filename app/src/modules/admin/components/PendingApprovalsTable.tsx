import React, { useState } from 'react';
import { Table, Tag, Button, Space, Modal, Input, Alert, Typography } from 'antd';
import { usePendingApprovals, useApproveRequest } from '../../../lib/api/roles.api';
import { useStore } from '../../../lib/store';

const { Text } = Typography;

export default function PendingApprovalsTable() {
  const { data: approvals, isLoading } = usePendingApprovals();
  const approveMutation = useApproveRequest();
  const { currentUser } = useStore();
  const [actionModal, setActionModal] = useState<{ open: boolean; requestId: string | null; action: 'approve' | 'reject' }>({ open: false, requestId: null, action: 'approve' });
  const [reason, setReason] = useState('');

  const handleAction = async () => {
    if (!actionModal.requestId) return;
    try {
      await approveMutation.mutateAsync({ requestId: actionModal.requestId, action: actionModal.action, reason });
      setActionModal({ open: false, requestId: null, action: 'approve' });
      setReason('');
    } catch {}
  };

  const columns = [
    { title: 'Request ID', dataIndex: 'id', key: 'id', width: 180, render: (id: string) => <Text code style={{ fontSize: 11 }}>{id.slice(0, 8)}...</Text> },
    { title: 'Initiator', dataIndex: 'initiatorName', key: 'initiatorName', width: 150 },
    { title: 'Action Type', dataIndex: 'actionType', key: 'actionType', width: 220, render: (t: string) => <Tag color={t.includes('SYSTEM_ADMIN') ? 'red' : 'blue'}>{t}</Tag> },
    { title: 'Target User', key: 'target', width: 200, render: (_: any, row: any) => `${row.payload.userId.slice(0, 8)}... (${row.payload.role})` },
    { title: 'Scope', key: 'scope', width: 150, render: (_: any, row: any) => `${row.payload.scopeType} ${row.payload.scopeIds.length ? `(${row.payload.scopeIds.length})` : ''}` },
    { title: 'Reason', key: 'reason', render: (_: any, row: any) => <Text style={{ fontSize: 11 }}>{row.payload.reason.slice(0, 60)}...</Text> },
    { title: 'Created', dataIndex: 'createdAt', key: 'createdAt', width: 160, render: (d: string) => new Date(d).toLocaleString() },
    {
      title: 'Actions', key: 'actions', width: 200, render: (_: any, row: any) => (
        <Space>
          <Button size="small" type="primary" disabled={row.initiatorId === currentUser?.id} onClick={() => setActionModal({ open: true, requestId: row.id, action: 'approve' })}>Approve</Button>
          <Button size="small" danger disabled={row.initiatorId === currentUser?.id} onClick={() => setActionModal({ open: true, requestId: row.id, action: 'reject' })}>Reject</Button>
        </Space>
      )
    },
  ];

  return (
    <div>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Four-Eyes Principle (Dual-Auth) — §3.5 V42" description="High-impact actions (SYSTEM_ADMIN promotion, HR_ADMIN system-wide) require PENDING → different admin approves. Partial unique index uq_admin_request_pending prevents duplicate pending, SELECT FOR UPDATE locks row, self-approval forbidden 403, executeAction(tx) same transaction so failure rolls back both action+status, terminal EXECUTED records approver_id." />

      <Table dataSource={approvals?.filter(a => a.status === 'PENDING')} rowKey="id" loading={isLoading} columns={columns as any} size="small" pagination={false} />

      <Modal
        title={actionModal.action === 'approve' ? 'Approve Request — Four-Eyes' : 'Reject Request'}
        open={actionModal.open}
        onCancel={() => setActionModal({ open: false, requestId: null, action: 'approve' })}
        onOk={handleAction}
        confirmLoading={approveMutation.isPending}
        okText={actionModal.action === 'approve' ? 'Approve & Execute' : 'Reject'}
        okButtonProps={{ danger: actionModal.action === 'reject' }}
      >
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="SELECT FOR UPDATE + Same Transaction" description="Approving locks row FOR UPDATE so two approvers cannot both proceed. PENDING precondition blocks replay. executeAction(tx) uses same transaction client — failure rolls back both action+status change." />

        <Input.TextArea rows={3} placeholder="Approval reason — e.g. Approved per hospital policy #123, verified scope" value={reason} onChange={(e) => setReason(e.target.value)} />

        {approveMutation.isError && <Alert type="error" showIcon style={{ marginTop: 12 }} message="Action Failed" description={(approveMutation.error as any)?.message} />}
      </Modal>
    </div>
  );
}
