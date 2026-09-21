import React, { useState, useCallback, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Space, Typography, ConfigProvider, theme, Tooltip } from 'antd';
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
  FileProtectOutlined,
  BulbOutlined,
  MoonOutlined,
  FundOutlined,
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
    '/my-credentials': () => import('../modules/credentials/MyCredentialsPage'),
    '/eligibility': () => import('../modules/eligibility/EligibilityModule'),
    '/scheduling': () => import('../modules/scheduling/SchedulingModule'),
    '/notifications': () => import('../modules/notifications/NotificationsModule'),
    '/audit': () => import('../modules/audit/AuditModule'),
    '/kpi': () => import('../modules/kpi/NursingKpiPage'),
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
  const [isDark, setIsDark] = useState(() => localStorage.getItem('aigh-theme') === 'dark');
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { isAuthenticated, currentUser, logout, notifications } = useStore();
  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('aigh-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

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
    { key: '/my-credentials', icon: <IdcardOutlined />, label: <NavLink to="/my-credentials">My Credentials</NavLink> },
    { key: '/eligibility', icon: <CheckCircleOutlined />, label: <NavLink to="/eligibility">{t('eligibility')}</NavLink> },
    { key: '/scheduling', icon: <ScheduleOutlined />, label: <NavLink to="/scheduling">{t('scheduling')}</NavLink> },
    { key: '/notifications', icon: <BellOutlined />, label: <NavLink to="/notifications">{t('notifications')}</NavLink> },
    { key: '/audit', icon: <AuditOutlined />, label: <NavLink to="/audit">{t('audit')}</NavLink> },
    { key: '/observability', icon: <HeartOutlined />, label: <NavLink to="/observability">{t('observability')}</NavLink> },
    { key: '/kpi', icon: <FundOutlined />, label: <NavLink to="/kpi">Nursing KPIs</NavLink> },
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

  const sidebarW = collapsed ? 64 : 244;

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1a6b4e',
          colorLink: '#2563eb',
          colorSuccess: '#16a34a',
          colorWarning: '#d97706',
          colorError: '#dc2626',
          borderRadius: 8,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        },
        components: {
          Layout: { siderBg: '#0f3024', triggerBg: '#0a2019' },
          Menu: { darkItemBg: '#0f3024', darkSubMenuItemBg: '#0a2019', darkItemSelectedBg: '#1a6b4e', itemHeight: 42 },
          Table: { headerBg: '#e8f5ef', headerColor: '#1e293b' },
          Card: { paddingLG: 20 },
          Button: { primaryShadow: 'none' },
        },
      }}
      direction={isRtl ? 'rtl' : 'ltr'}
    >
      <Layout style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          width={244}
          collapsedWidth={64}
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
            background: '#0f3024',
            boxShadow: '2px 0 8px rgba(0,0,0,.18)',
          }}
        >
          {/* Logo */}
          <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
            {collapsed
              ? <img src="/logo-dark.jpg" alt="AIGH" style={{ height: 36, width: 36, objectFit: 'cover', objectPosition: 'left', borderRadius: 6 }} />
              : <img src="/logo-dark.jpg" alt="AIGH Nursing Workflow System" style={{ height: 44, objectFit: 'contain', maxWidth: '100%', borderRadius: 6 }} />
            }
          </div>

          <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={menuItems}
            style={{ background: '#0f3024', border: 'none', marginTop: 8 }}
          />

          {/* Footer badge */}
          <div style={{ position: 'absolute', bottom: 0, width: '100%', padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,.08)', background: '#0a2019' }}>
            {collapsed
              ? <Tooltip title="PDPL · KSA" placement="right"><FileProtectOutlined style={{ color: 'rgba(255,255,255,.45)', fontSize: 14, display: 'block', textAlign: 'center' }} /></Tooltip>
              : <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, textAlign: 'center', lineHeight: 1.6 }}>
                  <div>v2.8.7c · Node 20 / PG 15</div>
                  <div style={{ marginTop: 2 }}><FileProtectOutlined /> PDPL · KSA me-central-1</div>
                </div>
            }
          </div>
        </Sider>

        <Layout style={{ marginLeft: isRtl ? 0 : sidebarW, marginRight: isRtl ? sidebarW : 0 }}>
          <Header style={{
            padding: '0 20px',
            background: isDark ? '#161b22' : '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${isDark ? '#30363d' : '#e2e8f0'}`,
            position: 'sticky',
            top: 0,
            zIndex: 9,
            height: 60,
            lineHeight: '60px',
            boxShadow: '0 1px 3px rgba(0,0,0,.06)',
          }}>
            <Space>
              <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)}
                style={{ color: isDark ? '#e6edf3' : '#1e293b' }}
              />
              <Text strong style={{ fontSize: 15, color: isDark ? '#e6edf3' : '#1e293b' }}>{t('appName')}</Text>
            </Space>
            <Space size={4}>
              <Tooltip title={isDark ? 'Light mode' : 'Dark mode'}>
                <Button type="text" icon={isDark ? <BulbOutlined /> : <MoonOutlined />} onClick={() => setIsDark(d => !d)}
                  style={{ color: isDark ? '#e6edf3' : '#64748b' }}
                />
              </Tooltip>
              <Button type="text" icon={<GlobalOutlined />} onClick={() => handleLanguageChange(i18n.language === 'en' ? 'ar' : 'en')}
                style={{ color: isDark ? '#e6edf3' : '#64748b', fontWeight: 500 }}
              >
                {i18n.language === 'en' ? 'ع' : 'EN'}
              </Button>
              <Badge count={unreadCount} size="small" style={{ backgroundColor: '#1a6b4e' }}>
                <Button type="text" icon={<BellOutlined />} onClick={() => navigate('/notifications')}
                  style={{ color: isDark ? '#e6edf3' : '#64748b' }}
                />
              </Badge>
              <Dropdown menu={userMenu} placement="bottomRight">
                <Space style={{ cursor: 'pointer', marginLeft: 4 }}>
                  <Avatar style={{ backgroundColor: '#1a6b4e', fontSize: 13, fontWeight: 600 }}>
                    {currentUser?.name?.[0]?.toUpperCase()}
                  </Avatar>
                  {!collapsed && <Text style={{ color: isDark ? '#e6edf3' : '#1e293b', fontSize: 13, fontWeight: 500 }}>{currentUser?.name}</Text>}
                </Space>
              </Dropdown>
            </Space>
          </Header>

          <Content style={{ margin: 20, minHeight: 280 }}>
            {children}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
