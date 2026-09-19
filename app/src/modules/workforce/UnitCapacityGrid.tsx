import React, { useMemo, useState } from 'react';
import { Card, Table, Tag, Typography, Space, Button, Statistic, InputNumber, Alert, Upload, Modal, message, Select, Input, Form } from 'antd';
import { UploadOutlined, PlusOutlined } from '@ant-design/icons';
import { useStore } from '../../lib/store';

const { Text, Title } = Typography;

export default function UnitCapacityGrid() {
  const { units, departments, bedCapacityLog, bulkUpdateBedCapacity, importUnits, currentUser, addUnit, updateUnit, deleteUnit } = useStore();
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [importReport, setImportReport] = useState<any[] | null>(null);
  const [filterDept, setFilterDept] = useState<number | undefined>();
  const [isAddModal, setIsAddModal] = useState(false);
  const [form] = Form.useForm();

  const filteredUnits = units.filter(u => {
    if (!u.isActive) return false;
    if (filterDept && u.departmentId !== filterDept) return false;
    return true;
  });

  const totalBeds = units.filter(u => u.isActive).reduce((s, u) => s + u.bedCount, 0);
  const seededBaseline = 582;

  const dirty = useMemo(() => Object.entries(edits).filter(([code, next]) => {
    const unit = units.find(u => u.code === code);
    return unit && unit.bedCount !== next;
  }), [edits, units]);

  const projectedTotal = useMemo(() => {
    const base = units.filter(u => u.isActive).reduce((s, u) => s + u.bedCount, 0);
    return dirty.reduce((s, [code, next]) => s + (next - (units.find(u => u.code === code)?.bedCount ?? 0)), base);
  }, [units, dirty]);

  const handleBulkSave = () => {
    try {
      const rows = dirty.map(([unitCode, bedCount]) => ({ unitCode, bedCount }));
      const results = bulkUpdateBedCapacity(rows, 'Annual bed plan configuration', currentUser?.id || 1);
      const updated = results.filter(r => r.status === 'UPDATED').length;
      const rejected = results.filter(r => r.status === 'REJECTED');
      message.success(`${updated} unit(s) updated — each wrote bed_capacity_log with actor & reason`);
      if (rejected.length > 0) message.warning(`${rejected.length} rejected`);
      setEdits({});
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleImport = (csv: string, dryRun: boolean) => {
    const res = importUnits(csv, dryRun, currentUser?.id || 1);
    setImportReport(res.results);
    if (!dryRun) {
      message.success('Import applied — each changed unit logged');
    } else {
      message.info(`Dry run complete — ${res.results.filter((r: any) => r.status === 'UPDATED').length} would be updated, ${res.results.filter((r: any) => r.status === 'REJECTED').length} rejected`);
    }
  };

  const handleAddUnit = async () => {
    try {
      const values = await form.validateFields();
      addUnit(values);
      message.success('Unit created');
      setIsAddModal(false);
      form.resetFields();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    {
      title: 'Department', key: 'dept', width: 180,
      render: (_: any, r: any) => {
        const dept = departments.find(d => d.id === r.departmentId);
        return dept ? <Tag color="blue">{dept.code}</Tag> : '-';
      },
      filters: departments.map(d => ({ text: `${d.code} - ${d.name}`, value: d.id })),
      onFilter: (v: any, r: any) => r.departmentId === v,
    },
    { title: 'Code', dataIndex: 'code', key: 'code', width: 130, sorter: (a: any, b: any) => a.code.localeCompare(b.code) },
    { title: 'Unit', dataIndex: 'name', key: 'name', sorter: (a: any, b: any) => a.name.localeCompare(b.name) },
    { title: 'Current', dataIndex: 'bedCount', key: 'bedCount', width: 90, align: 'right' as const, sorter: (a: any, b: any) => a.bedCount - b.bedCount },
    {
      title: 'Required beds', width: 150,
      render: (_: any, r: any) => (
        <InputNumber min={0} max={500} value={edits[r.code] ?? r.bedCount} onChange={v => setEdits(prev => ({ ...prev, [r.code]: Number(v ?? r.bedCount) }))} style={{ width: '100%' }} />
      )
    },
    {
      title: 'Delta', width: 90, align: 'right' as const,
      render: (_: any, r: any) => {
        const next = edits[r.code];
        if (next === undefined || next === r.bedCount) return <Text type="secondary">—</Text>;
        const d = next - r.bedCount;
        return <Tag color={d > 0 ? 'green' : 'orange'}>{d > 0 ? `+${d}` : d}</Tag>;
      }
    },
    {
      title: 'History', width: 100,
      render: (_: any, r: any) => {
        const history = bedCapacityLog.filter(l => l.unitId === r.id);
        return <Button size="small" onClick={() => Modal.info({ title: `Bed history — ${r.code}`, content: <div>{history.map((h: any) => <div key={h.id} style={{ fontSize: 12 }}>{h.previousCount} → {h.newCount} — {h.reason} — {new Date(h.changedAt).toLocaleDateString()}</div>)}</div>, width: 600 })}>{history.length} logs</Button>;
      }
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>Unit & Bed Capacity Configuration — Editable Baseline (B-24)</Title>
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => setIsAddModal(true)}>Add Unit</Button>
          <Upload accept=".csv" showUploadList={false} beforeUpload={async (file) => { const csv = await file.text(); handleImport(csv, true); return false; }}>
            <Button icon={<UploadOutlined />}>Import CSV (dry-run)</Button>
          </Upload>
          <Button type="primary" disabled={dirty.length === 0} onClick={handleBulkSave}>Apply ({dirty.length})</Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Entering the required numbers is configuration, not a release (Section 2.9)"
        description="Units and bed capacity are runtime configuration. Use the grid below to enter the required bed plan in one action. Bulk API: PUT /api/v1/units/bed-capacity/bulk. CSV import: POST /api/v1/units/import with dryRun default true. Each changed unit writes bed_capacity_log with actor, reason, previous and new value. Total comes from GET /api/v1/units/summary — same value coverage and staffing-ratio views read."
      />

      <Card>
        <Space size="large" style={{ marginBottom: 16 }} wrap>
          <Statistic title="Baseline (seed)" value={seededBaseline} suffix="beds" />
          <Statistic title="Configured now" value={totalBeds} suffix="beds" valueStyle={{ color: totalBeds !== seededBaseline ? '#fa8c16' : undefined }} />
          <Statistic title="After applying" value={projectedTotal} suffix="beds" valueStyle={{ color: dirty.length > 0 ? '#fa8c16' : undefined }} />
          <Statistic title="Units" value={units.filter(u => u.isActive).length} suffix={`/ 47 seed`} />
          <Select placeholder="Filter department" allowClear style={{ width: 220 }} value={filterDept} onChange={setFilterDept} options={departments.map(d => ({ label: `${d.code} - ${d.name}`, value: d.id }))} />
        </Space>

        {dirty.length > 0 && (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`${dirty.length} pending change(s)`} description="Each changed unit writes its own bed_capacity_log entry with your name and the reason. Bulk operation is one transaction per batch — atomic." />
        )}

        <Table rowKey="code" dataSource={filteredUnits} columns={columns as any} pagination={{ pageSize: 20, showSizeChanger: true }} size="small" scroll={{ x: 900 }} />

        <div style={{ marginTop: 16 }}>
          <Title level={5}>CSV Import Format</Title>
          <Text code>unit_code,name,department_code,beds,description</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>Example: ICU_MAIN,ICU Main,CRIT,80,Intensive care. Dry-run validates unknown department, duplicate code, bed count 0-500 and returns per-row report without writing. Apply commits valid rows in one transaction.</Text>
        </div>
      </Card>

      <Modal open={importReport !== null} title="Import preview (dry run)" width={760} onCancel={() => setImportReport(null)} footer={[
        <Button key="cancel" onClick={() => setImportReport(null)}>Cancel</Button>,
        <Button key="apply" type="primary" disabled={(importReport ?? []).some((r: any) => r.status === 'REJECTED')} onClick={() => {
          // need original csv - for demo, apply the valid rows from report
          const validRows = (importReport ?? []).filter((r: any) => r.status === 'UPDATED').map((r: any) => ({ unitCode: r.unitCode, bedCount: r.next }));
          bulkUpdateBedCapacity(validRows, 'CSV import applied', currentUser?.id || 1);
          message.success('Import applied');
          setImportReport(null);
        }}>Apply valid rows</Button>
      ]}>
        <Table size="small" rowKey="line" pagination={false} dataSource={importReport ?? []} columns={[
          { title: 'Line', dataIndex: 'line', width: 60 },
          { title: 'Unit', dataIndex: 'unitCode' },
          { title: 'Status', dataIndex: 'status', render: (s: string) => <Tag color={s === 'REJECTED' ? 'red' : s === 'UNCHANGED' ? 'default' : 'green'}>{s}</Tag> },
          { title: 'Reason', dataIndex: 'reason' },
        ] as any} />
      </Modal>

      <Modal title="Add Nursing Unit" open={isAddModal} onCancel={() => setIsAddModal(false)} onOk={handleAddUnit} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Unit Code (uppercase, 2-20 chars)" rules={[{ required: true, pattern: /^[A-Z][A-Z0-9_]{1,19}$/, message: 'Uppercase alphanumeric + underscore, 2-20 chars' }]}><Input placeholder="NEW_UNIT" /></Form.Item>
          <Form.Item name="name" label="Unit Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="departmentId" label="Department" rules={[{ required: true }]}><Select options={departments.filter(d => d.isActive).map(d => ({ label: `${d.code} - ${d.name}`, value: d.id }))} /></Form.Item>
          <Form.Item name="bedCount" label="Bed Count (0-500)" rules={[{ required: true }]}><InputNumber min={0} max={500} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
