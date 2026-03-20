import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { loginUser } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginUser(form);
      const data = res.data;
      login(data.token, data.user);
      navigate('/dashboard');
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

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>Login to Secure Data Vault</h2>
        <p className="auth-subtitle">Context-Aware Encryption System</p>
        {error && <div className="error-msg">{error}</div>}
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
        <p className="auth-link">
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
