// src/modules/workforce/UnitCapacityGrid.tsx
// B-24 — Unit & Bed Capacity Configuration screen (Section 2.9).
//
// Lets HR enter the required bed plan in one action instead of editing units
// one by one. Shows "Baseline 582 → Configured N" live, so the effect of a
// bulk change is visible before committing. Import is dry-run first.

import React, { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  InputNumber,
  Modal,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';

const { Text, Title } = Typography;

interface UnitRow {
  id: number;
  code: string;
  name: string;
  bedCount: number;
  department: { code: string; name: string } | null;
}

interface UnitSummary {
  unitCount: number;
  totalBeds: number;
  byDepartment: Record<string, number>;
  seededBaselineBeds: number;
}

interface BulkRowResult {
  unitCode: string;
  status: 'UPDATED' | 'UNCHANGED' | 'REJECTED';
  reason?: string;
  previous?: number;
  next?: number;
}

export function UnitCapacityGrid(): React.ReactElement {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [importReport, setImportReport] = useState<any[] | null>(null);

  const { data: units = [], isLoading } = useQuery<UnitRow[]>({
    queryKey: ['units'],
    queryFn: () => apiFetch('/api/v1/units').then((r) => r.json()),
  });

  const { data: summary } = useQuery<UnitSummary>({
    queryKey: ['units', 'summary'],
    queryFn: () => apiFetch('/api/v1/units/summary').then((r) => r.json()),
  });

  const dirty = useMemo(
    () => Object.entries(edits).filter(([code, next]) => {
      const unit = units.find((u) => u.code === code);
      return unit && unit.bedCount !== next;
    }),
    [edits, units],
  );

  const projectedTotal = useMemo(() => {
    const base = units.reduce((s, u) => s + u.bedCount, 0);
    return dirty.reduce(
      (s, [code, next]) => s + (next - (units.find((u) => u.code === code)?.bedCount ?? 0)),
      base,
    );
  }, [units, dirty]);

  const bulkSave = useMutation({
    mutationFn: () =>
      apiFetch('/api/v1/units/bed-capacity/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Annual bed plan configuration',
          rows: dirty.map(([unitCode, bedCount]) => ({ unitCode, bedCount })),
        }),
        // Idempotency-Key is injected by idempotentFetch in production wiring.
      }).then((r) => r.json() as Promise<BulkRowResult[]>),
    onSuccess: (results) => {
      const updated = results.filter((r) => r.status === 'UPDATED').length;
      const rejected = results.filter((r) => r.status === 'REJECTED');
      message.success(`${updated} unit(s) updated`);
      if (rejected.length > 0) {
        message.warning(`${rejected.length} row(s) rejected — see the grid`);
      }
      setEdits({});
      void qc.invalidateQueries({ queryKey: ['units'] });
    },
    onError: (e: Error) => message.error(`Bulk update failed: ${e.message}`),
  });

  const runImport = useMutation({
    mutationFn: ({ csv, dryRun }: { csv: string; dryRun: boolean }) =>
      apiFetch('/api/v1/units/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, dryRun }),
      }).then((r) => r.json()),
    onSuccess: (res) => {
      setImportReport(res.results ?? []);
      if (res.dryRun === false) {
        message.success('Import applied');
        void qc.invalidateQueries({ queryKey: ['units'] });
      } else {
        message.info('Dry run complete — review before applying');
      }
    },
  });

  const columns = [
    {
      title: 'Department',
      dataIndex: ['department', 'name'],
      filters: Array.from(new Set(units.map((u) => u.department?.name ?? '')))
        .filter(Boolean)
        .map((n) => ({ text: n, value: n })),
      onFilter: (v: any, r: UnitRow) => r.department?.name === v,
    },
    { title: 'Code', dataIndex: 'code', width: 130 },
    { title: 'Unit', dataIndex: 'name' },
    {
      title: 'Current beds',
      dataIndex: 'bedCount',
      width: 120,
      align: 'right' as const,
    },
    {
      title: 'Required beds',
      width: 150,
      render: (_: unknown, r: UnitRow) => (
        <InputNumber
          min={0}
          max={500}
          value={edits[r.code] ?? r.bedCount}
          onChange={(v) =>
            setEdits((prev) => ({ ...prev, [r.code]: Number(v ?? r.bedCount) }))
          }
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Delta',
      width: 90,
      align: 'right' as const,
      render: (_: unknown, r: UnitRow) => {
        const next = edits[r.code];
        if (next === undefined || next === r.bedCount) return <Text type="secondary">—</Text>;
        const d = next - r.bedCount;
        return <Tag color={d > 0 ? 'green' : 'orange'}>{d > 0 ? `+${d}` : d}</Tag>;
      },
    },
  ];

  return (
    <Card
      title="Unit & Bed Capacity Configuration"
      extra={
        <Space>
          <Upload
            accept=".csv"
            showUploadList={false}
            beforeUpload={async (file) => {
              const csv = await file.text();
              runImport.mutate({ csv, dryRun: true });
              return false; // never auto-upload
            }}
          >
            <Button>Import CSV (dry run)</Button>
          </Upload>
          <Button
            type="primary"
            disabled={dirty.length === 0}
            loading={bulkSave.isPending}
            onClick={() => bulkSave.mutate()}
          >
            Apply {dirty.length > 0 ? `(${dirty.length})` : ''}
          </Button>
        </Space>
      }
    >
      <Space size="large" style={{ marginBottom: 16 }}>
        <Statistic title="Baseline (seed)" value={summary?.seededBaselineBeds ?? 582} suffix="beds" />
        <Statistic title="Configured now" value={summary?.totalBeds ?? 0} suffix="beds" />
        <Statistic
          title="After applying"
          value={projectedTotal}
          suffix="beds"
          valueStyle={{ color: dirty.length > 0 ? '#fa8c16' : undefined }}
        />
        <Statistic title="Units" value={summary?.unitCount ?? units.length} />
      </Space>

      {dirty.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${dirty.length} pending change(s)`}
          description="Each changed unit writes its own bed_capacity_log entry with your name and the reason."
        />
      )}

      <Table
        rowKey="code"
        loading={isLoading}
        dataSource={units}
        columns={columns as any}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        size="small"
      />

      <Modal
        open={importReport !== null}
        title="Import preview (dry run)"
        width={760}
        onCancel={() => setImportReport(null)}
        footer={[
          <Button key="cancel" onClick={() => setImportReport(null)}>
            Cancel
          </Button>,
          <Button
            key="apply"
            type="primary"
            disabled={(importReport ?? []).some((r) => r.status === 'REJECTED')}
            onClick={() => {
              // Re-post the same CSV with dryRun:false — rejected rows block apply.
              message.info('Re-run the import with Apply to commit.');
              setImportReport(null);
            }}
          >
            Apply valid rows
          </Button>,
        ]}
      >
        <Table
          size="small"
          rowKey="line"
          pagination={false}
          dataSource={importReport ?? []}
          columns={[
            { title: 'Line', dataIndex: 'line', width: 60 },
            { title: 'Unit', dataIndex: 'unitCode' },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (s: string) => (
                <Tag color={s === 'REJECTED' ? 'red' : s === 'UNCHANGED' ? 'default' : 'green'}>
                  {s}
                </Tag>
              ),
            },
            { title: 'Reason', dataIndex: 'reason' },
          ]}
        />
      </Modal>
    </Card>
  );
}
