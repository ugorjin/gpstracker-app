import { useCallback } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAlarms, useLive } from '../api/hooks';
import type { StreamAlarm } from '../api/types';
import { useLiveStream } from '../api/useLiveStream';
import { useAuth, useMe } from '../auth/AuthContext';
import { Icon } from './Icon';
import { useToast } from './ui';

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Fleet Tracker';

export function Layout() {
  const me = useMe();
  const { logout } = useAuth();
  const toast = useToast();
  const live = useLive();
  const openAlarms = useAlarms({ status: 'open' });

  const onAlarm = useCallback(
    (a: StreamAlarm) => {
      const device = live.data?.devices.find((d) => d.id === a.deviceId);
      toast({
        kind: 'alarm',
        title: `${a.alarmText || 'Alarm'}: ${device?.name ?? a.deviceId}`,
        body: device?.plateNumber ?? undefined,
      });
    },
    [live.data, toast],
  );
  const streamState = useLiveStream(true, onAlarm);
  const openCount = openAlarms.data?.alarms.length ?? 0;
  const p = me.permissions;

  return (
    <div className="app">
      <header className="header">
        <NavLink to="/" className="brand">
          <span className="brand-mark">
            <Icon name="pin" size={16} />
          </span>
          {APP_NAME}
        </NavLink>
        <span className="header-org">· {me.org.name}</span>
        <span className="header-spacer" />
        <span className="stream-dot" data-state={streamState} title="Live updates">
          {streamState === 'live' ? 'Live' : streamState === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
        </span>
        <button className="icon-btn" onClick={() => void logout()} title="Log out" aria-label="Log out">
          <Icon name="logout" />
        </button>
      </header>

      <nav className="nav" aria-label="Main">
        <NavLink to="/" end>
          <Icon name="map" /> Live map
        </NavLink>
        <NavLink to="/alarms">
          <Icon name="bell" /> Alarms
          {openCount > 0 && <span className="count">{openCount > 99 ? '99+' : openCount}</span>}
        </NavLink>
        <NavLink to="/vehicles">
          <Icon name="car" /> Vehicles
        </NavLink>
        {(p.manageCustomers || p.manageUsers) && <div className="nav-section">Manage</div>}
        {p.manageCustomers && (
          <NavLink to="/customers" className="nav-desktop-only">
            <Icon name="building" /> Customers
          </NavLink>
        )}
        {p.manageUsers && (
          <NavLink to="/users" className="nav-desktop-only">
            <Icon name="users" /> Users
          </NavLink>
        )}
        <NavLink to="/account">
          <Icon name="user" /> Account
        </NavLink>
      </nav>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
