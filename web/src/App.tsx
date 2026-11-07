import type { ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { AccountPage } from './pages/AccountPage';
import { AlarmsPage } from './pages/AlarmsPage';
import { CustomersPage } from './pages/CustomersPage';
import { HistoryPage } from './pages/HistoryPage';
import { LivePage } from './pages/LivePage';
import { LoginPage } from './pages/LoginPage';
import { UsersPage } from './pages/UsersPage';
import { VehiclesPage } from './pages/VehiclesPage';

function Allowed({ when, children }: { when: boolean; children: ReactNode }) {
  return when ? <>{children}</> : <Navigate to="/" replace />;
}

export function App() {
  const { me, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!me) return <LoginPage />;
  const p = me.permissions;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LivePage />} />
          <Route path="history/:id" element={<HistoryPage />} />
          <Route path="alarms" element={<AlarmsPage />} />
          <Route path="vehicles" element={<VehiclesPage />} />
          <Route path="customers" element={<Allowed when={p.manageCustomers}><CustomersPage /></Allowed>} />
          <Route path="users" element={<Allowed when={p.manageUsers}><UsersPage /></Allowed>} />
          <Route path="account" element={<AccountPage />} />
          <Route
            path="*"
            element={
              <div className="page empty">
                <p>Page not found.</p>
                <Link to="/">Back to the map</Link>
              </div>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
