import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useCommandLog, useLive } from '../api/hooks';
import type { Device, DeviceStatus } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { Icon, KIND_ICON } from '../components/Icon';
import { ErrorNote, Spinner, StatusBadge } from '../components/ui';
import { daysUntil, formatDateTime, formatKm, formatSpeed, KIND_LABEL, STATUS_LABEL, timeAgo } from '../lib/format';
import { FleetMap } from '../map/FleetMap';
import { CommandDialog, type CommandKind } from './CommandDialog';

const FILTERS: (DeviceStatus | 'all')[] = ['all', 'moving', 'stopped', 'offline'];

function matches(d: Device, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return d.name.toLowerCase().includes(s) || (d.plateNumber ?? '').toLowerCase().includes(s) || d.id.includes(s);
}

export function LivePage() {
  const me = useMe();
  const live = useLive();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('v') ?? undefined;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<DeviceStatus | 'all'>('all');
  const [listCollapsed, setListCollapsed] = useState(false);

  const devices = useMemo(() => live.data?.devices.filter((d) => d.active) ?? [], [live.data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: devices.length };
    for (const d of devices) c[d.status === 'no_data' ? 'offline' : d.status] = (c[d.status === 'no_data' ? 'offline' : d.status] ?? 0) + 1;
    return c;
  }, [devices]);
  const shown = devices.filter(
    (d) => matches(d, q) && (filter === 'all' || d.status === filter || (filter === 'offline' && d.status === 'no_data')),
  );
  const selected = devices.find((d) => d.id === selectedId);

  const select = (id: string | undefined) => {
    const next = new URLSearchParams(params);
    if (id) next.set('v', id);
    else next.delete('v');
    setParams(next, { replace: true });
  };

  if (live.isPending) return <Spinner label="Loading vehicles…" />;
  if (live.error) return <div className="page"><ErrorNote error={live.error} /></div>;

  return (
    <div className="live">
      <section className={`live-list${listCollapsed ? ' collapsed' : ''}`} aria-label="Vehicles">
        <div className="live-list-head">
          <button className="grabber" onClick={() => setListCollapsed((c) => !c)} aria-label={listCollapsed ? 'Show list' : 'Hide list'} />
          <label className="search">
            <Icon name="search" size={16} />
            <span className="sr-only">Search vehicles</span>
            <input className="input" placeholder="Search name or plate" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setListCollapsed(false)} />
          </label>
          <div className="status-filters" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : STATUS_LABEL[f]} {counts[f] ?? 0}
              </button>
            ))}
          </div>
        </div>
        {devices.length === 0 ? (
          <div className="empty">
            <p>No vehicles yet.</p>
            {me.permissions.manageDeviceInventory ? (
              <Link className="btn btn-primary" to="/vehicles">
                Add a vehicle
              </Link>
            ) : (
              <p className="small">Your provider will add your trackers to this account.</p>
            )}
          </div>
        ) : (
          <ul className="vehicle-list">
            {shown.map((d) => (
              <li key={d.id}>
                <button className="vehicle-item" aria-current={d.id === selectedId} onClick={() => select(d.id)}>
                  <span className="vehicle-icon" data-status={d.status}>
                    <Icon name={KIND_ICON[d.kind]} size={18} />
                  </span>
                  <span className="vehicle-meta">
                    <span className="name">{d.name}</span>
                    <span className="sub">
                      {d.plateNumber ? `${d.plateNumber} · ` : ''}
                      {d.status === 'subscription_expired'
                        ? 'Subscription expired'
                        : d.position
                          ? `${STATUS_LABEL[d.status]} · ${timeAgo(d.position.lastSeenAt)}`
                          : 'No data yet'}
                    </span>
                  </span>
                  {d.status === 'moving' && <span className="vehicle-speed">{formatSpeed(d.position?.speedKmh)}</span>}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="empty small">No vehicles match.</li>}
          </ul>
        )}
      </section>

      <div className="map-wrap">
        <FleetMap devices={devices} selectedId={selectedId} onSelect={select} />
        {selected && <DetailPanel device={selected} onClose={() => select(undefined)} />}
      </div>
    </div>
  );
}

