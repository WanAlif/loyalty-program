import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';

export function AdminLoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { adminLogin } = useAuth();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      // Hits POST /api/auth/admin-login, a separate endpoint from the
      // regular user login. The server only ever issues a session there
      // for an ADMIN account — a regular user's correct credentials are
      // rejected with the same generic "Invalid credentials" message as
      // an unknown account, so there's no way to tell from the response
      // whether the account exists but is the wrong kind. AuthContext's
      // user state is set on success, and App.tsx's /admin route
      // re-renders into AdminDashboard automatically.
      await adminLogin(identifier, password);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form onSubmit={handleSubmit} className="auth-form">
        <h1>Admin login</h1>
        {error && <p className="form-error">{error}</p>}
        <label>
          Email or phone
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
