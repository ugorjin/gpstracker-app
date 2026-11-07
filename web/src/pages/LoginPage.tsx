import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { APP_NAME } from '../components/Layout';
import { ErrorNote, Field } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await login(loginId.trim(), password);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">
            <Icon name="pin" size={16} />
          </span>
          {APP_NAME}
        </div>
        <p className="muted">Log in to see your vehicles</p>
        <ErrorNote error={error} />
        <Field label="Phone number or email">
          <input
            className="input"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
            inputMode="email"
            placeholder="0803 123 4567"
            required
            autoFocus
          />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <p className="muted small" style={{ margin: '16px 0 0' }}>
          Forgot your password? Ask your account administrator to reset it.
        </p>
      </form>
    </div>
  );
}
