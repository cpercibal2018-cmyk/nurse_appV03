import React, { useState } from 'react';
import { Card, Table, Button, Tag, Space, Modal, Form, Input, Select, DatePicker, Alert, Typography, Descriptions, Row, Col, message, Tooltip, Upload } from 'antd';
import { FileTextOutlined, PlusOutlined, SearchOutlined, AuditOutlined, UploadOutlined, DownloadOutlined, FilePdfOutlined, InboxOutlined, PaperClipOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { useStore, getContractCopyBytes, MAX_CONTRACT_COPY_BYTES } from '../../lib/store';
import dayjs from 'dayjs';
import { toHijri, toHijriShort } from '../../lib/hijri';
import { latestContractFor, renewalPeriodAfter, checkContractCopyCandidate, CONTRACT_COPY_ACCEPT, PDF_MAGIC } from '../../lib/contracts';

const { Title, Text } = Typography;

export default function ContractsPage() {
  const { employees, contracts, units, positions, addContract, attachContractCopy, updateContract, currentUser, addAuditEntry } = useStore();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<any>(null);
  const [attachModal, setAttachModal] = useState<{ open: boolean; contractId: number | null }>({ open: false, contractId: null });
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [form] = Form.useForm();

  // Renew Contract is a separate, slimmer flow for an employee who already has a
  // contract on record. It shares the store guards with Create, but its own
  // modal/form/state keep the two from stepping on each other.
  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [renewForm] = Form.useForm();
  const [renewCopy, setRenewCopy] = useState<File | null>(null);

  // Live Gregorian → Hijri (Umm al-Qura) conversion for the contract date pickers
  const startWatch = Form.useWatch('startDate', form);
  const endWatch = Form.useWatch('endDate', form);

  // The signed contract copy staged in the Create Contract form. Held here
  // rather than in antd's file list so the bytes can be handed to the store,
  // which is what verifies them.
  const [contractCopy, setContractCopy] = useState<File | null>(null);

  const downloadCopy = (attachment: any) => {
    try {
      const bytes = getContractCopyBytes(attachment.id, attachment.scanStatus);
      const url = URL.createObjectURL(new Blob([bytes as any], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url; a.download = attachment.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { message.error(e.message); }
  };

  // Open the signed contract PDF in a new browser tab for inline viewing.
  const viewCopy = (attachment: any) => {
    try {
      const bytes = getContractCopyBytes(attachment.id, attachment.scanStatus);
      const url = URL.createObjectURL(new Blob([bytes as any], { type: 'application/pdf' }));
      const w = window.open(url, '_blank');
      if (!w) message.warning('Pop-up blocked — allow pop-ups to view the contract copy');
      // Revoke after the tab has had time to load the blob.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) { message.error(e.message); }
  };

  // The employee picked in Create Contract, and the contract period HR entered
  // for them at Onboarding. "Latest" is the coverage period (Approved/Active)
  // with the furthest end date, falling back to any contract on record.
  const selectedEmployeeId = Form.useWatch('employeeId', form);
  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);

  const priorContract = selectedEmployeeId ? latestContractFor(contracts, selectedEmployeeId) : undefined;

  // Picking an employee carries their onboarding dates forward: the new period
  // starts the day after the previous end (spec — "next non-overlapping renewal
  // starts after previous end") and runs for the same length.
  const onEmployeeChange = (employeeId: number) => {
    const next = renewalPeriodAfter(latestContractFor(contracts, employeeId));
    if (!next) {
      form.setFieldsValue({ startDate: undefined, endDate: undefined });
      return;
    }
    form.setFieldsValue({ startDate: dayjs(next.start), endDate: dayjs(next.end) });
  };

  // ── Renew Contract (existing employee) ──────────────────────────────────────
  // Only employees who already have a contract on record can be renewed — a
  // brand-new hire is onboarded via Workforce → Onboard Employee. This is what
  // separates the "old employee" flow from the "new employee" one.
  // Create Contract (New Employee): only people who do NOT yet have
  // Approved/Active coverage — newly onboarded hires (Draft/Pending or no
  // covering contract). Employees with Approved/Active go through Renew.
  const createContractEmployees = employees
    .filter(e => {
      if ((e as any).deletedAt) return false;
      const hasCoverage = contracts.some(
        c => c.employeeId === e.id && ['Approved', 'Active'].includes(c.status),
      );
      return !hasCoverage;
    })
    // Newest hires first so "just onboarded" are easy to find
    .sort((a, b) => String((b as any).hireDate || '').localeCompare(String((a as any).hireDate || '')));

  const RENEWAL_INTENDED_STATUSES = ['Expired', 'Suspended', 'Terminated', 'Superseded'];
  const renewableEmployees = employees.filter(e => {
    if ((e as any).deletedAt) return false;
    const latest = latestContractFor(contracts, e.id);
    if (!latest) return false;
    if (RENEWAL_INTENDED_STATUSES.includes(latest.status)) return true;
    if (['Approved', 'Active'].includes(latest.status)) {
      return new Date(latest.endDate) < new Date(new Date().toDateString());
    }
    return false;
  });

  const renewEmployeeId = Form.useWatch('employeeId', renewForm);
  const renewStartWatch = Form.useWatch('startDate', renewForm);
  const renewEndWatch = Form.useWatch('endDate', renewForm);
  const renewSelectedEmployee = employees.find(e => e.id === renewEmployeeId);
  const renewPriorContract = renewEmployeeId ? latestContractFor(contracts, renewEmployeeId) : undefined;

  const openRenew = () => {
    renewForm.resetFields();
    setRenewCopy(null);
    setIsRenewOpen(true);
  };

  // Picking the employee to renew carries their current period forward: the new
  // term starts the day after the previous end and runs for the same length.
  const onRenewEmployeeChange = (employeeId: number) => {
    const next = renewalPeriodAfter(latestContractFor(contracts, employeeId));
    if (!next) {
      renewForm.setFieldsValue({ startDate: undefined, endDate: undefined });
      return;
    }
    renewForm.setFieldsValue({ startDate: dayjs(next.start), endDate: dayjs(next.end) });
  };

  const handleRenew = async () => {
    try {
      const values = await renewForm.validateFields();
      const employeeId = values.employeeId;
      const emp = employees.find(e => e.id === employeeId);
      if (!emp) throw new Error('Employee not found');
      if (!latestContractFor(contracts, employeeId)) {
        throw new Error('This employee has no contract to renew — use Create Contract instead');
      }

      const start = values.startDate.format('YYYY-MM-DD');
      const end = values.endDate.format('YYYY-MM-DD');
      if (new Date(end) <= new Date(start)) throw new Error('End must be after start');

      if (!renewCopy) throw new Error('Contract copy [PDF] is required — attach the signed renewal before creating the record');

      // The store re-checks the exclusion constraint and role scope, so the same
      // guards that back Create Contract back the renewal too.
      const newContractId = addContract({
        employeeId,
        startDate: start,
        endDate: end,
        status: values.status || 'Draft',
      } as any);

      const bytes = new Uint8Array(await renewCopy.arrayBuffer());
      const attachment = attachContractCopy({
        contractId: newContractId,
        file: { name: renewCopy.name, type: renewCopy.type, bytes },
      });

      message.success(`Contract renewed for ${emp.name} — Job Number ${emp.jobNumber} — ${start} → ${end} — Status ${values.status || 'Draft'} — copy v${attachment.version} attached (${(attachment.sizeBytes / 1024).toFixed(0)} KB, scan ${attachment.scanStatus})`);
      setIsRenewOpen(false);
      renewForm.resetFields();
      setRenewCopy(null);
    } catch (err: any) {
      message.error(err.message || 'Contract renewal failed');
    }
  };

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

      if (!contractCopy) throw new Error('Contract copy [PDF] is required — attach the signed contract before creating the record');

      const newContractId = addContract({
        employeeId,
        startDate: start,
        endDate: end,
        status: values.status || 'Draft',
      } as any);

      // The store verifies the content type against the PDF magic bytes and
      // refuses anything that is not a real PDF, so read the bytes here and let
      // it decide rather than trusting the file picker.
      const bytes = new Uint8Array(await contractCopy.arrayBuffer());
      const attachment = attachContractCopy({
        contractId: newContractId,
        file: { name: contractCopy.name, type: contractCopy.type, bytes },
      });

      message.success(`Contract created for ${emp.name} — Job Number ${emp.jobNumber} — Status ${values.status} — contract copy v${attachment.version} attached (${(attachment.sizeBytes / 1024).toFixed(0)} KB, scan ${attachment.scanStatus})`);
      setIsModalOpen(false);
      form.resetFields();
      setContractCopy(null);
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

    // The store enforces the same exclusion rule, so a change that would create
    // an overlapping Approved/Active period is rejected here as well.
    try {
      updateContract(contractId, { status: newStatus });
    } catch (err: any) {
      message.error(err.message || 'Status change rejected');
      return;
    }
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
    {
      title: 'Contract Start (Greg + Hijri)', key: 'startDate', width: 150,
      render: (_: any, r: any) => <><Text style={{ fontSize: 11 }}>{r.startDate}</Text><br /><Text style={{ fontSize: 10 }} type="secondary">{r.startDateHijri || toHijriShort(r.startDate)} هـ</Text></>,
      sorter: (a: any, b: any) => String(a.startDate).localeCompare(String(b.startDate)),
    },
    {
      title: 'Contract End (Greg + Hijri)', key: 'endDate', width: 150,
      render: (_: any, r: any) => <><Text style={{ fontSize: 11 }}>{r.endDate}</Text><br /><Text style={{ fontSize: 10 }} type="secondary">{r.endDateHijri || toHijriShort(r.endDate)} هـ</Text></>,
      sorter: (a: any, b: any) => String(a.endDate).localeCompare(String(b.endDate)),
    },
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
      title: 'Contract Copy', key: 'contractCopy', width: 230,
      render: (_: any, r: any) => {
        const copies = r.contractCopy ?? [];
        if (copies.length === 0) return <Tag>none</Tag>;
        const latest = copies[copies.length - 1];
        return (
          <Space direction="vertical" size={2}>
            <Space size={4}>
              <FilePdfOutlined style={{ color: '#c00' }} />
              <Text style={{ fontSize: 11 }} ellipsis>{latest.fileName}</Text>
            </Space>
            <Space size={4}>
              <Tag color={latest.scanStatus === 'CLEAN' ? 'green' : latest.scanStatus === 'PENDING' ? 'orange' : 'red'}>
                {latest.scanStatus}
              </Tag>
              <Text style={{ fontSize: 11 }}>v{latest.version} · {(latest.sizeBytes / 1024).toFixed(0)} KB</Text>
              <Tooltip title={latest.scanStatus === 'CLEAN' ? 'View the contract copy' : 'Not viewable — an unscanned or infected file is never handed out (§5.3.2)'}>
                <Button size="small" icon={<EyeOutlined />} disabled={latest.scanStatus !== 'CLEAN'} onClick={() => viewCopy(latest)} />
              </Tooltip>
              <Tooltip title={latest.scanStatus === 'CLEAN' ? 'Download the contract copy' : 'Not downloadable — an unscanned or infected file is never handed out (§5.3.2)'}>
                <Button size="small" icon={<DownloadOutlined />} disabled={latest.scanStatus !== 'CLEAN'} onClick={() => downloadCopy(latest)} />
              </Tooltip>
            </Space>
          </Space>
        );
      }
    },
    {
      title: 'Actions', key: 'actions', width: 280,
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
          <Tooltip title="Attach or replace signed contract PDF">
            <Button size="small" icon={<PaperClipOutlined />} onClick={() => { setAttachFile(null); setAttachModal({ open: true, contractId: r.id }); }}>
              Attach PDF
            </Button>
          </Tooltip>
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
        <Space wrap>
          <Tooltip title="New employee — create the first contract for someone being added to the system">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setContractCopy(null); setEditingContract(null); setIsModalOpen(true); }}>Create Contract (New Employee)</Button>
          </Tooltip>
          <Tooltip title="Existing employee — renew the contract of someone already on record (only the new period is needed)">
            <Button icon={<ReloadOutlined />} onClick={openRenew}>Renew Contract (Existing Employee)</Button>
          </Tooltip>
        </Space>
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
              <Descriptions.Item label="Format">No fixed format — plain numbers (1001, 2003) or a text + number combination (AIGH1002, EMP2004, NUR4008). The retired AIGH-XXXX pattern is not required and is not enforced.</Descriptions.Item>
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

      {/* ── Attach PDF to existing contract ───────────────────────────────── */}
      <Modal
        title={<Space><FilePdfOutlined style={{ color: '#c00' }} />Attach Contract PDF — Contract #{attachModal.contractId}</Space>}
        open={attachModal.open}
        onCancel={() => { setAttachModal({ open: false, contractId: null }); setAttachFile(null); }}
        onOk={async () => {
          if (!attachFile) { message.error('Select a PDF file first'); return; }
          const contract = contracts.find(c => c.id === attachModal.contractId);
          if (!contract) return;
          const bytes = new Uint8Array(await attachFile.arrayBuffer());
          const attachment = attachContractCopy({ contractId: contract.id, file: { name: attachFile.name, type: attachFile.type, bytes } });
          message.success(`PDF attached to Contract #${contract.id} — v${attachment.version} · ${(attachment.sizeBytes / 1024).toFixed(0)} KB · scan ${attachment.scanStatus}`);
          setAttachModal({ open: false, contractId: null });
          setAttachFile(null);
        }}
        okText={<><PaperClipOutlined /> Attach PDF</>}
        okButtonProps={{ disabled: !attachFile }}
        width={520}
        destroyOnClose
      >
        <Alert type="info" showIcon style={{ marginBottom: 16 }}
          message="PDF files only · max 10 MB · magic-byte verified"
          description="The file must start with %PDF- bytes. Only .pdf files are accepted regardless of declared MIME type. Each attach creates a new version — previous copies are retained (§5.3.1)."
        />
        <Upload.Dragger
          accept={CONTRACT_COPY_ACCEPT}
          maxCount={1}
          showUploadList={{ showRemoveIcon: true }}
          beforeUpload={async (file) => {
            const quick = checkContractCopyCandidate({ name: file.name, type: file.type, size: file.size });
            if (!quick.ok) { message.error(quick.message); return Upload.LIST_IGNORE; }
            let head: Uint8Array;
            try { head = new Uint8Array(await file.slice(0, PDF_MAGIC.length).arrayBuffer()); }
            catch { message.error('Could not read file — try again'); return Upload.LIST_IGNORE; }
            const verified = checkContractCopyCandidate({ name: file.name, type: file.type, size: file.size, head });
            if (!verified.ok) { message.error(verified.message); return Upload.LIST_IGNORE; }
            setAttachFile(file as any);
            return false;
          }}
          onRemove={() => { setAttachFile(null); return true; }}
          style={{ borderColor: attachFile ? '#52c41a' : undefined }}
        >
          <p className="ant-upload-drag-icon"><FilePdfOutlined style={{ fontSize: 40, color: '#c00' }} /></p>
          <p className="ant-upload-text">Click or drag the signed contract PDF here</p>
          <p className="ant-upload-hint">*.pdf only · max 10 MB</p>
        </Upload.Dragger>
      </Modal>

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

          <Form.Item name="employeeId" label="Employee (Job Number from Contract)" rules={[{ required: true }]} extra="Select existing employee — Job Number is from contract that was entered during onboarding, plain numbers or text+number combination allowed (e.g. 1001, AIGH1002), unique per employee. Only newly onboarded employees without an Approved/Active contract appear here (Draft/Pending or no covering period). Employees who already have coverage use Renew Contract. Onboard via Workforce first if the list is empty.">
            <Select
              showSearch
              placeholder={createContractEmployees.length ? "Search newly onboarded / no covering contract" : "No eligible employees — onboard first or all already have Approved/Active"}
              onChange={onEmployeeChange}
              notFoundContent={createContractEmployees.length === 0 ? "No employees without Approved/Active contract. Use Renew for existing coverage, or Onboard a new hire." : undefined}
              options={createContractEmployees.map(e => ({
                label: `${e.jobNumber} — ${e.name} [${(e as any).firstName} ${(e as any).middleName || ''} ${(e as any).lastName}] [${e.position}]${(e as any).hireDate ? ` · hired ${(e as any).hireDate}` : ''}`,
                value: e.id,
              }))}
              filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>

          {/* Contract Start / Contract End entered at Onboarding, carried into
              this form so HR renews from the recorded period instead of
              retyping it. */}
          {selectedEmployee && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Contract entered at Onboarding — ${selectedEmployee.name} (Job Number ${selectedEmployee.jobNumber})`}
              description={priorContract ? (
                <>
                  <Descriptions size="small" column={2} bordered>
                    <Descriptions.Item label="Contract Start">
                      <Text strong>{priorContract.startDate}</Text>
                      <br /><Text type="secondary">{priorContract.startDateHijri || toHijriShort(priorContract.startDate)} هـ</Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="Contract End">
                      <Text strong>{priorContract.endDate}</Text>
                      <br /><Text type="secondary">{priorContract.endDateHijri || toHijriShort(priorContract.endDate)} هـ</Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="Status" span={2}><Tag color={priorContract.status === 'Active' ? 'green' : 'blue'}>{priorContract.status}</Tag></Descriptions.Item>
                  </Descriptions>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    These dates are appended to the pickers below: the new period starts the day after
                    {' '}{priorContract.endDate} and runs for the same length. Adjust them if the renewal differs.
                  </Text>
                </>
              ) : (
                <Text type="secondary">No contract on record for this employee — enter both dates below.</Text>
              )}
            />
          )}


          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="startDate" label="Contract Start — Required Hijri Date" rules={[{ required: true }]} extra={startWatch ? `Hijri: ${toHijri(startWatch)}` : 'Inclusive — next non-overlapping renewal starts after previous end. Hijri converted automatically.'}><DatePicker style={{ width: '100%' }} /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="endDate" label="Contract End — Required Hijri Date" rules={[{ required: true }]} extra={endWatch ? `Hijri: ${toHijri(endWatch)}` : 'Must be after start. Expired/Suspended/Terminated/Superseded do NOT provide coverage. Hijri converted automatically.'}><DatePicker style={{ width: '100%' }} /></Form.Item>
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

          <Form.Item
            label="Contract Copy [PDF] — required"
            required
            extra="PDF only · max 10 MB · magic-byte verified (§5.3.2) · each upload creates a new version, historical bytes never overwritten (§5.3.1) · HR Admin scoped (§4.2)"
          >
            <Upload.Dragger
              accept={CONTRACT_COPY_ACCEPT}
              maxCount={1}
              showUploadList={{ showRemoveIcon: true }}
              beforeUpload={async (file) => {
                const quick = checkContractCopyCandidate({ name: file.name, type: file.type, size: file.size });
                if (!quick.ok) { message.error(quick.message); return Upload.LIST_IGNORE; }
                let head: Uint8Array;
                try { head = new Uint8Array(await file.slice(0, PDF_MAGIC.length).arrayBuffer()); }
                catch { message.error('The contract copy could not be read — try again'); return Upload.LIST_IGNORE; }
                const verified = checkContractCopyCandidate({ name: file.name, type: file.type, size: file.size, head });
                if (!verified.ok) { message.error(verified.message); return Upload.LIST_IGNORE; }
                setContractCopy(file as any);
                return false;
              }}
              onRemove={() => { setContractCopy(null); return true; }}
              style={{ borderColor: contractCopy ? '#52c41a' : undefined }}
            >
              <p className="ant-upload-drag-icon"><FilePdfOutlined style={{ fontSize: 32, color: '#c00' }} /></p>
              <p className="ant-upload-text">Click or drag a PDF here to attach</p>
              <p className="ant-upload-hint">PDF files only (.pdf) · max 10 MB · content verified against %PDF- magic bytes</p>
            </Upload.Dragger>
          </Form.Item>

          <Descriptions bordered size="small" column={1} style={{ marginTop: 16 }}>
            <Descriptions.Item label="Job Number">From contract to be entered — unique per employee, stored in employees.job_number with unique index, duplicate triggers atomic rollback. No fixed format — plain number or text + number combination (e.g. 1001, AIGH1002). FHIR identifier system http://aigh.sa/job-number.</Descriptions.Item>
            <Descriptions.Item label="Exclusion Constraint">GiST daterange && WHERE status IN (Approved,Active) — overlapping Approved/Active periods same employee rejected at DB level. Approved future can satisfy eligibility for shift within that future.</Descriptions.Item>
            <Descriptions.Item label="Scope">HR_ADMIN scoped create/approval/renewal/termination + full history + attachments, Supervisor scoped reduced read (identifiers, employee/position, unit, status, dates), Employee own reduced read. Server-evaluated scope — passing nurse ID from browser does NOT establish access.</Descriptions.Item>
          </Descriptions>
        </Form>
      </Modal>

      {/* ── Renew Contract (existing employee) ─────────────────────────────── */}
      <Modal
        title={<Space><ReloadOutlined /> Renew Contract — Existing Employee</Space>}
        open={isRenewOpen}
        onCancel={() => setIsRenewOpen(false)}
        onOk={handleRenew}
        okText={<><ReloadOutlined /> Renew Contract</>}
        width={640}
        destroyOnClose
      >
        <Form form={renewForm} layout="vertical">
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Only the renewal details are needed"
            description="Identity, unit, position and documents stay as they are on the employee's record — a renewal just adds the next contract period. For a brand-new hire, use Create Contract (New Employee) or Workforce → Onboard Employee instead."
          />

          <Form.Item
            name="employeeId"
            label="Employee to renew"
            rules={[{ required: true, message: 'Select the employee whose contract is being renewed' }]}
            extra="Only employees who already have a contract on record appear here."
          >
            <Select
              showSearch
              placeholder="Search by job number or name"
              onChange={onRenewEmployeeChange}
              notFoundContent="No employees with an existing contract"
              options={renewableEmployees.map(e => ({ label: `${e.jobNumber} — ${e.name} [${e.position}] Unit ${e.unitId}`, value: e.id }))}
              filterOption={(input, option) => (option?.label as string).toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>

          {renewSelectedEmployee && renewPriorContract && (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Current contract on record — ${renewSelectedEmployee.name} (Job Number ${renewSelectedEmployee.jobNumber})`}
              description={
                <Descriptions size="small" column={2} bordered>
                  <Descriptions.Item label="Start">
                    <Text strong>{renewPriorContract.startDate}</Text>
                    <br /><Text type="secondary">{renewPriorContract.startDateHijri || toHijriShort(renewPriorContract.startDate)} هـ</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="End">
                    <Text strong>{renewPriorContract.endDate}</Text>
                    <br /><Text type="secondary">{renewPriorContract.endDateHijri || toHijriShort(renewPriorContract.endDate)} هـ</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Status" span={2}>
                    <Tag color={renewPriorContract.status === 'Active' ? 'green' : 'blue'}>{renewPriorContract.status}</Tag>
                  </Descriptions.Item>
                </Descriptions>
              }
            />
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="startDate" label="New Contract Start" rules={[{ required: true }]} extra={renewStartWatch ? `Hijri: ${toHijri(renewStartWatch)}` : 'Pre-filled to the day after the current end. Adjust if the renewal differs.'}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="endDate" label="New Contract End" rules={[{ required: true }]} extra={renewEndWatch ? `Hijri: ${toHijri(renewEndWatch)}` : 'Must be after start. Overlapping Approved/Active periods are rejected.'}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="status" label="Initial Status" initialValue="Draft" rules={[{ required: true }]}>
            <Select options={[
              { label: 'Draft — No coverage', value: 'Draft' },
              { label: 'PendingApproval — No coverage', value: 'PendingApproval' },
              { label: 'Approved — Future coverage from the start date', value: 'Approved' },
            ]} />
          </Form.Item>

          <Form.Item
            label="Renewal Contract Copy [PDF] — required"
            required
            extra="PDF only · max 10 MB · magic-byte verified (§5.3.2) · each upload creates a new version (§5.3.1)"
          >
            <Upload.Dragger
              accept={CONTRACT_COPY_ACCEPT}
              maxCount={1}
              showUploadList={{ showRemoveIcon: true }}
              beforeUpload={async (file) => {
                const quick = checkContractCopyCandidate({ name: file.name, type: file.type, size: file.size });
                if (!quick.ok) { message.error(quick.message); return Upload.LIST_IGNORE; }
                let head: Uint8Array;
                try { head = new Uint8Array(await file.slice(0, PDF_MAGIC.length).arrayBuffer()); }
                catch { message.error('The contract copy could not be read — try again'); return Upload.LIST_IGNORE; }
                const verified = checkContractCopyCandidate({ name: file.name, type: file.type, size: file.size, head });
                if (!verified.ok) { message.error(verified.message); return Upload.LIST_IGNORE; }
                setRenewCopy(file as any);
                return false;
              }}
              onRemove={() => { setRenewCopy(null); return true; }}
              style={{ borderColor: renewCopy ? '#52c41a' : undefined }}
            >
              <p className="ant-upload-drag-icon"><FilePdfOutlined style={{ fontSize: 32, color: '#c00' }} /></p>
              <p className="ant-upload-text">Click or drag the signed renewal PDF here</p>
              <p className="ant-upload-hint">PDF files only (.pdf) · max 10 MB · content verified against %PDF- magic bytes</p>
            </Upload.Dragger>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
