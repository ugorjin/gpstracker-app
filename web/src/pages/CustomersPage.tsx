import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCreateOrg, useDevices, useOrgs, useUpdateOrg } from '../api/hooks';
import type { CustomerKind, Org } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { ErrorNote, Field, fieldError, Modal, Spinner, useToast } from '../components/ui';
import { formatDate } from '../lib/format';

export function CustomersPage() {
  const me = useMe();
  const orgs = useOrgs();
  const devices = useDevices();
  const update = useUpdateOrg();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const deviceCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of devices.data ?? []) m.set(d.orgId, (m.get(d.orgId) ?? 0) + 1);
    return m;
  }, [devices.data]);
  const byId = useMemo(() => new Map((orgs.data ?? []).map((o) => [o.id, o])), [orgs.data]);

  const shown = (orgs.data ?? [])
    .filter((o) => o.id !== me.org.id)
    .filter((o) => {
      const s = q.toLowerCase();
      return !s || o.name.toLowerCase().includes(s) || (o.phone ?? '').includes(s) || (o.email ?? '').includes(s);
    });

  const toggleActive = async (o: Org) => {
    if (o.active && !confirm(`Deactivate ${o.name}? Its users will be logged out and cannot log in until you reactivate it.`)) return;
    try {
      await update.mutateAsync({ id: o.id, active: !o.active });
      toast({ kind: 'success', title: o.active ? `${o.name} deactivated` : `${o.name} reactivated` });
    } catch (err) {
      toast({ kind: 'error', title: 'Could not update', body: (err as Error).message });
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="grow">Customers</h1>
        <label className="search" style={{ minWidth: 220 }}>
          <Icon name="search" size={16} />
          <span className="sr-only">Search</span>
          <input className="input" placeholder="Name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> New customer
        </button>
      </div>
      <ErrorNote error={orgs.error} />
      {orgs.isPending ? (
        <Spinner />
      ) : (
        <div className="card table-wrap">
          {shown.length === 0 ? (
            <div className="empty">No customers yet. Create the first one.</div>
          ) : (
            <table className="table responsive">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Contact</th>
                  <th>Vehicles</th>
                  <th>Since</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.id} className={o.active ? '' : 'inactive'}>
                    <td>
                      <strong>{o.name}</strong>
                      {o.parentId !== me.org.id && byId.get(o.parentId ?? 0) && <div className="muted small">via {byId.get(o.parentId!)!.name}</div>}
                      {!o.active && <div className="muted small">Deactivated</div>}
                    </td>
                    <td data-label="Type">
                      <span className="badge plain">{o.type === 'reseller' ? 'Reseller' : o.customerKind === 'individual' ? 'Individual' : 'Business'}</span>
                    </td>
                    <td data-label="Contact" className="small">
                      {o.phone && <div>{o.phone}</div>}
                      {o.email && <div className="muted">{o.email}</div>}
                      {!o.phone && !o.email && <span className="muted">—</span>}
                    </td>
                    <td data-label="Vehicles">{deviceCount.get(o.id) ?? 0}</td>
                    <td data-label="Since" className="small">
                      {formatDate(o.createdAt, me.org.utcOffsetMinutes)}
                    </td>
                    <td className="actions">
                      <Link className="btn btn-sm btn-ghost" to={`/users?org=${o.id}`}>
                        Users
                      </Link>
                      <button className="btn btn-sm" onClick={() => void toggleActive(o)}>
                        {o.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {creating && <NewCustomerDialog parents={(orgs.data ?? []).filter((o) => o.type !== 'customer' && o.active)} onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewCustomerDialog({ parents, onClose }: { parents: Org[]; onClose: () => void }) {
  const me = useMe();
  const create = useCreateOrg();
  const toast = useToast();
  const [form, setForm] = useState({
    type: 'customer' as 'customer' | 'reseller',
    customerKind: 'business' as CustomerKind,
    parentId: String(me.org.id),
    name: '',
    phone: '',
    email: '',
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
    ownerPassword: '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const individual = form.type === 'customer' && form.customerKind === 'individual';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await create.mutateAsync({
        type: form.type,
        customerKind: form.type === 'customer' ? form.customerKind : undefined,
        parentId: Number(form.parentId),
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        owner: {
          name: (individual && !form.ownerName.trim() ? form.name : form.ownerName).trim(),
          phone: (individual && !form.ownerPhone.trim() ? form.phone : form.ownerPhone).trim() || null,
          email: form.ownerEmail.trim() || null,
          password: form.ownerPassword,
        },
      });
      toast({ kind: 'success', title: `${res.org.name} created`, body: `${res.owner?.name} can now log in with ${res.owner?.phone ?? res.owner?.email}.` });
      onClose();
    } catch {
      // shown below
    }
  };
  const err = create.error;

  return (
    <Modal
      title="New customer"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="customer-form" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <form id="customer-form" onSubmit={submit}>
        <div className="segmented" role="group" aria-label="Customer type" style={{ display: 'flex', marginBottom: 14 }}>
          <button type="button" style={{ flex: 1 }} aria-pressed={form.type === 'customer' && form.customerKind === 'business'} onClick={() => setForm((f) => ({ ...f, type: 'customer', customerKind: 'business' }))}>
            Business fleet
          </button>
          <button type="button" style={{ flex: 1 }} aria-pressed={individual} onClick={() => setForm((f) => ({ ...f, type: 'customer', customerKind: 'individual' }))}>
            Individual
          </button>
          <button type="button" style={{ flex: 1 }} aria-pressed={form.type === 'reseller'} onClick={() => set('type', 'reseller')}>
            Reseller
          </button>
        </div>

        {parents.length > 1 && (
          <Field label="Belongs to">
            <select className="input" value={form.parentId} onChange={(e) => set('parentId', e.target.value)}>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={individual ? 'Full name' : 'Company name'} error={fieldError(err, 'name')}>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </Field>
        <div className="row">
          <Field label="Phone" error={fieldError(err, 'phone')}>
            <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" placeholder="0803 123 4567" />
          </Field>
          <Field label="Email" error={fieldError(err, 'email')}>
            <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>

        <h3 style={{ margin: '6px 0 4px' }}>{individual ? 'Login' : 'Account owner (first login)'}</h3>
        <p className="muted small" style={{ marginTop: 0 }}>
          {individual ? 'Leave name and phone empty to use the ones above.' : 'This person can add more users and manage the fleet.'}
        </p>
        <div className="row">
          <Field label="Name">
            <input className="input" value={form.ownerName} onChange={(e) => set('ownerName', e.target.value)} required={!individual} />
          </Field>
          <Field label="Phone" error={fieldError(err, 'owner.phone')}>
            <input className="input" value={form.ownerPhone} onChange={(e) => set('ownerPhone', e.target.value)} inputMode="tel" />
          </Field>
        </div>
        <Field label="Email (optional)" error={fieldError(err, 'owner.email')}>
          <input className="input" type="email" value={form.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} />
        </Field>
        <Field label="Temporary password" hint="At least 8 characters. Give it to the customer; they can change it under Account." error={fieldError(err, 'owner.password')}>
          <input className="input" value={form.ownerPassword} onChange={(e) => set('ownerPassword', e.target.value)} minLength={8} required autoComplete="new-password" />
        </Field>
        <ErrorNote error={err} />
      </form>
    </Modal>
  );
}
