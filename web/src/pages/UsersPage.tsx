import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCreateUser, useOrgs, useUpdateUser, useUsers } from '../api/hooks';
import { ROLE_RANK, ROLES, type Role, type User } from '../api/types';
import { useMe } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { ErrorNote, Field, fieldError, Modal, Spinner, useToast } from '../components/ui';
import { formatDate, ROLE_HELP, ROLE_LABEL, timeAgo } from '../lib/format';

export function UsersPage() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const orgs = useOrgs();
  const orgId = Number(params.get('org')) || me.org.id;
  const org = orgs.data?.find((o) => o.id === orgId) ?? (orgId === me.org.id ? me.org : undefined);
  const users = useUsers(orgId);
  const [editing, setEditing] = useState<User | 'new'>();

  // Roles this user may give in this organisation.
  const own = orgId === me.org.id;
  const assignable = ROLES.filter((r) => !own || ROLE_RANK[r] <= ROLE_RANK[me.user.role]);
  const canEdit = (u: User) => u.id !== me.user.id && (!own || ROLE_RANK[u.role] <= ROLE_RANK[me.user.role]);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="grow">Users</h1>
        {me.permissions.isStaff && orgs.data && (
          <select className="input" style={{ width: 'auto', minWidth: 220 }} value={orgId} onChange={(e) => setParams({ org: e.target.value })} aria-label="Organization">
            {orgs.data.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Add user
        </button>
      </div>
      {org && !own && <p className="muted" style={{ marginTop: -6 }}>Users of {org.name}</p>}
      <ErrorNote error={users.error} />
      {users.isPending ? (
        <Spinner />
      ) : (
        <div className="card table-wrap">
          <table className="table responsive">
            <thead>
              <tr>
                <th>Name</th>
                <th>Login</th>
                <th>Role</th>
                <th>Last login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'inactive'}>
                  <td>
                    <strong>{u.name}</strong>
                    {u.id === me.user.id && <span className="muted small"> (you)</span>}
                    {!u.active && <div className="muted small">Deactivated</div>}
                  </td>
                  <td data-label="Login" className="small">
                    {u.phone && <div>{u.phone}</div>}
                    {u.email && <div className="muted">{u.email}</div>}
                  </td>
                  <td data-label="Role">
                    <span className="badge plain">{ROLE_LABEL[u.role]}</span>
                  </td>
                  <td data-label="Last login" className="small" title={u.lastLoginAt ? formatDate(u.lastLoginAt, me.org.utcOffsetMinutes) : undefined}>
                    {u.lastLoginAt ? timeAgo(u.lastLoginAt) : 'Never'}
                  </td>
                  <td className="actions">
                    {canEdit(u) && (
                      <button className="btn btn-sm" onClick={() => setEditing(u)}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <UserDialog orgId={orgId} countryHint={org?.countryCode ?? 'NG'} user={editing === 'new' ? undefined : editing} roles={assignable} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

function UserDialog({ orgId, user, roles, countryHint, onClose }: { orgId: number; user?: User; roles: Role[]; countryHint: string; onClose: () => void }) {
  const create = useCreateUser(orgId);
  const update = useUpdateUser(orgId);
  const mutation = user ? update : create;
  const toast = useToast();
  const [form, setForm] = useState({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
    role: (user?.role ?? 'viewer') as Role,
    password: '',
    active: user?.active ?? true,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const base = { name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null, role: form.role };
    try {
      if (user) {
        await update.mutateAsync({ id: user.id, ...base, active: form.active, ...(form.password ? { password: form.password } : {}) });
        toast({ kind: 'success', title: 'User saved' });
      } else {
        await create.mutateAsync({ ...base, password: form.password });
        toast({ kind: 'success', title: `${base.name} added`, body: `They can log in with ${base.phone ?? base.email}.` });
      }
      onClose();
    } catch {
      // shown below
    }
  };
  const err = mutation.error;

  return (
    <Modal
      title={user ? `Edit ${user.name}` : 'Add user'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="user-form" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit}>
        <Field label="Name" error={fieldError(err, 'name')}>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required />
        </Field>
        <div className="row">
          <Field label="Phone" hint={countryHint === 'NG' ? 'e.g. 0803 123 4567' : undefined} error={fieldError(err, 'phone')}>
            <input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
          </Field>
          <Field label="Email" error={fieldError(err, 'email')}>
            <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>
        <Field label="Role" hint={ROLE_HELP[form.role]}>
          <select className="input" value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={user ? 'New password (leave empty to keep)' : 'Password'}
          hint={user ? 'Setting a password logs the user out everywhere.' : 'At least 8 characters.'}
          error={fieldError(err, 'password')}
        >
          <input className="input" value={form.password} onChange={(e) => set('password', e.target.value)} minLength={8} required={!user} autoComplete="new-password" />
        </Field>
        {user && (
          <label className="checkbox">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
            <span>Active (uncheck to block this user)</span>
          </label>
        )}
        <ErrorNote error={err} />
      </form>
    </Modal>
  );
}
