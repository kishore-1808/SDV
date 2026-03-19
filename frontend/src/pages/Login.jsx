import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { loginUser } from '../services/api';

const API_BASE = 'https://backend-one-blush-33.vercel.app/api';

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [otpForm, setOtpForm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [displayedOtp, setDisplayedOtp] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginUser(form);
      const data = res.data;

      if (data.requires2FA) {
        setTempToken(data.tempToken);
        setDisplayedOtp(data.otp || '');
        setRequires2FA(true);
      } else {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        navigate('/dashboard');
      }
    } catch (err) {
      const d = err.response?.data;
      if (err.response?.status === 423) {
        setError(d.error || 'Account locked. Too many failed attempts.');
      } else if (d?.attemptsRemaining !== undefined) {
        setError(`${d.error} (${d.attemptsRemaining} attempts remaining)`);
      } else {
        setError(d?.error || 'Login failed. Check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOTPVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, otp: otpForm, tempToken })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Login to Secure Data Vault</h2>
        <p className="auth-subtitle">Context-Aware Encryption System</p>
        {error && <div className="error-msg">{error}</div>}

        {!requires2FA ? (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="Enter your email" />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required placeholder="Enter your password" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Authenticating...' : 'Login'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOTPVerify}>
            <div className="otp-section">
              <h3>Two-Factor Authentication</h3>
              {displayedOtp && (
                <>
                  <p className="subtitle">Your OTP is:</p>
                  <div style={{ background: 'var(--bg-input, #f0f0f0)', border: '1px solid var(--border, #ccc)', padding: '0.75rem 1.5rem', borderRadius: '8px', textAlign: 'center', fontSize: '1.8rem', fontFamily: 'monospace', letterSpacing: '0.5rem', color: 'var(--text, #333)', margin: '0.75rem 0', fontWeight: 'bold' }}>{displayedOtp}</div>
                </>
              )}
              <p className="subtitle">Enter the 6-digit code to login:</p>
              <input
                type="text"
                value={otpForm}
                onChange={(e) => setOtpForm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                maxLength={6}
                className="otp-input"
                required
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem' }}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading || otpForm.length !== 6}>
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setRequires2FA(false); setOtpForm(''); setDisplayedOtp(''); }}>
              Back to Login
            </button>
          </form>
        )}

        <p className="auth-link">
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
