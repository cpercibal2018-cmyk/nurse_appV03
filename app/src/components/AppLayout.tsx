import React, { useState, useCallback } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Space, Typography, ConfigProvider, theme } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  ApartmentOutlined,
  IdcardOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  ScheduleOutlined,
  BellOutlined,
  AuditOutlined,
  SettingOutlined,
  GlobalOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HeartOutlined,
  CloudServerOutlined,
  ExperimentOutlined,
  FileProtectOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../lib/store';
import { setLanguage } from '../lib/i18n';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const NavLink = ({ to, children, ...rest }: any) => {
  const chunkLoaders: Record<string, () => Promise<any>> = {
    '/workforce': () => import('../modules/workforce/WorkforceRoutes'),
    '/units': () => import('../modules/workforce/UnitCapacityGrid'),
    '/credentials': () => import('../modules/credentials/CredentialsModule'),
    '/eligibility': () => import('../modules/eligibility/EligibilityModule'),
    '/scheduling': () => import('../modules/scheduling/SchedulingModule'),
    '/notifications': () => import('../modules/notifications/NotificationsModule'),
    '/audit': () => import('../modules/audit/AuditModule'),
    '/roles': () => import('../modules/admin/RoleMatrixPage'),
    '/contracts': () => import('../modules/contracts/ContractsPage'),
    '/admin': () => import('../modules/admin/AdminModule'),
  };

  const preload = useCallback(() => {
    const loader = Object.entries(chunkLoaders).find(([prefix]) => to.startsWith(prefix));
    if (loader) loader[1]();
  }, [to]);

  return (
    <Link to={to} onMouseEnter={preload} onFocus={preload} {...rest}>
      {children}
    </Link>
  );
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { isAuthenticated, currentUser, logout, notifications } = useStore();
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleLanguageChange = (lang: 'en' | 'ar') => {
    setLanguage(lang);
  };

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: <NavLink to="/">{t('dashboard')}</NavLink> },
    { key: '/workforce', icon: <TeamOutlined />, label: <NavLink to="/workforce">{t('workforce')}</NavLink> },
    { key: '/contracts', icon: <FileProtectOutlined />, label: <NavLink to="/contracts">Contracts (Job No from Contract)</NavLink> },
    { key: '/units', icon: <ApartmentOutlined />, label: <NavLink to="/units">{t('units')}</NavLink> },
    { key: '/positions', icon: <IdcardOutlined />, label: <NavLink to="/positions">{t('positions')}</NavLink> },
    { key: '/credentials', icon: <SafetyCertificateOutlined />, label: <NavLink to="/credentials">{t('credentials')}</NavLink> },
    { key: '/eligibility', icon: <CheckCircleOutlined />, label: <NavLink to="/eligibility">{t('eligibility')}</NavLink> },
    { key: '/scheduling', icon: <ScheduleOutlined />, label: <NavLink to="/scheduling">{t('scheduling')}</NavLink> },
    { key: '/notifications', icon: <BellOutlined />, label: <NavLink to="/notifications">{t('notifications')}</NavLink> },
    { key: '/audit', icon: <AuditOutlined />, label: <NavLink to="/audit">{t('audit')}</NavLink> },
    { key: '/observability', icon: <HeartOutlined />, label: <NavLink to="/observability">{t('observability')}</NavLink> },
    { key: '/roles', icon: <SafetyCertificateOutlined />, label: <NavLink to="/roles">Roles & Matrix</NavLink> },
    { key: '/admin', icon: <SettingOutlined />, label: <NavLink to="/admin">{t('admin')}</NavLink> },
  ];

  const userMenu = {
    items: [
      { key: 'profile', label: currentUser?.email, disabled: true },
      { key: 'role', label: `Role: ${currentUser?.role}`, disabled: true },
      { type: 'divider' as const },
      { key: 'en', label: 'English', onClick: () => handleLanguageChange('en') },
      { key: 'ar', label: 'العربية', onClick: () => handleLanguageChange('ar') },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: t('logout'), onClick: handleLogout },
    ]
  };

  const isRtl = i18n.language === 'ar';

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: { colorPrimary: '#1677ff' },
      }}
      direction={isRtl ? 'rtl' : 'ltr'}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          breakpoint="lg"
          onBreakpoint={(broken) => setCollapsed(broken)}
          style={{
            overflow: 'auto',
            height: '100vh',
            position: 'fixed',
            left: isRtl ? 'auto' : 0,
            right: isRtl ? 0 : 'auto',
            top: 0,
            bottom: 0,
            zIndex: 10,
          }}
        >
          <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 12px' }}>
            {collapsed
              ? <img src="/logo.jpg" alt="AIGH" style={{ height: 36, width: 36, objectFit: 'cover', objectPosition: 'left', borderRadius: 4 }} />
              : <img src="/logo.jpg" alt="AIGH Nursing Workflow System" style={{ height: 44, objectFit: 'contain', maxWidth: '100%' }} />
            }
          </div>
          <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={menuItems} />
          <div style={{ position: 'absolute', bottom: 0, width: '100%', padding: 12, color: 'rgba(255,255,255,0.65)', fontSize: 11, textAlign: 'center' }}>
            {!collapsed && (
              <>
                <div>v2.8.7b • Node 20 / PG 15</div>
                <div style={{ marginTop: 4, display: 'flex', gap: 4, justifyContent: 'center' }}>
                  <FileProtectOutlined /> PDPL • KSA
                </div>
              </>
            )}
          </div>
        </Sider>
        <Layout style={{ marginLeft: isRtl ? 0 : collapsed ? 80 : 200, marginRight: isRtl ? (collapsed ? 80 : 200) : 0, transition: 'all 0.2s' }}>
          <Header style={{ padding: `0 ${isRtl ? '24px 0 24px 24px' : '0 24px'}`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, zIndex: 9 }}>
            <Space>
              <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} />
              <Text strong style={{ fontSize: 16 }}>{t('appName')}</Text>
            </Space>
            <Space size="middle">
              <Button type="text" icon={<GlobalOutlined />} onClick={() => handleLanguageChange(i18n.language === 'en' ? 'ar' : 'en')}>
                {i18n.language === 'en' ? 'العربية' : 'English'}
              </Button>
              <Badge count={unreadCount} size="small">
                <Button type="text" icon={<BellOutlined />} onClick={() => navigate('/notifications')} />
              </Badge>
              <Dropdown menu={userMenu} placement="bottomRight">
                <Space style={{ cursor: 'pointer' }}>
                  <Avatar style={{ backgroundColor: '#1677ff' }}>{currentUser?.name?.[0]?.toUpperCase()}</Avatar>
                  {!collapsed && <Text>{currentUser?.name}</Text>}
                </Space>
              </Dropdown>
            </Space>
          </Header>
          <Content style={{ margin: 24, background: '#f5f5f5', minHeight: 280 }}>
            {children}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
