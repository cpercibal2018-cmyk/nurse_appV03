import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Tag, Space, Input, Select, Modal, Form, message, Typography, Alert, Tooltip, Badge, Row, Col, DatePicker, InputNumber } from 'antd';
import { PlusOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import { useStore } from '../../lib/store';
import { toHijri, toHijriShort, toHijriIso } from '../../lib/hijri';

const { Title, Text } = Typography;

// Picklist values. Kept module-level so the onboarding form, the table filters
// and any future edit form all offer the same closed set.
const NATIONALITIES = ['Saudi', 'Egyptian', 'Pakistani', 'Filipino', 'Indian', 'Jordanian', 'Sudanese', 'Syrian', 'Yemeni', 'American', 'British', 'Canadian', 'Australian', 'South African', 'Other']
  .map(n => ({ label: n, value: n }));

const MARITAL_STATUSES = [
  { label: 'Single', value: 'Single' },
  { label: 'Married', value: 'Married' },
  { label: 'Others', value: 'Others' },
];

export default function WorkforcePage() {
  const { employees, units, positions, contracts, credentials, eligibilityStates, addEmployee, deleteEmployee } = useStore();
  const [search, setSearch] = useState('');
  const [filterUnit, setFilterUnit] = useState<number | undefined>();
  const [filterPosition, setFilterPosition] = useState<string | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  // Auto Full Name = First + Middle + Last
  const firstName = Form.useWatch('firstName', form);
  const middleName = Form.useWatch('middleName', form);
  const lastName = Form.useWatch('lastName', form);
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const contractStartWatch = Form.useWatch('contractStart', form);
  const contractEndWatch = Form.useWatch('contractEnd', form);

  // Full Name is derived, never typed: it is recomputed on every keystroke of
  // First / Middle / Last and written back into the read-only field. Clearing
  // the names clears it too, so it can never hold a stale value.
  useEffect(() => {
    form.setFieldsValue({ fullName });
  }, [fullName, form]);

  const filtered = employees.filter(e => {
    if ((e as any).deletedAt) return false;
    if (search && !(`${e.name} ${e.jobNumber} ${e.contactEmail} ${(e as any).firstName} ${(e as any).lastName} ${(e as any).jobTitle} ${(e as any).fileNo} ${(e as any).nationality}`.toLowerCase().includes(search.toLowerCase()))) return false;
    if (filterUnit && e.unitId !== filterUnit) return false;
    if (filterPosition && e.position !== filterPosition) return false;
    return true;
  });

  const handleOnboard = async () => {
    try {
      const values = await form.validateFields();
      const id = addEmployee({
        firstName: values.firstName,
        middleName: values.middleName,
        lastName: values.lastName,
        name: values.fullName || [values.firstName, values.middleName, values.lastName].filter(Boolean).join(' '),
        jobNumber: values.jobNumber,
        jobTitle: values.jobTitle,
        fileNo: values.fileNo,
        rankGrade: values.rankGrade,
        nationality: values.nationality,
        jobPostLocation: values.jobPostLocation,
        actualWorkPlace: values.actualWorkPlace,
        specialty: values.specialty,
        maritalStatus: values.maritalStatus,
        salary: values.salary,
        unitId: values.unitId,
        position: values.position,
        contactEmail: values.contactEmail,
        status: 'Active',
        hireDate: new Date().toISOString().split('T')[0],
        contractStart: values.contractStart.format('YYYY-MM-DD'),
        contractEnd: values.contractEnd.format('YYYY-MM-DD'),
        contractStartHijri: toHijriIso(values.contractStart),
        contractEndHijri: toHijriIso(values.contractEnd),
      } as any);
      message.success(`Employee onboarded — ID ${id} — Full Name auto = First+Middle+Last, Job Number ${values.jobNumber}, contract ${toHijriIso(values.contractStart)} → ${toHijriIso(values.contractEnd)} هـ`);
      setIsModalOpen(false);
      form.resetFields();
    } catch (err: any) {
      message.error(err.message || 'Onboarding failed - transaction rolled back');
    }
  };

  const columns = [
    { title: 'Job Number', dataIndex: 'jobNumber', key: 'jobNumber', width: 100, sorter: (a: any, b: any) => String(a.jobNumber).localeCompare(String(b.jobNumber)), render: (jn: string) => <Tag color="blue">{jn}</Tag> },
    { title: 'Full Name', key: 'fullName', width: 180, render: (_: any, r: any) => <><Text strong>{r.name}</Text><br /><Text style={{ fontSize: 10 }} type="secondary">{r.firstName} {r.middleName || ''} {r.lastName}</Text></>, sorter: (a: any, b: any) => a.name.localeCompare(b.name) },
    { title: 'Job Title', dataIndex: 'jobTitle', key: 'jobTitle', width: 130, render: (t: string) => t || '-' },
    { title: 'File No.', dataIndex: 'fileNo', key: 'fileNo', width: 100 },
    { title: 'Rank/Grade', dataIndex: 'rankGrade', key: 'rankGrade', width: 100 },
    { title: 'Nationality', dataIndex: 'nationality', key: 'nationality', width: 100 },
    { title: 'Job Post (City)', dataIndex: 'jobPostLocation', key: 'jobPostLocation', width: 120 },
    { title: 'Actual Work Place', dataIndex: 'actualWorkPlace', key: 'actualWorkPlace', width: 130 },
    { title: 'Specialty', dataIndex: 'specialty', key: 'specialty', width: 120 },
    {
      title: 'Contract Start (Greg + Hijri)', key: 'contractStart', width: 180,
      render: (_: any, r: any) => {
        const c = contracts.find(cc => cc.employeeId === r.id && (cc.status === 'Active' || cc.status === 'Approved'));
        if (!c) return <Tag color="red">No coverage</Tag>;
        return <><Text style={{ fontSize: 11 }}>{c.startDate}</Text><br /><Text style={{ fontSize: 10 }} type="secondary">{c.startDateHijri || toHijriShort(c.startDate)} هـ</Text></>;
      }
    },
    {
      title: 'Contract End (Greg + Hijri)', key: 'contractEnd', width: 180,
      render: (_: any, r: any) => {
        const c = contracts.find(cc => cc.employeeId === r.id && (cc.status === 'Active' || cc.status === 'Approved'));
        if (!c) return '-';
        return <><Text style={{ fontSize: 11 }}>{c.endDate}</Text><br /><Text style={{ fontSize: 10 }} type="secondary">{c.endDateHijri || toHijriShort(c.endDate)} هـ</Text></>;
      }
    },

    // Marital Status and Salary follow Contract End — same order as the onboarding form
    { title: 'Marital Status', dataIndex: 'maritalStatus', key: 'maritalStatus', width: 110, render: (s: string) => s ? <Tag>{s}</Tag> : '-' },
    { title: 'Salary (SAR)', dataIndex: 'salary', key: 'salary', width: 120, render: (sal: number) => typeof sal === 'number' ? `${sal.toLocaleString('en-US')} SAR` : '-', sorter: (a: any, b: any) => (a.salary || 0) - (b.salary || 0) },
    {
      title: 'Position', dataIndex: 'position', key: 'position', width: 100,
      render: (pos: string) => {
        const p = positions.find(pp => pp.code === pos);
        return <Tag color={p?.isSchedulable ? 'blue' : 'default'}>{pos}</Tag>;
      }
    },
    {
      title: 'Eligibility', key: 'eligibility', width: 110, render: (_: any, r: any) => {
        const e = eligibilityStates.find(es => es.employeeId === r.id);
        if (!e) return <Tag>Unknown</Tag>;
        const color = e.status === 'ELIGIBLE' ? 'green' : e.status === 'ELIGIBLE_WITH_GRACE' ? 'orange' : 'red';
        return <Tooltip title={e.reasons.join(', ') || 'Eligible'}><Tag color={color}>{e.status}</Tag></Tooltip>;
      }
    },
    {
      title: 'Actions', key: 'actions', width: 80, fixed: 'right' as any, render: (_: any, r: any) => (
        <Space>
          <Button size="small" danger onClick={() => {
            Modal.confirm({
              title: 'Soft delete employee?',
              content: `Employee ${r.name} (${r.jobNumber}) will be marked deleted but remain in audit history.`,
              onOk: () => { deleteEmployee(r.id); message.success('Employee soft-deleted'); }
            });
          }}>Delete</Button>
        </Space>
      )
    }
  ];

  const activePositions = positions.filter(p => p.isActive);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}><TeamOutlined /> Workforce — Demo Employee (Job Number plain, First+Middle+Last → Full Name Auto, Hijri Dates)</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setIsModalOpen(true); }}>Onboard Employee</Button>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Demo Employee — Job Number plain format (no AIGH-), First+Middle+Last → Full Name Auto, Contract Hijri Dates"
        description="Job Number is plain numbers or text+number combination (e.g. 1001, 2003, AIGH1002, EMP2004, NUR4008) — no AIGH- prefix, unique per employee, from contract to be entered. Full Name = First Name + Middle Name + Last Name automatic when user fills fields. After Job Number fields in order: Job Title, File No., Rank/Grade, Nationality, Job Post (Location Assignment) City, Actual Work Place, Specialty, Contract Start (Hijri conversion Gregorian→Hijri), Contract End (Hijri), Marital Status (Single/Married/Others), Salary SAR. Contract Start/End required Hijri Date with conversion shown via Intl islamic-umalqura calendar."
      />

      <Card>
        <Space style={{ marginBottom: 16, flexWrap: 'wrap' }} size="middle">
          <Input placeholder="Search name, job number, file no, nationality" prefix={<SearchOutlined />} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 300 }} allowClear />
          <Select placeholder="Filter by unit" allowClear style={{ width: 180 }} value={filterUnit} onChange={setFilterUnit} options={units.filter(u => u.isActive).map(u => ({ label: `${u.code}`, value: u.id }))} showSearch />
          <Select placeholder="Filter by position" allowClear style={{ width: 180 }} value={filterPosition} onChange={setFilterPosition} options={activePositions.map(p => ({ label: `${p.code}`, value: p.code }))} showSearch />
          <Text type="secondary">{filtered.length} / {employees.filter(e => !(e as any).deletedAt).length} employees</Text>
        </Space>

        <Table rowKey="id" dataSource={filtered} columns={columns as any} pagination={{ pageSize: 10, showSizeChanger: true }} size="small" scroll={{ x: 1800 }} />
      </Card>

      <Modal
        title="Onboard New Employee — Demo (Job Number plain, First+Middle+Last → Full Name Auto, Hijri Dates)"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleOnboard}
        okText="Onboard Atomically"
        width={900}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Demo Employee — Job Number plain + Auto Full Name + Hijri Conversion" description="Job Number plain numbers or text+number combination (no AIGH- prefix) — e.g. 1001, AIGH1002. Full Name auto = First + Middle + Last. Contract Start/End show Gregorian + Hijri conversion via Intl islamic-umalqura." />

          <Row gutter={16}>
            <Col span={8}><Form.Item name="firstName" label="First Name" rules={[{ required: true, message: 'First Name required' }]}><Input placeholder="Sarah" /></Form.Item></Col>
            <Col span={8}><Form.Item name="middleName" label="Middle Name"><Input placeholder="Ahmed (optional)" /></Form.Item></Col>
            <Col span={8}><Form.Item name="lastName" label="Last Name" rules={[{ required: true, message: 'Last Name required' }]}><Input placeholder="Al-Harbi" /></Form.Item></Col>
          </Row>

          <Form.Item name="fullName" label="Full Name (Auto = First + Middle + Last)" extra="Automatic when user fills First, Middle, Last — read-only, computed.">
            <Input value={fullName} readOnly placeholder="Auto computed" style={{ background: '#f5f5f5', fontWeight: 'bold' }} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="jobNumber" label="Job Number (from Contract — Unique)" extra="Plain format — plain numbers or text+number combination (e.g. 1001, 2003, AIGH1002, EMP2004), no AIGH- prefix, unique, from contract to be entered." rules={[{ required: true, message: 'Job Number required — plain format' }]}><Input placeholder="1001 or AIGH1002 or EMP2004" /></Form.Item>
            </Col>
            <Col span={8}><Form.Item name="jobTitle" label="Job Title" rules={[{ required: true, message: 'Job Title required' }]}><Input placeholder="Registered Nurse" /></Form.Item></Col>
            <Col span={8}><Form.Item name="fileNo" label="File No." rules={[{ required: true }]}><Input placeholder="F-1001" /></Form.Item></Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}><Form.Item name="rankGrade" label="Rank/Grade" rules={[{ required: true }]}><Input placeholder="Grade 7" /></Form.Item></Col>
            <Col span={8}><Form.Item name="nationality" label="Nationality" rules={[{ required: true }]}><Select showSearch placeholder="Select nationality" options={NATIONALITIES} /></Form.Item></Col>
            <Col span={8}><Form.Item name="jobPostLocation" label="Job Post (Location Assignment) - City" rules={[{ required: true }]}><Input placeholder="Buraydah" /></Form.Item></Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}><Form.Item name="actualWorkPlace" label="Actual Work Place" rules={[{ required: true }]}><Input placeholder="ICU Main" /></Form.Item></Col>
            <Col span={12}><Form.Item name="specialty" label="Specialty" rules={[{ required: true }]}><Input placeholder="Critical Care" /></Form.Item></Col>
          </Row>

          {/* Contract Start / Contract End — required Hijri dates. The picker takes the
              Gregorian date and the Umm al-Qura equivalent is converted and shown; both
              representations are stored (see addEmployee). */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contractStart" label="Contract Start — Required Hijri Date" rules={[{ required: true, message: 'Contract Start is required' }]} extra={contractStartWatch ? `Hijri: ${toHijri(contractStartWatch)}` : 'Enter the Gregorian date — the Hijri (Umm al-Qura) equivalent is converted automatically'}>
                <DatePicker style={{ width: '100%' }} placeholder="Select start date" />
              </Form.Item>
              {contractStartWatch && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={`Hijri: ${toHijri(contractStartWatch)}`} description={`Recorded as ${toHijriIso(contractStartWatch)} هـ  ·  ${contractStartWatch.format('YYYY-MM-DD')}`} />}
            </Col>
            <Col span={12}>
              <Form.Item name="contractEnd" label="Contract End — Required Hijri Date" rules={[{ required: true, message: 'Contract End is required' }]} extra={contractEndWatch ? `Hijri: ${toHijri(contractEndWatch)}` : 'Enter the Gregorian date — the Hijri (Umm al-Qura) equivalent is converted automatically'}>
                <DatePicker style={{ width: '100%' }} placeholder="Select end date" />
              </Form.Item>
              {contractEndWatch && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={`Hijri: ${toHijri(contractEndWatch)}`} description={`Recorded as ${toHijriIso(contractEndWatch)} هـ  ·  ${contractEndWatch.format('YYYY-MM-DD')}`} />}
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}><Form.Item name="maritalStatus" label="Marital Status" rules={[{ required: true }]}><Select placeholder="Select" options={MARITAL_STATUSES} /></Form.Item></Col>
            <Col span={12}><Form.Item name="salary" label="Salary — Amount in Saudi Riyals" rules={[{ required: true, message: 'Salary required' }]}><InputNumber style={{ width: '100%' }} min={0} placeholder="8500" addonAfter="SAR" /></Form.Item></Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}><Form.Item name="unitId" label="Nursing Unit (FK)" rules={[{ required: true }]}><Select showSearch options={units.filter(u => u.isActive).map(u => ({ label: `${u.code} - ${u.name}`, value: u.id }))} /></Form.Item></Col>
            <Col span={8}><Form.Item name="position" label="Position (FK active only)" rules={[{ required: true }]}><Select showSearch options={activePositions.map(p => ({ label: `${p.code} - ${p.fullTitle}`, value: p.code }))} /></Form.Item></Col>
            <Col span={8}><Form.Item name="contactEmail" label="Contact Email" rules={[{ required: true, type: 'email' }]}><Input placeholder="name@aigh.sa" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
