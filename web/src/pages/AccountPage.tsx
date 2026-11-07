import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useChangePassword } from '../api/hooks';
import { useAuth, useMe } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { ErrorNote, Field, useToast } from '../components/ui';
import { ROLE_HELP, ROLE_LABEL } from '../lib/format';

export function AccountPage() {
  const me = useMe();
  const { logout } = useAuth();
  const change = useChangePassword();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const mismatch = repeat.length > 0 && next !== repeat;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setRepeat('');
      toast({ kind: 'success', title: 'Password changed', body: 'Other devices have been logged out.' });
    } catch {
      // shown below
    }
  };

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <h1 style={{ marginBottom: 16 }}>Account</h1>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 8 }}>{me.user.name}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {[me.user.phone, me.user.email].filter(Boolean).join(' · ')}
        </p>
        <p style={{ margin: '8px 0 0' }}>
          <span className="badge plain">{ROLE_LABEL[me.user.role]}</span> <span className="muted small">{ROLE_HELP[me.user.role]}</span>
        </p>
        <p className="muted small" style={{ margin: '8px 0 0' }}>
          {me.org.name}
        </p>
      </div>

      {(me.permissions.manageCustomers || me.permissions.manageUsers) && (
        <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {me.permissions.manageCustomers && (
            <Link className="btn" to="/customers">
              <Icon name="building" size={16} /> Customers
            </Link>
          )}
          {me.permissions.manageUsers && (
            <Link className="btn" to="/users">
              <Icon name="users" size={16} /> Users
            </Link>
          )}
        </div>
      )}

      <form className="card card-pad" onSubmit={submit} style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 12 }}>Change password</h2>
        <Field label="Current password">
          <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="At least 8 characters">
          <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required autoComplete="new-password" />
        </Field>
        <Field label="Repeat new password" error={mismatch ? 'Passwords do not match' : undefined}>
          <input className="input" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="new-password" aria-invalid={mismatch} />
        </Field>
        <ErrorNote error={change.error} />
        <button className="btn btn-primary" disabled={change.isPending || mismatch}>
          {change.isPending ? 'Saving…' : 'Change password'}
        </button>
      </form>

      <button className="btn" onClick={() => void logout()}>
        <Icon name="logout" size={16} /> Log out
      </button>
    </div>
  );
}