function DetailPanel({ device, onClose }: { device: Device; onClose: () => void }) {
  const me = useMe();
  const offset = me.org.utcOffsetMinutes;
  const [command, setCommand] = useState<CommandKind>();
  const log = useCommandLog(device.id);
  const pos = device.position;
  const days = daysUntil(device.paidUntil);
  const temps = pos?.sensors?.temperaturesC.filter((t): t is number => t !== null) ?? [];
  const tanks = pos?.fuel?.tanksL.filter((t): t is number => t !== null) ?? [];
  const canCommand = me.permissions.sendCommands && device.subscriptionActive;
  const lastCommand = log.data?.[0];

  return (
    <aside className="detail-panel" aria-label={`${device.name} details`}>
      <div className="detail-head">
        <span className="vehicle-icon" data-status={device.status}>
          <Icon name={KIND_ICON[device.kind]} size={18} />
        </span>
        <div className="grow">
          <h2 style={{ fontSize: '1rem' }}>{device.name}</h2>
          <div className="muted small">
            {device.plateNumber ?? KIND_LABEL[device.kind]} <StatusBadge status={device.status} />
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close details">
          <Icon name="x" />
        </button>
      </div>

      {device.status === 'subscription_expired' ? (
        <div className="alert alert-warn" style={{ margin: '0 14px 12px' }}>
          The subscription for this vehicle ended on {formatDateTime(device.paidUntil, offset)}. Renew it to see its location again.
        </div>
      ) : !pos ? (
        <p className="muted small" style={{ padding: '0 14px' }}>
          This tracker hasn't sent any data yet. Check that it is installed, powered and has a working SIM.
        </p>
      ) : (
        <dl className="detail-grid">
          <div>
            <dt>Speed</dt>
            <dd>{formatSpeed(pos.speedKmh)}</dd>
          </div>
          <div>
            <dt>Last update</dt>
            <dd title={formatDateTime(pos.lastSeenAt, offset)}>{timeAgo(pos.lastSeenAt)}</dd>
          </div>
          <div>
            <dt>Odometer</dt>
            <dd>{formatKm(pos.odometerKm)}</dd>
          </div>
          <div>
            <dt>Position from</dt>
            <dd>{pos.source?.toUpperCase() ?? '—'}</dd>
          </div>
          {pos.voltage !== null && (
            <div>
              <dt>Power</dt>
              <dd>{pos.voltage === 0 ? <span className="badge danger plain">Cut</span> : `${pos.voltage} V`}</dd>
            </div>
          )}
          {pos.batteryPct !== null && (
            <div>
              <dt>Tracker battery</dt>
              <dd>{Math.round(pos.batteryPct)}%</dd>
            </div>
          )}
          {tanks.length > 0 && (
            <div>
              <dt>Fuel</dt>
              <dd>{tanks.map((t) => `${Math.round(t)} L`).join(' / ')}</dd>
            </div>
          )}
          {temps.length > 0 && (
            <div>
              <dt>Temperature</dt>
              <dd>{temps.map((t) => `${t.toFixed(1)} °C`).join(' / ')}</dd>
            </div>
          )}
          {pos.statusText && (
            <div style={{ gridColumn: '1 / -1' }}>
              <dt>Status</dt>
              <dd style={{ fontWeight: 500 }}>{pos.statusText}</dd>
            </div>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>Location</dt>
            <dd style={{ fontWeight: 500 }}>
              <a href={`https://www.google.com/maps?q=${pos.lat},${pos.lon}`} target="_blank" rel="noreferrer">
                {pos.lat.toFixed(5)}, {pos.lon.toFixed(5)}
              </a>
            </dd>
          </div>
        </dl>
      )}

      {days !== null && days >= 0 && days <= 14 && (
        <div className="alert alert-warn small" style={{ margin: '0 14px 12px' }}>
          Subscription ends in {days === 0 ? 'less than a day' : `${days} day${days === 1 ? '' : 's'}`}.
        </div>
      )}

      {lastCommand && (
        <p className="small muted" style={{ padding: '0 14px', margin: '0 0 10px' }}>
          Last command: <strong>{lastCommand.command.replace('_', ' ')}</strong> by {lastCommand.userName ?? 'unknown'},{' '}
          {timeAgo(lastCommand.createdAt)} ({lastCommand.accepted ? lastCommand.statusText : lastCommand.statusText ?? 'failed'})
        </p>
      )}

      <div className="detail-actions">
        {device.status !== 'subscription_expired' && (
          <Link className="btn" to={`/history/${encodeURIComponent(device.id)}`}>
            <Icon name="history" size={16} /> History
          </Link>
        )}
        {canCommand && (
          <>
            <button className="btn" onClick={() => setCommand('engine_cut')} style={{ color: 'var(--danger)' }}>
              <Icon name="power" size={16} /> Cut engine
            </button>
            <button className="btn" onClick={() => setCommand('engine_restore')}>
              <Icon name="key" size={16} /> Restore engine
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCommand('speed_limit')}>
              <Icon name="gauge" size={16} /> Speed limit
            </button>
          </>
        )}
      </div>
      {command && <CommandDialog device={device} kind={command} onClose={() => setCommand(undefined)} />}
    </aside>
  );
}
