import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import RunnersList from './pages/RunnersList';
import ImportRunners from './pages/ImportRunners';
import CheckIn from './pages/CheckIn';
import CheckPoint from './pages/CheckPoint';
import FinishLine from './pages/FinishLine';
import ScanLog from './pages/ScanLog';
import Toast from './components/Toast';
import DatabaseFlow from './pages/DatabaseFlow';
import BibCanvas from './pages/BibCanvas';
import EventManager from './pages/EventManager';
import StaffManager from './pages/StaffManager';
import StaffLogin from './pages/StaffLogin';
import AccessDenied from './components/AccessDenied';
import { useAuth } from './context/AuthContext';
import { canAccessRoute, landingRouteFor } from './lib/roles';

import AdminUserManagement from './pages/AdminUserManagement';
import OverallDashboard from './pages/OverallDashboard';
import LiveLeaderboard from './pages/LiveLeaderboard';

// Every authenticated route, in one place. Access per role is defined in
// lib/roles.js and enforced again by RLS on the server.
const APP_ROUTES = [
  { path: '/dashboard', element: <OverallDashboard /> },
  { path: '/leaderboard', element: <LiveLeaderboard /> },
  { path: '/events', element: <EventManager /> },
  { path: '/staff', element: <StaffManager /> },
  { path: '/runners', element: <RunnersList /> },
  { path: '/import', element: <ImportRunners /> },
  { path: '/checkin', element: <CheckIn /> },
  { path: '/checkpoint', element: <CheckPoint /> },
  { path: '/finish', element: <FinishLine /> },
  { path: '/log', element: <ScanLog /> },
  { path: '/bib-canvas', element: <BibCanvas /> },
  { path: '/database-flow', element: <DatabaseFlow /> },
  { path: '/admin/users', element: <AdminUserManagement /> },
];

function AuthLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-2)',
        fontSize: '14px',
        fontWeight: 600,
      }}
    >
      กำลังตรวจสอบสิทธิ์การเข้าใช้งาน…
    </div>
  );
}

function App() {
  const { session, loading, staffLoading, role } = useAuth();

  if (loading) return <AuthLoading />;

  // Unauthenticated: the login screen is the only reachable route.
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<StaffLogin />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // The staff row carries the role every route is gated on — wait for it rather
  // than briefly rendering as if the user had no permissions at all.
  if (staffLoading) return <AuthLoading />;

  const landingPath = landingRouteFor(role);

  // Signed in, but no staff row or an unknown role: nothing is safe to show.
  if (!landingPath) {
    return (
      <div className="app">
        <main className="main">
          <AccessDenied
            role={role}
            title="บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน"
            message="ไม่พบบทบาทเจ้าหน้าที่ของบัญชีนี้ในระบบ กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดสิทธิ์ก่อนใช้งาน"
          />
        </main>
        <Toast />
      </div>
    );
  }

  return (
    <div className="app">
      <Navbar />
      <main className="main">
        <Routes>
          <Route path="/login" element={<Navigate to={landingPath} replace />} />
          <Route path="/" element={<Navigate to={landingPath} replace />} />
          {APP_ROUTES.map(({ path, element }) => (
            <Route
              key={path}
              path={path}
              element={canAccessRoute(role, path) ? element : <AccessDenied role={role} landingPath={landingPath} />}
            />
          ))}
          <Route path="*" element={<Navigate to={landingPath} replace />} />
        </Routes>
      </main>
      <Toast />
    </div>
  );
}

export default App;
