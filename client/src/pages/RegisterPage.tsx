import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';

type ContactMethod = 'email' | 'phone';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [contactMethod, setContactMethod] = useState<ContactMethod>('email');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register({
        name,
        password,
        email: contactMethod === 'email' ? contact : undefined,
        phone: contactMethod === 'phone' ? contact : undefined,
      });
      navigate('/');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleMethodChange(method: ContactMethod) {
    setContactMethod(method);
    setContact(''); // avoid submitting a phone number into the email field or vice versa
  }

  return (
    <div className="auth-page">
      <form onSubmit={handleSubmit} className="auth-form">
        <h1>Register</h1>
        {error && <p className="form-error">{error}</p>}
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <div className="contact-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={contactMethod === 'email'}
            className={contactMethod === 'email' ? 'contact-tab contact-tab-active' : 'contact-tab'}
            onClick={() => handleMethodChange('email')}
          >
            Email
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={contactMethod === 'phone'}
            className={contactMethod === 'phone' ? 'contact-tab contact-tab-active' : 'contact-tab'}
            onClick={() => handleMethodChange('phone')}
          >
            Mobile Number
          </button>
        </div>

        <input
          type={contactMethod === 'email' ? 'email' : 'tel'}
          value={contact}
          onChange={(e) => {
            const value = e.target.value;
            // Phone numbers are digits only: no '+', spaces, or letters,
            // starting with 0 or 60 (e.g. 0123456789 / 60123456789), capped
            // at 13 digits. Strip anything else as the user types.
            setContact(contactMethod === 'phone' ? value.replace(/\D/g, '').slice(0, 13) : value);
          }}
          placeholder={contactMethod === 'email' ? 'Email' : 'e.g. 60123456789 or 0123456789'}
          aria-label={contactMethod === 'email' ? 'Email' : 'Mobile number'}
          inputMode={contactMethod === 'phone' ? 'numeric' : undefined}
          pattern={contactMethod === 'phone' ? '(60|0)[0-9]{7,11}' : undefined}
          title={contactMethod === 'phone' ? 'Digits only, starting with 0 or 60, e.g. 0123456789 or 60123456789' : undefined}
          required
        />

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Register'}
        </button>
        <p>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
