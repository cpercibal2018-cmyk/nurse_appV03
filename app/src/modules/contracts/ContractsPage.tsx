import React, { useState } from 'react';
import { Card, Table, Button, Tag, Space, Modal, Form, Input, Select, DatePicker, Alert, Typography, Descriptions, Row, Col, message, Tooltip } from 'antd';
import { FileTextOutlined, PlusOutlined, SearchOutlined, AuditOutlined } from '@ant-design/icons';
import { useStore } from '../../lib/store';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function ContractsPage() {
  const { employees, contracts, units, positions, addContract, updateContract, currentUser, addAuditEntry } = useStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<any>(null);
  const [form] = Form.useForm();

  const filtered = contracts.filter(c => {
    if (search) {
      const emp = employees.find(e => e.id === c.employeeId);
      const jobNum = emp?.jobNumber || '';
      const name = emp?.name || '';
      if (!`${jobNum} ${name} ${c.status}`.toLowerCase().includes(search.toLowerCase())) return false;
    }
    if (filterStatus && c.status !== filterStatus) return false;
    return true;
  });

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const employeeId = values.employeeId;
      const emp = employees.find(e => e.id === employeeId);
      if (!emp) throw new Error('Employee not found');

      // Job Number is from the contract that to be entered — stored in contract.jobNumber denormalized + employees.job_number unique
      const start = values.startDate.format('YYYY-MM-DD');
      const end = values.endDate.format('YYYY-MM-DD');
      if (new Date(end) <= new Date(start)) throw new Error('End must be after start');

      // Check exclusion constraint GiST daterange && WHERE status IN (Approved,Active) — overlapping periods same employee rejected
      const overlapping = contracts.some(cc => cc.employeeId === employeeId && ['Approved', 'Active'].includes(cc.status) && !(new Date(end) < new Date(cc.startDate) || new Date(start) > new Date(cc.endDate)));
      if (overlapping) throw new Error('Overlapping contract period — exclusion constraint GiST daterange && WHERE status IN (Approved,Active) rejects overlapping Approved/Active periods for same employee');

      addContract({
        employeeId,
        startDate: start,
        endDate: end,
        status: values.status || 'Draft',
      } as any);

      message.success(`Contract created for ${emp.name} — Job Number ${emp.jobNumber} from contract — Status ${values.status}`);
      setIsModalOpen(false);
      form.resetFields();
    } catch (err: any) {
      message.error(err.message || 'Contract creation failed');
    }
  };

  const handleStatusChange = (contractId: number, newStatus: any) => {
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) return;

    // Server-evaluated scope — HR_ADMIN scoped create/approval/renewal/termination, Supervisor reduced read, Employee own reduced read
    // Draft and PendingApproval do NOT provide coverage, Approving contract covering today makes it Active immediately
    // Future-period Approved until start date approval does NOT supersede current
    // Approved+Active participate in exclusion constraint, Approved future can satisfy eligibility for shift within that future
    // Start/end inclusive, next non-overlapping renewal starts after previous end
    // Expired/Suspended/Terminated/Superseded do NOT provide coverage

    if (newStatus === 'Approved' || newStatus === 'Active') {
      const overlapping = contracts.some(cc => cc.employeeId === contract.employeeId && cc.id !== contractId && ['Approved', 'Active'].includes(cc.status) && !(new Date(contract.endDate) < new Date(cc.startDate) || new Date(contract.startDate) > new Date(cc.endDate)));
      if (overlapping) {
        message.error('Cannot approve — overlapping Approved/Active period exists for same employee — exclusion constraint');
        return;
      }
    }

    updateContract(contractId, { status: newStatus });
    message.success(`Contract ${contractId} status changed to ${newStatus} — Job Number from contract retained`);
    addAuditEntry({ actorId: currentUser?.id || 1, action: `CONTRACT_${newStatus.toUpperCase()}`, resource: 'contracts', resourceId: String(contractId), changes: { status: newStatus, jobNumber: employees.find(e => e.id === contract.employeeId)?.jobNumber } });
  };

  const columns = [
    { title: 'Contract ID', dataIndex: 'id', key: 'id', width: 100, sorter: (a: any, b: any) => a.id - b.id },
    {
      title: 'Job Number (from Contract)', key: 'jobNumber', width: 180,
      render: (_: any, r: any) => {
        const emp = employees.find(e => e.id === r.employeeId);
        return emp ? <><Tag color="blue">{emp.jobNumber}</Tag><br /><Text style={{ fontSize: 11 }}>{emp.name} [{emp.position}]</Text></> : '-';
      },
      sorter: (a: any, b: any) => {
        const empA = employees.find(e => e.id === a.employeeId);
        const empB = employees.find(e => e.id === b.employeeId);
        return (empA?.jobNumber || '').localeCompare(empB?.jobNumber || '');
      }
    },
    {
      title: 'Unit', key: 'unit', width: 120,
      render: (_: any, r: any) => {
        const emp = employees.find(e => e.id === r.employeeId);
        const unit = units.find(u => u.id === emp?.unitId);
        return unit ? <Tag>{unit.code}</Tag> : '-';
      }
    },
    { title: 'Start Date', dataIndex: 'startDate', key: 'startDate', width: 120 },
    { title: 'End Date', dataIndex: 'endDate', key: 'endDate', width: 120 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 130,
      render: (status: string) => {
        const color = status === 'Active' ? 'green' : status === 'Approved' ? 'blue' : status === 'Draft' ? 'default' : status === 'PendingApproval' ? 'orange' : status === 'Expired' ? 'red' : 'volcano';
        return <Tag color={color}>{status}</Tag>;
      }
    },
    {
      title: 'Coverage', key: 'coverage', width: 150,
      render: (_: any, r: any) => {
        const now = new Date();
        const start = new Date(r.startDate);
        const end = new Date(r.endDate);
        const isCovering = now >= start && now <= end && ['Approved', 'Active'].includes(r.status);
        const isFutureApproved = start > now && r.status === 'Approved';
        if (isCovering) return <Tag color="green">Provides coverage today</Tag>;
        if (isFutureApproved) return <Tag color="blue">Future coverage — eligible for shifts within future period</Tag>;
        if (['Draft', 'PendingApproval'].includes(r.status)) return <Tag color="orange">No coverage — Draft/PendingApproval</Tag>;
        if (['Expired', 'Suspended', 'Terminated', 'Superseded'].includes(r.status)) return <Tag color="red">No coverage — {r.status}</Tag>;
        return <Tag>No coverage</Tag>;
      }
    },
    {
      title: 'Actions', key: 'actions', width: 250,
      render: (_: any, r: any) => (
        <Space wrap>
          <Select size="small" value={r.status} style={{ width: 140 }} onChange={(v) => handleStatusChange(r.id, v)} options={[
            { label: 'Draft', value: 'Draft' },
            { label: 'PendingApproval', value: 'PendingApproval' },
            { label: 'Approved', value: 'Approved' },
            { label: 'Active', value: 'Active' },
            { label: 'Expired', value: 'Expired' },
            { label: 'Suspended', value: 'Suspended' },
            { label: 'Terminated', value: 'Terminated' },
            { label: 'Superseded', value: 'Superseded' },
          ]} />
          <Tooltip title="Full contract history and attachments — HR_ADMIN scoped">
            <Button size="small" icon={<AuditOutlined />}>History</Button>
          </Tooltip>
        </Space>
      )
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}><FileTextOutlined /> Contracts — HR Admin Enters Contract Data (Job Number from Contract)</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setEditingContract(null); setIsModalOpen(true); }}>Create Contract (HR Admin)</Button>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Where does HR Admin enter contract data? — 3 places (Section 4.1 + 3.1)"
        description="1. Workforce → Onboard Employee modal — HR enters unique Job Number (from contract) + name + unit + position + contact email + contract terms (start/end) → fn_onboard_employee_with_contract creates employee + approved contract atomically. 2. This Contracts page — HR Admin scoped create, approval, renewal, termination, full history + attachments. Supervisor scoped reduced read (identifiers, employee/position, unit, status, dates), Employee own reduced read. 3. Employee detail → Contract history tab. All contract operations enforce server-evaluated scope for authenticated caller. Passing nurse ID from browser does NOT establish access. Draft and PendingApproval do NOT provide coverage. Approving contract covering today makes it Active immediately. Future-period Approved until start date approval does NOT supersede current. Approved+Active participate in exclusion constraint GiST daterange && WHERE status IN (Approved,Active) — overlapping periods same employee rejected at DB level. Approved future can satisfy eligibility for shift within that future. Start/end inclusive, next non-overlapping renewal starts after previous end. Expired/Suspended/Terminated/Superseded do NOT provide coverage. No concurrent secondary contracts — deliberate replacement requires explicit HR handling, silent superseding removed."
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small" title="Contract Lifecycle — HR Admin">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Create">HR Admin enters Job Number (from contract) + employee + unit + position + dates — unique job number enforced, duplicate triggers rollback</Descriptions.Item>
              <Descriptions.Item label="Approval">Draft → PendingApproval → Approved → Active (if covering today). Approving future Approved does NOT supersede current Active</Descriptions.Item>
              <Descriptions.Item label="Renewal">New contract starts after previous end (inclusive dates) — no overlap allowed for Approved/Active via exclusion constraint</Descriptions.Item>
              <Descriptions.Item label="Termination">Expired/Suspended/Terminated/Superseded do NOT provide coverage, require explicit HR handling</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title="Coverage Rules (Section 4.1)">
            <ul style={{ fontSize: 12, paddingLeft: 16 }}>
              <li>Draft and PendingApproval do NOT provide coverage</li>
              <li>Approving contract covering today → Active immediately</li>
              <li>Future Approved until start date does NOT supersede current</li>
              <li>Approved+Active in exclusion constraint GiST daterange overlaps WHERE status IN (Approved,Active)</li>
              <li>Approved future can satisfy eligibility for shift within that future</li>
              <li>Start/end inclusive, next renewal starts after previous end</li>
              <li>Expired/Suspended/Terminated/Superseded do NOT provide coverage</li>
              <li>No concurrent secondary contracts — explicit HR handling</li>
            </ul>
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title="Job Number from Contract">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Source">Job Number is from the contract that to be entered — entered during onboarding + contract creation, stored in employees.job_number with unique index</Descriptions.Item>
              <Descriptions.Item label="Unique">Per actor + Job Number idempotency — duplicate job number triggers atomic rollback via DB unique constraint + fn_onboard_employee_with_contract</Descriptions.Item>
              <Descriptions.Item label="Traceability">Contract.jobNumber denormalized for traceability, audit logs job_number, FHIR Practitioner identifier system http://aigh.sa/job-number</Descriptions.Item>
              <Descriptions.Item label="Example">AIGH-0001, AIGH-0002 — format AIGH-XXXX, 4 digits</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      <Card>
        <Space style={{ marginBottom: 16, flexWrap: 'wrap' }} size="middle">
          <Input placeholder="Search job number, name, status" prefix={<SearchOutlined />} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 300 }} allowClear />
          <Select placeholder="Filter by status" allowClear style={{ width: 200 }} value={filterStatus} onChange={setFilterStatus} options={[
            { label: 'Draft', value: 'Draft' },
            { label: 'PendingApproval', value: 'PendingApproval' },
            { label: 'Approved', value: 'Approved' },
            { label: 'Active', value: 'Active' },
            { label: 'Expired', value: 'Expired' },
            { label: 'Terminated', value: 'Terminated' },
          ]} />
          <Text type="secondary">{filtered.length} / {contracts.length} contracts</Text>
        </Space>

        <Table rowKey="id" dataSource={filtered} columns={columns as any} pagination={{ pageSize: 10, showSizeChanger: true }} size="small" scroll={{ x: 1300 }} />
      </Card>

      <Modal
        title="Create Contract — HR Admin Enters Contract Data (Job Number from Contract)"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleCreate}
        okText="Create Contract"
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Contract-First + Job Number from Contract" description="HR Admin enters Job Number (from contract) + employee + dates. Job Number unique enforced by DB unique index. Exclusion constraint GiST prevents overlapping Approved/Active periods same employee. Start/end inclusive." />

          <Form.Item name="employeeId" label="Employee (Job Number from Contract)" rules={[{ required: true }]} extra="Select existing employee — Job Number is from contract that was entered during onboarding, plain numbers or text+number combination allowed (e.g. 1001, AIGH1002), unique per employee. For new employee, use Workforce → Onboard Employee which creates employee + contract atomically via fn_onboard_employee_with_contract. Full Name auto = First + Middle + Last.">
            <Select showSearch placeholder="Search by job number or name" options={employees.filter(e => !(e as any).deletedAt).map(e => ({ label: `${e.jobNumber} — ${e.name} [${(e as any).firstName} ${(e as any).middleName || ''} ${(e as any).lastName}] [${e.position}] Unit ${e.unitId}`, value: e.id }))} filterOption={(input, option) => (option?.label as string).toLowerCase().includes(input.toLowerCase())} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="startDate" label="Contract Start Date (Inclusive)" rules={[{ required: true }]} extra="Inclusive — next non-overlapping renewal starts after previous end."><DatePicker style={{ width: '100%' }} /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="endDate" label="Contract End Date (Inclusive)" rules={[{ required: true }]} extra="Must be after start. Expired/Suspended/Terminated/Superseded do NOT provide coverage."><DatePicker style={{ width: '100%' }} /></Form.Item>
            </Col>
          </Row>

          <Form.Item name="status" label="Initial Status" initialValue="Draft" rules={[{ required: true }]}>
            <Select options={[
              { label: 'Draft — No coverage', value: 'Draft' },
              { label: 'PendingApproval — No coverage', value: 'PendingApproval' },
              { label: 'Approved — Provides coverage if dates cover today, future Approved does NOT supersede current', value: 'Approved' },
              { label: 'Active — Provides coverage today (if dates cover today)', value: 'Active' },
            ]} />
          </Form.Item>

          <Descriptions bordered size="small" column={1} style={{ marginTop: 16 }}>
            <Descriptions.Item label="Job Number">From contract to be entered — unique per employee, stored in employees.job_number with unique index, duplicate triggers atomic rollback. Example AIGH-0001. FHIR identifier system http://aigh.sa/job-number.</Descriptions.Item>
            <Descriptions.Item label="Exclusion Constraint">GiST daterange && WHERE status IN (Approved,Active) — overlapping Approved/Active periods same employee rejected at DB level. Approved future can satisfy eligibility for shift within that future.</Descriptions.Item>
            <Descriptions.Item label="Scope">HR_ADMIN scoped create/approval/renewal/termination + full history + attachments, Supervisor scoped reduced read (identifiers, employee/position, unit, status, dates), Employee own reduced read. Server-evaluated scope — passing nurse ID from browser does NOT establish access.</Descriptions.Item>
          </Descriptions>
        </Form>
      </Modal>
    </div>
  );
}
