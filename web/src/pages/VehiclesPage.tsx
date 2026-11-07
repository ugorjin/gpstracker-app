import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCreateDevice, useDevices, useOrgs, useUnregistered, useUpdateDevice } from '../api/hooks';
import { DEVICE_KINDS, type Device, type DeviceKind, type Org } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { Icon, KIND_ICON } from '../components/Icon';
import { ErrorNote, Field, fieldError, Modal, Spinner, StatusBadge, useToast } from '../components/ui';
import { daysUntil, formatDate, KIND_LABEL, timeAgo } from '../lib/format';

/** yyyy-mm-dd for <input type="date"> */
const dateInput = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');
/** End of the chosen day, UTC, so "paid until 7 Nov" includes 7 Nov. */
const fromDateInput = (v: string) => (v ? new Date(`${v}T23:59:59Z`).toISOString() : null);

function addYears(base: string | null, years: number): string {
  const start = base && Date.parse(base) > Date.now() ? new Date(base) : new Date();
  start.setUTCFullYear(start.getUTCFullYear() + years);
  return start.toISOString().slice(0, 10);
}

export function VehiclesPage() {
  const me = useMe();
  const offset = me.org.utcOffsetMinutes;
  const devices = useDevices();
  const orgs = useOrgs();
  const isStaff = me.permissions.isStaff;
  const canEdit = me.permissions.manageUsers; // admins and owners
  const unregistered = useUnregistered(me.org.type === 'platform' && me.permissions.manageDeviceInventory);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Device | 'new' | { prefillId: string; prefillName: string | null }>();

  const orgName = useMemo(() => new Map((orgs.data ?? []).map((o) => [o.id, o.name])), [orgs.data]);
  const shown = (devices.data ?? []).filter((d) => {
    const s = q.toLowerCase();
    return !s || d.name.toLowerCase().includes(s) || (d.plateNumber ?? '').toLowerCase().includes(s) || d.id.includes(s) || (orgName.get(d.orgId) ?? '').toLowerCase().includes(s);
  });

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="grow">Vehicles</h1>
        <label className="search" style={{ minWidth: 220 }}>
          <Icon name="search" size={16} />
          <span className="sr-only">Search</span>
          <input className="input" placeholder={isStaff ? 'Name, plate, IMEI or customer' : 'Name or plate'} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {me.permissions.manageDeviceInventory && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> Add tracker
          </button>
        )}
      </div>

      {unregistered.data && unregistered.data.length > 0 && (
        <div className="alert alert-info">
          <strong>{unregistered.data.length} tracker(s) are sending data but are not assigned to a customer:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {unregistered.data.slice(0, 5).map((u) => (
              <li key={u.deviceId}>
                <span className="mono">{u.deviceId}</span> {u.deviceName && `(${u.deviceName})`} · seen {timeAgo(u.lastSeenAt)}{' '}
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing({ prefillId: u.deviceId, prefillName: u.deviceName })}>
                  Assign
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ErrorNote error={devices.error} />
      {devices.isPending ? (
        <Spinner />
      ) : (
        <div className="card table-wrap">
          {shown.length === 0 ? (
            <div className="empty">{devices.data?.length ? 'No vehicles match.' : 'No vehicles yet.'}</div>
          ) : (
            <table className="table responsive">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  {isStaff && <th>Customer</th>}
                  <th>Status</th>
                  <th>Subscription</th>
                  {isStaff && <th>IMEI</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => {
                  const days = daysUntil(d.paidUntil);
                  return (
                    <tr key={d.id} className={d.active ? '' : 'inactive'}>
                      <td>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span className="vehicle-icon" data-status={d.status} style={{ width: 30, height: 30 }}>
                            <Icon name={KIND_ICON[d.kind]} size={16} />
                          </span>
                          <div>
                            <strong>{d.name}</strong>
                            <div className="muted small">
                              {d.plateNumber ?? KIND_LABEL[d.kind]}
                              {!d.active && ' · deactivated'}
                            </div>
                          </div>
                        </div>
                      </td>
                      {isStaff && <td data-label="Customer">{orgName.get(d.orgId) ?? `#${d.orgId}`}</td>}
                      <td data-label="Status">
                        <StatusBadge status={d.status} />
                      </td>
                      <td data-label="Subscription">
                        {d.paidUntil === null ? (
                          <span className="muted">No expiry</span>
                        ) : days !== null && days < 0 ? (
                          <span className="badge warn plain">Ended {formatDate(d.paidUntil, offset)}</span>
                        ) : (
                          <span className={days !== null && days <= 14 ? 'badge warn plain' : ''}>Until {formatDate(d.paidUntil, offset)}</span>
                        )}
                      </td>
                      {isStaff && (
                        <td data-label="IMEI" className="mono">
                          {d.id}
                        </td>
                      )}
                      <td className="actions">
                        {d.status !== 'subscription_expired' && (
                          <Link className="btn btn-sm btn-ghost" to={`/history/${encodeURIComponent(d.id)}`}>
                            History
                          </Link>
                        )}
                        {canEdit && (
                          <button className="btn btn-sm" onClick={() => setEditing(d)}>
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {editing && (
        <DeviceDialog
          device={typeof editing === 'object' && 'id' in editing ? editing : undefined}
          prefill={typeof editing === 'object' && 'prefillId' in editing ? editing : undefined}
          orgs={(orgs.data ?? []).filter((o) => o.active)}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

function DeviceDialog({
  device,
  prefill,
  orgs,
  onClose,
}: {
  device?: Device;
  prefill?: { prefillId: string; prefillName: string | null };
  orgs: Org[];
  onClose: () => void;
}) {
  const me = useMe();
  const toast = useToast();
  const isStaff = me.permissions.isStaff;
  const create = useCreateDevice();
  const update = useUpdateDevice();
  const mutation = device ? update : create;
  const customers = orgs.filter((o) => o.type === 'customer');

  const [form, setForm] = useState({
    deviceId: device?.id ?? prefill?.prefillId ?? '',
    name: device?.name ?? prefill?.prefillName ?? '',
    kind: (device?.kind ?? 'car') as DeviceKind,
    plateNumber: device?.plateNumber ?? '',
    orgId: String(device?.orgId ?? customers[0]?.id ?? me.org.id),
    vendorDeviceType: String(device?.vendorDeviceType ?? 1),
    simNumber: device?.simNumber ?? '',
    notes: device?.notes ?? '',
    paidUntil: device ? dateInput(device.paidUntil) : addYears(null, 1),
    active: device?.active ?? true,
    registerWithVendor: false,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const common = {
      name: form.name.trim(),
      kind: form.kind,
      plateNumber: form.plateNumber.trim() || null,
      notes: form.notes.trim() || null,
    };
    const staffFields = {
      orgId: Number(form.orgId),
      vendorDeviceType: Number(form.vendorDeviceType),
      simNumber: form.simNumber.trim() || null,
      paidUntil: fromDateInput(form.paidUntil),
    };
    try {
      if (device) {
        await update.mutateAsync({ id: device.id, ...common, ...(isStaff ? { ...staffFields, active: form.active } : {}) });
        toast({ kind: 'success', title: 'Vehicle saved' });
      } else {
        await create.mutateAsync({ deviceId: form.deviceId.trim(), ...common, ...staffFields, registerWithVendor: form.registerWithVendor });
        toast({ kind: 'success', title: 'Tracker added', body: form.name });
      }
      onClose();
    } catch {
      // shown below
    }
  };

  const err = mutation.error;
  return (
    <Modal
      title={device ? `Edit ${device.name}` : 'Add tracker'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="device-form" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="device-form" onSubmit={submit}>
        {!device && (
          <Field label="Tracker IMEI / device ID" hint="Printed on the tracker or its box" error={fieldError(err, 'deviceId')}>
            <input className="input mono" value={form.deviceId} onChange={(e) => set('deviceId', e.target.value)} required inputMode="numeric" />
          </Field>
        )}
        <div className="row">
          <Field label="Name" error={fieldError(err, 'name')}>
            <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="e.g. Hilux – Ikeja" />
          </Field>
          <Field label="Plate number">
            <input className="input" value={form.plateNumber} onChange={(e) => set('plateNumber', e.target.value.toUpperCase())} placeholder="LAG-123-XY" />
          </Field>
        </div>
        <Field label="Type">
          <select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value as DeviceKind)}>
            {DEVICE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>

        {isStaff && (
          <>
            <Field label="Customer" error={fieldError(err, 'orgId')}>
              <select className="input" value={form.orgId} onChange={(e) => set('orgId', e.target.value)}>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.type !== 'customer' ? ` (${o.type}, stock)` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <div className="row">
              <Field label="Paid until" hint="Empty = no expiry">
                <input className="input" type="date" value={form.paidUntil} onChange={(e) => set('paidUntil', e.target.value)} />
              </Field>
              <div className="field">
                <span>Renew</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2].map((y) => (
                    <button type="button" key={y} className="btn btn-sm" onClick={() => set('paidUntil', addYears(fromDateInput(form.paidUntil), y))}>
                      +{y} year{y > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="row">
              <Field label="Vendor device type" hint="1 = JT808. Decides which engine-cut command is used.">
                <input className="input" type="number" min={0} value={form.vendorDeviceType} onChange={(e) => set('vendorDeviceType', e.target.value)} required />
              </Field>
              <Field label="SIM number">
                <input className="input" value={form.simNumber} onChange={(e) => set('simNumber', e.target.value)} inputMode="tel" />
              </Field>
            </div>
            {!device && (
              <label className="checkbox">
                <input type="checkbox" checked={form.registerWithVendor} onChange={(e) => set('registerWithVendor', e.target.checked)} />
                <span>Also add this tracker on the vendor platform (if it isn't there yet)</span>
              </label>
            )}
            {device && (
              <label className="checkbox">
                <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
                <span>Active (uncheck to hide it from the customer)</span>
              </label>
            )}
          </>
        )}
        <Field label="Notes">
          <textarea className="input" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Driver, installer, where the tracker is fitted…" />
        </Field>
        <ErrorNote error={err} />
      </form>
    </Modal>
  );
}
