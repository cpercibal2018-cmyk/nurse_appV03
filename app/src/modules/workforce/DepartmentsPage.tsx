import React, { useState } from 'react';
import { Card, Table, Tag, Button, Space, Modal, Form, Input, message, Typography, Alert, Progress, Descriptions } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useStore } from '../../lib/store';

const { Title, Text } = Typography;

export default function DepartmentsPage() {
  const { departments, units, addDepartment, updateDepartment, deleteDepartment } = useStore();
  const [isModal, setIsModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        updateDepartment(editing.id, values);
        message.success('Department updated');
      } else {
        addDepartment(values);
        message.success('Department created — code unique system-wide');
      }
      setIsModal(false);
      setEditing(null);
      form.resetFields();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: 'Soft delete department?',
      content: 'Only when no active nursing units exist. Units must be reassigned or deleted first. Soft delete via deleted_at timestamp — remains in historical records.',
      onOk: () => {
        try {
          deleteDepartment(id);
          message.success('Department soft-deleted');
        } catch (e: any) {
          message.error(e.message);
        }
      }
    });
  };

  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 100, sorter: (a: any, b: any) => a.code.localeCompare(b.code) },
    { title: 'Name', dataIndex: 'name', key: 'name', sorter: (a: any, b: any) => a.name.localeCompare(b.name) },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: 'Units', key: 'units', width: 100, render: (_: any, r: any) => {
        const count = units.filter(u => u.departmentId === r.id && u.isActive).length;
        return <Tag>{count} units</Tag>;
      }
    },
    {
      title: 'Beds', key: 'beds', width: 100, render: (_: any, r: any) => {
        const beds = units.filter(u => u.departmentId === r.id && u.isActive).reduce((s, u) => s + u.bedCount, 0);
        return <Tag color="blue">{beds} beds</Tag>;
      }
    },
    { title: 'Active', dataIndex: 'isActive', key: 'isActive', width: 80, render: (v: boolean) => v ? <Tag color="green">Active</Tag> : <Tag>Deleted</Tag> },
    {
      title: 'Actions', key: 'actions', width: 160, render: (_: any, r: any) => (
        <Space>
          <Button size="small" onClick={() => { setEditing(r); form.setFieldsValue(r); setIsModal(true); }}>Edit</Button>
          <Button size="small" danger disabled={!r.isActive} onClick={() => handleDelete(r.id)}>Delete</Button>
        </Space>
      )
    }
  ];

  const totalBeds = units.filter(u => u.isActive).reduce((s, u) => s + u.bedCount, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>Departments — Hospital Organizational Structure (Section 2.9)</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setIsModal(true); }}>Add Department</Button>
      </div>

      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Department Catalog — 5 Departments, 47 Units, 582 Beds Baseline (Editable)" description="Department is organizational grouping of related nursing units under common service line. Unit is operational entity where employees assigned, credential requirements scoped, shifts scheduled, coverage measured. Bed capacity integer per unit, informs staffing targets. Administrative units have zero beds. Every change recorded in bed_capacity_log with actor, reason, previous, new. Departments support Add/Edit/Delete (soft delete via deleted_at). Code format: uppercase alphanumeric 2-10 chars, unique system-wide, immutable once units reference it. Summary: 5 depts, 47 units, total 582 by dept EMAC 133, SURG 38, CRIT 165, GNSP 246, CORP 0 — seeded baseline, fully editable in-system." />

      <Card>
        <Space size="large" style={{ marginBottom: 16 }}>
          <Text strong>Total Departments: {departments.filter(d => d.isActive).length}</Text>
          <Text strong>Total Units: {units.filter(u => u.isActive).length} / 47 seed</Text>
          <Text strong>Total Beds: {totalBeds} / 582 baseline</Text>
        </Space>

        <Table rowKey="id" dataSource={departments} columns={columns as any} pagination={false} size="small" />

        <div style={{ marginTop: 16 }}>
          <Title level={5}>Department Operations (Section 2.9)</Title>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Add">Create new department with unique code and name. Code format uppercase alphanumeric 2-10 chars.</Descriptions.Item>
            <Descriptions.Item label="Edit">Rename department or change description. Changing code not permitted once units reference it.</Descriptions.Item>
            <Descriptions.Item label="Delete">Remove only when no active nursing units. Units must be reassigned or deleted first. Soft delete deleted_at — remains in historical records, excluded from active dropdowns but visible in audit trails and past assignments.</Descriptions.Item>
          </Descriptions>
        </div>
      </Card>

      <Modal title={editing ? `Edit Department ${editing.code}` : 'Add Department'} open={isModal} onCancel={() => { setIsModal(false); setEditing(null); }} onOk={handleSave} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="Department Code (2-10 chars, uppercase alphanumeric, unique, immutable after units reference)" rules={[{ required: true, pattern: /^[A-Z0-9]{2,10}$/, message: 'Uppercase alphanumeric 2-10 chars' }]}><Input disabled={!!editing} placeholder="EMAC" /></Form.Item>
          <Form.Item name="name" label="Department Name" rules={[{ required: true, max: 100 }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
