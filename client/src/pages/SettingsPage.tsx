import { useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Header } from '../components/Header';
import { useToast } from '../context/ToastContext';

export function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!email.trim() && !phone.trim()) {
      setError('Please provide at least an email or a phone number');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setSuccess(true);
      showToast('Profile updated successfully');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError('New password and confirmation do not match');
      return;
    }

    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordSuccess(true);
      showToast('Password changed successfully');
    } catch (err) {
      setPasswordError(apiErrorMessage(err));
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="page">
      <Header />
      <main className="container">
        <h1>Settings</h1>

        <section className="card">
          <h2>Profile information</h2>
          <form onSubmit={handleSubmit} className="upload-form">
            {error && <p className="form-error">{error}</p>}
            {success && <p className="form-notice">Profile updated.</p>}
            <label>
              Name
              <input value={name} onChange={(e) => { setName(e.target.value); setSuccess(false); }} required />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setSuccess(false); }}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Phone number
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  // Digits only: no '+', spaces, or letters, starting with 0 or
                  // 60 (e.g. 0123456789 / 60123456789), capped at 13 digits.
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 13));
                  setSuccess(false);
                }}
                placeholder="60123456789 or 0123456789"
                inputMode="numeric"
                pattern="(60|0)[0-9]{7,11}"
                title="Digits only, starting with 0 or 60, e.g. 0123456789 or 60123456789"
              />
            </label>
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Change password</h2>
          <form onSubmit={handlePasswordSubmit} className="upload-form">
            {passwordError && <p className="form-error">{passwordError}</p>}
            {passwordSuccess && <p className="form-notice">Password changed.</p>}
            <label>
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setPasswordSuccess(false); }}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordSuccess(false); }}
                minLength={8}
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => { setConfirmNewPassword(e.target.value); setPasswordSuccess(false); }}
                minLength={8}
                required
              />
            </label>
            <button type="submit" disabled={changingPassword}>
              {changingPassword ? 'Changing...' : 'Change password'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
