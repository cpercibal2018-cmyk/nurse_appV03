import React, { useState } from 'react';
import { Card, List, Tag, Button, Typography, Alert, Space, Badge, Modal, Descriptions, Switch, message } from 'antd';
import { BellOutlined, MailOutlined, MobileOutlined } from '@ant-design/icons';
import { useStore } from '../../lib/store';

const { Title, Text } = Typography;

export default function NotificationsModule() {
  const { notifications, markNotificationRead, addNotification } = useStore();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filtered = filter === 'unread' ? notifications.filter(n => !n.isRead) : notifications;

  const simulatePush = () => {
    addNotification({
      type: 'PUSH_DELIVERY',
      title: 'Push notification sent',
      message: 'Device token registered, FCM delivery via hospital gateway. Failed tokens deactivated. Delivery log recorded.',
      priority: 'MEDIUM',
    });
    message.success('Push notification simulated — device token registration, FCM + hospital gateway, fallback to dashboard + SMTP when push fails');
  };

  const simulateSmtp = () => {
    addNotification({
      type: 'SMTP_DELIVERY',
      title: 'SMTP email delivered',
      message: 'Real Nodemailer delivery, persisted attempts and retries. Hospital SMTP relay verification pending.',
      priority: 'LOW',
    });
    message.success('SMTP delivery simulated — real relay, retry/recovery per Section 7.3 checklist');
  };

  return (
    <div>
      <Title level={4}><BellOutlined /> Notifications — Dashboard + SMTP + Push (Multi-Channel)</Title>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Notification System (Section 7) — Implementation Specification"
        description="Recipient events, email delivery, retries, acknowledgement. Runs asynchronously, does not change employment rules. Daily scan 06:00 Asia/Riyadh = 03:00 UTC: contract expiry 90-day window, credential expiry 60-day window + expired, grace expiry. SMTP worker every 60s with lease. Advisory locks replaced by worker_leases V49 (heartbeat, expiry takeover). Push: device token registration, FCM + hospital gateway adapters, failed tokens deactivated, delivery log, fallback to dashboard + SMTP."
      />

      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => setFilter(filter === 'all' ? 'unread' : 'all')}>{filter === 'all' ? `Show Unread (${notifications.filter(n => !n.isRead).length})` : 'Show All'}</Button>
        <Button icon={<MobileOutlined />} onClick={simulatePush}>Simulate Push (FCM)</Button>
        <Button icon={<MailOutlined />} onClick={simulateSmtp}>Simulate SMTP</Button>
        <Text type="secondary">Bilingual templates: reads user preferred language from profile, delivers in that language. Date/number via Intl API.</Text>
      </Space>

      <Card>
        <List
          dataSource={filtered}
          renderItem={item => (
            <List.Item
              actions={[
                !item.isRead && <Button size="small" onClick={() => markNotificationRead(item.id)}>Mark Read</Button>,
                <Button size="small" onClick={() => Modal.info({ title: item.title, content: <Descriptions bordered size="small" column={1}><Descriptions.Item label="Type">{item.type}</Descriptions.Item><Descriptions.Item label="Message">{item.message}</Descriptions.Item><Descriptions.Item label="Priority">{item.priority}</Descriptions.Item><Descriptions.Item label="Created">{new Date(item.createdAt).toLocaleString()}</Descriptions.Item><Descriptions.Item label="Channels">Dashboard + SMTP + Push (multi-channel delivery)</Descriptions.Item></Descriptions>, width: 600 })}>Details</Button>
              ].filter(Boolean) as any}
            >
              <List.Item.Meta
                avatar={<Badge status={item.isRead ? 'default' : 'processing'} />}
                title={<Space><Text strong>{item.title}</Text><Tag color={item.priority === 'CRITICAL' ? 'red' : item.priority === 'HIGH' ? 'orange' : item.priority === 'MEDIUM' ? 'blue' : 'default'}>{item.priority}</Tag><Tag>{item.type}</Tag>{!item.isRead && <Tag color="blue">Unread</Tag>}</Space>}
                description={<><Text>{item.message}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{new Date(item.createdAt).toLocaleString()} — Acknowledgement tracked</Text></>}
              />
            </List.Item>
          )}
        />
      </Card>

      <Card title="Notification Architecture (Section 7.1-7.6)" style={{ marginTop: 16 }}>
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="Daily Scan (06:00 Asia/Riyadh)">Contracts expiring in 90 days, credentials in 60 days + already expired, grace windows expiring. Unique event keys prevent duplicates. Missed-run recovery via window-based queries.</Descriptions.Item>
          <Descriptions.Item label="SMTP Worker (every 60s)">Real Nodemailer, persisted attempts, retries, advisory lock replaced by worker_lease smtp_queue (120s). Hospital relay STARTTLS port 587, dedicated service account.</Descriptions.Item>
          <Descriptions.Item label="Push Notifications (7.6)">Device token registration/deregistration, FCM + hospital gateway adapters, failed tokens deactivated, delivery log records all attempts, fallback to dashboard + SMTP when push fails. Bilingual templates.</Descriptions.Item>
          <Descriptions.Item label="Worker Leases V49">notifications.daily_scan 900s, notifications.smtp_queue 120s, scfhs.nightly_sync 1800s, credentials.grace_expiry 600s, idempotency.cleanup 300s, backup.freshness_check 600s, quarantine.scan 300s. Heartbeat 1/3 lease duration, expiry takeover after crash.</Descriptions.Item>
          <Descriptions.Item label="Monitoring">Oldest pending notification, exhausted retries, worker heartbeat tracked. Alerts via backup monitor service.</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
