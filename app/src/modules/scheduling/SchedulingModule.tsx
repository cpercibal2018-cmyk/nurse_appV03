import React, { useState } from 'react';
import { Card, Table, Tag, Button, Space, Typography, Alert, Modal, Form, Select, DatePicker, Input, message, Badge, Descriptions, List } from 'antd';
import { ScheduleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useStore } from '../../lib/store';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function SchedulingModule() {
  const { shiftAssignments, employees, units, eligibilityStates, addShiftAssignment, publishAssignments, refreshEligibility } = useStore();
  const [isModal, setIsModal] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [form] = Form.useForm();

  const handleAdd = async () => {
    try {
      const values = await form.validateFields();
      addShiftAssignment({
        employeeId: values.employeeId,
        unitId: values.unitId,
        shiftDate: values.shiftDate.format('YYYY-MM-DD'),
        shiftName: values.shiftName,
        startTime: values.startTime,
        endTime: values.endTime,
        status: 'Draft',
      });
      message.success('Shift assignment created as Draft — calls eligibility before save');
      setIsModal(false);
      form.resetFields();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handlePublish = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Select assignments to publish');
      return;
    }
    const result = publishAssignments(selectedRowKeys);
    if (result.failed.length > 0) {
      Modal.warning({
        title: `Published ${result.success}, Failed ${result.failed.length}`,
        content: <List size="small" dataSource={result.failed} renderItem={f => <List.Item><Text style={{ fontSize: 12 }}>{f.id}: {f.reason}</Text></List.Item>} />,
        width: 600,
      });
    } else {
      message.success(`Published ${result.success} assignments — canonical re-validation inside transaction passed`);
    }
    setSelectedRowKeys([]);
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Date', dataIndex: 'shiftDate', key: 'shiftDate', width: 110, sorter: (a: any, b: any) => a.shiftDate.localeCompare(b.shiftDate) },
    { title: 'Shift', dataIndex: 'shiftName', key: 'shiftName', width: 100, render: (s: string) => <Tag color={s === 'Morning' ? 'blue' : s === 'Evening' ? 'orange' : 'purple'}>{s}</Tag> },
    { title: 'Employee', key: 'emp', render: (_: any, r: any) => { const e = employees.find(ee => ee.id === r.employeeId); return e ? `${e.name} (${e.position})` : r.employeeId; } },
    { title: 'Unit', key: 'unit', render: (_: any, r: any) => { const u = units.find(uu => uu.id === r.unitId); return u ? <Tag>{u.code}</Tag> : r.unitId; } },
    { title: 'Time', key: 'time', render: (_: any, r: any) => `${r.startTime} - ${r.endTime}` },
    {
      title: 'Eligibility', key: 'elig', render: (_: any, r: any) => {
        const e = eligibilityStates.find(es => es.employeeId === r.employeeId);
        if (!e) return <Tag>Unknown</Tag>;
        return <Tag color={e.status === 'ELIGIBLE' ? 'green' : e.status === 'ELIGIBLE_WITH_GRACE' ? 'orange' : 'red'}>{e.status}</Tag>;
      }
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 100, render: (s: string) => <Tag color={s === 'Published' ? 'green' : 'default'}>{s}</Tag> },
  ];

  const draftCount = shiftAssignments.filter(s => s.status === 'Draft').length;
  const publishedCount = shiftAssignments.filter(s => s.status === 'Published').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}><ScheduleOutlined /> Scheduling — Draft, Publication Guard, Coverage</Title>
        <Space>
          <Button onClick={() => setIsModal(true)}>Add Assignment</Button>
          <Button type="primary" icon={<CheckCircleOutlined />} disabled={selectedRowKeys.length === 0} onClick={handlePublish}>Publish Selected ({selectedRowKeys.length})</Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Scheduling with Eligibility Guard (Section 6.2-6.3)"
        description="Draft assignment → publication with eligibility guard. Scheduling depends on Eligibility.service (calls before save/publish). Publication re-validates candidates against canonical engine inside publication transaction (V39 materialized state serves pool/dashboard reads, but publish uses canonical). Coverage targets per unit per shift, bed_count informs staffing ratio but doesn't auto-enforce nurse-to-bed ratio. Future published assignments demoted to draft when position schedulability toggled."
      />

      <Space style={{ marginBottom: 16 }}>
        <Badge count={draftCount} showZero><Card size="small">Draft</Card></Badge>
        <Badge count={publishedCount} showZero color="green"><Card size="small">Published</Card></Badge>
        <Text type="secondary">Select draft assignments and publish — ineligible employees blocked unless waiver exists. Grace shows ELIGIBLE_WITH_GRACE indicator.</Text>
      </Space>

      <Card>
        <Table
          rowKey="id"
          dataSource={shiftAssignments}
          columns={columns as any}
          rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as number[]), getCheckboxProps: (record: any) => ({ disabled: record.status === 'Published' }) }}
          pagination={{ pageSize: 15 }}
          size="small"
          scroll={{ x: 900 }}
        />

        <div style={{ marginTop: 16 }}>
          <Title level={5}>Coverage Monitoring (Section 6.3)</Title>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Coverage Targets">Configured per unit per shift — e.g., ICU_MAIN Morning: 10 nurses, Evening: 8, Night: 6. Bed count 79 informs staffing ratio calculations.</Descriptions.Item>
            <Descriptions.Item label="Publication Guard">Before publishing, calls eligibilityService for each candidate. If ineligible and no waiver/grace, blocks with reason. If eligible_with_grace, publishes with grace indicator visible to staff.</Descriptions.Item>
            <Descriptions.Item label="Attendance Gap Detection">Compares planned (published assignments) vs actual (attendance_events CLOCK_IN). Every 15min worker: if scheduled but not clocked in within 30min of shift start → Critical Coverage Alert to supervisor via push.</Descriptions.Item>
          </Descriptions>
        </div>
      </Card>

      <Modal title="Add Shift Assignment — Eligibility Checked Before Save" open={isModal} onCancel={() => setIsModal(false)} onOk={handleAdd} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="employeeId" label="Employee" rules={[{ required: true }]}><Select showSearch options={employees.filter(e => !(e as any).deletedAt).map(e => ({ label: `${e.name} (${e.jobNumber}) - ${e.position} - ${units.find(u => u.id === e.unitId)?.code}`, value: e.id }))} /></Form.Item>
          <Form.Item name="unitId" label="Unit" rules={[{ required: true }]}><Select showSearch options={units.filter(u => u.isActive).map(u => ({ label: `${u.code} - ${u.name} (${u.bedCount} beds)`, value: u.id }))} /></Form.Item>
          <Form.Item name="shiftDate" label="Shift Date" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Space>
            <Form.Item name="shiftName" label="Shift" rules={[{ required: true }]}><Select style={{ width: 120 }} options={[{ label: 'Morning', value: 'Morning' }, { label: 'Evening', value: 'Evening' }, { label: 'Night', value: 'Night' }]} /></Form.Item>
            <Form.Item name="startTime" label="Start" rules={[{ required: true }]}><Input placeholder="07:00" /></Form.Item>
            <Form.Item name="endTime" label="End" rules={[{ required: true }]}><Input placeholder="15:00" /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
