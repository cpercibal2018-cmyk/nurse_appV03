import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { PageSkeleton } from './components/PageSkeleton';
import { useStore } from './lib/store';

const DashboardPage = lazy(() => import('./modules/dashboard/DashboardPage'));
const WorkforcePage = lazy(() => import('./modules/workforce/WorkforcePage'));
const UnitCapacityGrid = lazy(() => import('./modules/workforce/UnitCapacityGrid'));
const DepartmentsPage = lazy(() => import('./modules/workforce/DepartmentsPage'));
const PositionsPage = lazy(() => import('./modules/workforce/PositionsPage'));
const CredentialsModule = lazy(() => import('./modules/credentials/CredentialsModule'));
const MyCredentialsPage = lazy(() => import('./modules/credentials/MyCredentialsPage'));
const EligibilityModule = lazy(() => import('./modules/eligibility/EligibilityModule'));
const SchedulingModule = lazy(() => import('./modules/scheduling/SchedulingModule'));
const NotificationsModule = lazy(() => import('./modules/notifications/NotificationsModule'));
const AuditModule = lazy(() => import('./modules/audit/AuditModule'));
const ObservabilityPage = lazy(() => import('./modules/observability/ObservabilityPage'));
const AdminModule = lazy(() => import('./modules/admin/AdminModule'));
const RoleMatrixPage = lazy(() => import('./modules/admin/RoleMatrixPage'));
const ContractsPage = lazy(() => import('./modules/contracts/ContractsPage'));
const NursingKpiPage = lazy(() => import('./modules/kpi/NursingKpiPage'));
const LoginPage = lazy(() => import('./modules/auth/LoginPage'));

function lazyRoute(Component: React.LazyExoticComponent<any>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Component />
    </Suspense>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={lazyRoute(LoginPage)} />
        <Route path="/" element={<ProtectedRoute>{lazyRoute(DashboardPage)}</ProtectedRoute>} />
        <Route path="/workforce" element={<ProtectedRoute>{lazyRoute(WorkforcePage)}</ProtectedRoute>} />
        <Route path="/units" element={<ProtectedRoute>{lazyRoute(UnitCapacityGrid)}</ProtectedRoute>} />
        <Route path="/departments" element={<ProtectedRoute>{lazyRoute(DepartmentsPage)}</ProtectedRoute>} />
        <Route path="/positions" element={<ProtectedRoute>{lazyRoute(PositionsPage)}</ProtectedRoute>} />
        <Route path="/credentials" element={<ProtectedRoute>{lazyRoute(CredentialsModule)}</ProtectedRoute>} />
        <Route path="/my-credentials" element={<ProtectedRoute>{lazyRoute(MyCredentialsPage)}</ProtectedRoute>} />
        <Route path="/eligibility" element={<ProtectedRoute>{lazyRoute(EligibilityModule)}</ProtectedRoute>} />
        <Route path="/scheduling" element={<ProtectedRoute>{lazyRoute(SchedulingModule)}</ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute>{lazyRoute(NotificationsModule)}</ProtectedRoute>} />
        <Route path="/audit" element={<ProtectedRoute>{lazyRoute(AuditModule)}</ProtectedRoute>} />
        <Route path="/observability" element={<ProtectedRoute>{lazyRoute(ObservabilityPage)}</ProtectedRoute>} />
        <Route path="/kpi" element={<ProtectedRoute>{lazyRoute(NursingKpiPage)}</ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute>{lazyRoute(AdminModule)}</ProtectedRoute>} />
        <Route path="/roles" element={<ProtectedRoute>{lazyRoute(RoleMatrixPage)}</ProtectedRoute>} />
        <Route path="/contracts" element={<ProtectedRoute>{lazyRoute(ContractsPage)}</ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
