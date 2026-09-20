import React, { useMemo, useState } from 'react';
import { Card, List, Tag, Button, Space, Typography, Alert, Modal, Form, Select, Input, Upload, message, Tooltip, Empty, Descriptions } from 'antd';
import { SafetyCertificateOutlined, FilePdfOutlined, UploadOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useStore, getCredentialEvidenceBytes } from '../../lib/store';
import { checkContractCopyCandidate, CONTRACT_COPY_ACCEPT as PDF_ACCEPT, PDF_MAGIC } from '../../lib/contracts';

const { Title, Text } = Typography;

export default function MyCredentialsPage() {
  const { credentials, credentialTemplates, employees, currentUser, addCredential, attachCredentialEvidence } = useStore();

  // The signed-in employee's own record. currentUser.id maps to the employee row.
  const me = useMemo(
    () => employees.find((e: any) => e.id === currentUser?.id && !e.deletedAt) ?? employees.find((e: any) => !e.deletedAt),
    [employees, currentUser],
  );

  const myCredentials = useMemo(() => credentials.filter((c: any) => c.employeeId === me?.id), [credentials, me]);

  const [uploadFor, setUploadFor] = useState<number | null>(null); // credentialId
  const [file, setFile] = useState<File | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [form] = Form.useForm();

  const templateName = (id: number) => { const t = credentialTemplates.find((x: any) => x.id === id); return t ? `${t.code} — ${t.name}` : `#${id}`; };

  const download = (ev: any) => {
    try {
      const bytes = getCredentialEvidenceBytes(ev.id, ev.scanStatus);
      const url = URL.createObjectURL(new Blob([bytes as any], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = ev.fileName; a.click(); URL.revokeObjectURL(url);
    } catch (e: any) { message.error(e.message); }
  };

  const pdfDragger = (staged: File | null, onFile: (f: File | null) => void) => (
    <Upload.Dragger
      accept={PDF_ACCEPT} maxCount={1} showUploadList={{ showRemoveIcon: true }}
      beforeUpload={async (f) => {
        const quick = checkContractCopyCandidate({ name: f.name, type: f.type, size: f.size });
        if (!quick.ok) { message.error(quick.message); return Upload.LIST_IGNORE; }
        let head: Uint8Array;
        try { head = new Uint8Array(await f.slice(0, PDF_MAGIC.length).arrayBuffer()); }
        catch { message.error('Could not read file'); return Upload.LIST_IGNORE; }
        const verified = checkContractCopyCandidate({ name: f.name, type: f.type, size: f.size, head });
        if (!verified.ok) { message.error(verified.message); return Upload.LIST_IGNORE; }
        onFile(f as any); return false;
      }}
      onRemove={() => { onFile(null); return true; }}
      style={{ borderColor: staged ? '#52c41a' : undefined }}
    >
      <p className="ant-upload-drag-icon"><FilePdfOutlined style={{ fontSize: 32, color: '#c00' }} /></p>
      <p className="ant-upload-text">Click or drag your PDF here</p>
      <p className="ant-upload-hint">*.pdf only · max 10 MB</p>
    </Upload.Dragger>
  );

  const submitUpload = async () => {
    if (!uploadFor || !file) { message.error('Attach a PDF first'); return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ev = attachCredentialEvidence({ credentialId: uploadFor, file: { name: file.name, type: file.type, bytes } });
    message.success(`Uploaded — evidence v${ev.version} (${(ev.sizeBytes / 1024).toFixed(0)} KB, scan ${ev.scanStatus}). It now awaits HR verification.`);
    setUploadFor(null); setFile(null);
  };

  const submitNew = async () => {
    try {
      const v = await form.validateFields();
      if (!newFile) { message.error('Attach a PDF first'); return; }
      const id = addCredential({
        employeeId: me!.id, templateId: v.templateId, validityStatus: 'PendingVerification',
        issueDate: v.issueDate, expiryDate: v.expiryDate, trackingData: { note: v.note },
        syncStatus: 'PENDING', lastSyncAttempt: new Date().toISOString(),
      } as any);
      const bytes = new Uint8Array(await newFile.arrayBuffer());
      attachCredentialEvidence({ credentialId: id, file: { name: newFile.name, type: newFile.type, bytes } });
      message.success('Credential submitted for verification');
      setIsNew(false); setNewFile(null); form.resetFields();
    } catch (e: any) { if (e?.message) message.error(e.message); }
  };

  if (!me) return <Card><Empty description="No employee record linked to your account" /></Card>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}><SafetyCertificateOutlined /> My Credentials</Title>
          <Text type="secondary">Upload and track your own licenses and certificates</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} style={{ background: '#1a6b4e', borderColor: '#1a6b4e' }} onClick={() => { setNewFile(null); form.resetFields(); setIsNew(true); }}>Submit new credential</Button>
      </div>

      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message={`Signed in as ${me.name} (${me.jobNumber}) · ${me.position}`}
        description="Upload a PDF for each credential. Files are magic-byte verified and enter the quarantine pipeline (PENDING → CLEAN). Once uploaded, a credential moves to PendingVerification until HR confirms it."
      />

      {myCredentials.length === 0
        ? <Card><Empty description="You have no credential records yet — use “Submit new credential”" /></Card>
        : <List
            grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 3 }}
            dataSource={myCredentials}
            renderItem={(c: any) => {
              const ev = c.evidence ?? [];
              const latest = ev[ev.length - 1];
              return (
                <List.Item>
                  <Card size="small" title={<Text strong style={{ fontSize: 13 }}>{templateName(c.templateId)}</Text>}
                    extra={<Tag color={c.validityStatus === 'Valid' ? 'green' : c.validityStatus === 'ExpiringSoon' ? 'orange' : c.validityStatus === 'Expired' ? 'red' : 'blue'}>{c.validityStatus}</Tag>}>
                    <Descriptions size="small" column={1}>
                      <Descriptions.Item label="Issue">{c.issueDate || '-'}</Descriptions.Item>
                      <Descriptions.Item label="Expiry">{c.expiryDate || '-'}</Descriptions.Item>
                    </Descriptions>
                    <div style={{ marginTop: 8 }}>
                      {ev.length === 0
                        ? <Text type="secondary" style={{ fontSize: 12 }}>No document uploaded</Text>
                        : <Space wrap>
                            <FilePdfOutlined style={{ color: '#c00' }} />
                            <Text style={{ fontSize: 12 }}>v{latest.version} · {(latest.sizeBytes / 1024).toFixed(0)} KB</Text>
                            <Tag color={latest.scanStatus === 'CLEAN' ? 'green' : latest.scanStatus === 'PENDING' ? 'orange' : 'red'}>{latest.scanStatus}</Tag>
                            <Tooltip title={latest.scanStatus === 'CLEAN' ? 'Download' : 'Not downloadable until CLEAN'}>
                              <Button size="small" icon={<DownloadOutlined />} disabled={latest.scanStatus !== 'CLEAN'} onClick={() => download(latest)} />
                            </Tooltip>
                          </Space>}
                    </div>
                    <Button size="small" icon={<UploadOutlined />} style={{ marginTop: 10 }} onClick={() => { setFile(null); setUploadFor(c.id); }}>
                      {ev.length ? 'Upload new version' : 'Upload PDF'}
                    </Button>
                  </Card>
                </List.Item>
              );
            }}
          />}

      {/* Upload evidence to an existing credential */}
      <Modal title={<Space><FilePdfOutlined style={{ color: '#c00' }} />Upload credential document</Space>}
        open={uploadFor !== null} onCancel={() => { setUploadFor(null); setFile(null); }} onOk={submitUpload} okText="Upload" okButtonProps={{ disabled: !file }} destroyOnClose>
        {uploadFor !== null && <Text type="secondary" style={{ fontSize: 12 }}>{templateName(myCredentials.find((c: any) => c.id === uploadFor)?.templateId)}</Text>}
        <div style={{ marginTop: 12 }}>{pdfDragger(file, setFile)}</div>
      </Modal>

      {/* Submit a brand-new credential */}
      <Modal title="Submit new credential" open={isNew} onCancel={() => { setIsNew(false); setNewFile(null); }} onOk={submitNew} okText="Submit for verification" width={560} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="templateId" label="Credential type" rules={[{ required: true }]}>
            <Select showSearch options={credentialTemplates.filter((t: any) => t.isActive).map((t: any) => ({ label: `${t.code} — ${t.name}`, value: t.id }))}
              filterOption={(i, o) => String(o?.label).toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
          <Space>
            <Form.Item name="issueDate" label="Issue date" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            <Form.Item name="expiryDate" label="Expiry date" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          </Space>
          <Form.Item name="note" label="Reference / note"><Input.TextArea placeholder="License number, issuing body, etc." /></Form.Item>
          <Form.Item label="Document [PDF] — required" required>{pdfDragger(newFile, setNewFile)}</Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
