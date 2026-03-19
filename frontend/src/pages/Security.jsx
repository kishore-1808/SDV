import { useState, useEffect } from 'react';
import { useAuth, useTheme } from '../context/AuthContext';

const API_BASE = 'https://backend-one-blush-33.vercel.app/api';

export default function Security() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sessions, setSessions] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ipWhitelist, setIpWhitelist] = useState('');
  const [activeTab, setActiveTab] = useState('security');

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState('');
  const [displayedOtp, setDisplayedOtp] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [secRes, sesRes, settingsRes] = await Promise.all([
        fetch(`${API_BASE}/security/security-status`, { headers }),
        fetch(`${API_BASE}/security/sessions`, { headers }),
        fetch(`${API_BASE}/advanced/settings`, { headers })
      ]);
      setSettings(await settingsRes.json());
      setSessions((await sesRes.json()).sessions || []);
    } catch (err) { setError('Failed to load data'); }
    finally { setLoading(false); }
  };

  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

  const handleRevokeSession = async (id) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/security/sessions/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      showSuccess('Session revoked.');
      setSessions(sessions.filter(s => s._id !== id));
    } catch { setError('Failed to revoke session.'); }
  };

  const handleRevokeAll = async () => {
    if (!confirm('Revoke all other sessions?')) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/security/sessions`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      showSuccess('All other sessions revoked.');
      fetchData();
    } catch { setError('Failed.'); }
  };

  const handleEnable2FA = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/advanced/enable-2fa`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOtpStep('verify');
      setOtpCode('');
      setDisplayedOtp(data.otp);
      showSuccess(`2FA OTP: ${data.otp}`);
    } catch (err) { setError(err.message); }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/advanced/verify-2fa`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOtpStep('');
      setOtpCode('');
      showSuccess('2FA enabled successfully!');
      fetchData();
    } catch (err) { setError(err.message); }
  };

  const handleDisable2FA = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/advanced/disable-2fa`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowDisable2FA(false);
      setDisablePassword('');
      showSuccess('2FA disabled.');
      fetchData();
    } catch (err) { setError(err.message); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/advanced/change-password`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      showSuccess('Password changed successfully!');
    } catch (err) { setError(err.message); }
  };

  const handleUpdateIp = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const ips = ipWhitelist.split(',').map(ip => ip.trim()).filter(ip => ip);
      const res = await fetch(`${API_BASE}/security/ip-whitelist`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ipWhitelist: ips })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIpWhitelist('');
      showSuccess('IP whitelist updated.');
    } catch (err) { setError(err.message); }
  };

  const handleUpdateSettings = async (updates) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/advanced/settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSettings(prev => ({ ...prev, ...updates }));
      if (updates.preferredTheme) {
        localStorage.setItem('theme', updates.preferredTheme);
        document.documentElement.setAttribute('data-theme', updates.preferredTheme);
      }
      showSuccess('Settings updated.');
    } catch (err) { setError(err.message); }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <h1>Security Settings</h1>
      <p className="subtitle">Manage 2FA, passwords, sessions, and preferences.</p>
      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>Security</button>
        <button className={`tab-btn ${activeTab === 'sessions' ? 'active' : ''}`} onClick={() => setActiveTab('sessions')}>Sessions</button>
        <button className={`tab-btn ${activeTab === 'preferences' ? 'active' : ''}`} onClick={() => setActiveTab('preferences')}>Preferences</button>
      </div>

      {activeTab === 'security' && (
        <div>
          <div className="info-cards">
            <div className="info-card">
              <h3>Security Status</h3>
              <div className="info-item"><strong>2FA Status:</strong> {settings?.twoFactorEnabled ? <span style={{ color: '#4caf50' }}> Enabled</span> : <span style={{ color: '#ff9800' }}> Disabled</span>}</div>
              <div className="info-item"><strong>Account:</strong> {settings?.isLocked ? <span style={{ color: '#f44336' }}> LOCKED</span> : <span style={{ color: '#4caf50' }}> Active</span>}</div>
            </div>
          </div>

          <div className="section-divider" />
          <h2>Two-Factor Authentication</h2>
          {settings?.twoFactorEnabled ? (
            <div>
              <p>2FA is <strong style={{ color: '#4caf50' }}>enabled</strong>. You'll receive an OTP on the login page.</p>
              {showDisable2FA ? (
                <form onSubmit={handleDisable2FA} className="store-form" style={{ maxWidth: '400px' }}>
                  <p>Enter your password to disable 2FA:</p>
                  <input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} placeholder="Your password" required style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }} />
                  <button type="submit" className="btn btn-danger">Confirm Disable</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowDisable2FA(false)}>Cancel</button>
                </form>
              ) : (
                <button className="btn btn-warning" onClick={() => setShowDisable2FA(true)}>Disable 2FA</button>
              )}
            </div>
          ) : otpStep === 'verify' ? (
            <form onSubmit={handleVerify2FA} className="store-form" style={{ maxWidth: '400px' }}>
              <p>Your OTP is:</p>
              <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', padding: '1rem', borderRadius: '8px', textAlign: 'center', fontSize: '1.8rem', fontFamily: 'monospace', letterSpacing: '0.5rem', color: 'var(--text)', marginBottom: '1rem', fontWeight: 'bold' }}>{displayedOtp}</div>
              <p>Enter this OTP to verify:</p>
              <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit OTP" maxLength={6} required style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem', width: '100%', padding: '0.5rem', marginBottom: '0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }} />
              <button type="submit" className="btn btn-primary" disabled={otpCode.length !== 6}>Verify & Enable</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setOtpStep(''); setOtpCode(''); setDisplayedOtp(''); }}>Cancel</button>
            </form>
          ) : (
            <div>
              <p>Enable 2FA for extra security. You'll receive an OTP on the login page.</p>
              <button className="btn btn-primary" onClick={handleEnable2FA}>Enable 2FA</button>
            </div>
          )}

          <div className="section-divider" />
          <h2>Change Password</h2>
          <form onSubmit={handleChangePassword} className="store-form" style={{ maxWidth: '400px' }}>
            <div className="form-group">
              <label>Current Password</label>
              <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} required minLength={6} />
            </div>
            <button type="submit" className="btn btn-primary">Change Password</button>
          </form>

          <div className="section-divider" />
          <h2>IP Whitelist</h2>
          <p className="subtitle">Restrict login to specific IPs. Leave empty to allow all.</p>
          <form onSubmit={handleUpdateIp} className="store-form" style={{ maxWidth: '500px' }}>
            <div className="form-group">
              <input type="text" value={ipWhitelist} onChange={(e) => setIpWhitelist(e.target.value)} placeholder="e.g., 192.168.1.1, 10.0.0.0/8" />
            </div>
            <button type="submit" className="btn btn-primary">Update IP Whitelist</button>
          </form>
        </div>
      )}

      {activeTab === 'sessions' && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <button className="btn btn-secondary" onClick={handleRevokeAll}>Revoke All Other Sessions</button>
          </div>
          {sessions.length === 0 ? <p>No active sessions.</p> : (
            <div className="table-container">
              <table className="data-table">
                <thead><tr><th>Device</th><th>IP</th><th>Last Active</th><th>Action</th></tr></thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s._id}>
                      <td><span className="action-badge" style={{ backgroundColor: '#607d8b' }}>{s.deviceType}</span></td>
                      <td>{s.ipAddress}</td>
                      <td>{new Date(s.lastActive).toLocaleString()}</td>
                      <td><button onClick={() => handleRevokeSession(s._id)} className="btn btn-danger btn-sm">Revoke</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'preferences' && (
        <div>
          <div className="info-cards">
            <div className="info-card">
              <h3>Appearance</h3>
              <div className="info-item">
                <strong>Theme:</strong>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button className={`btn ${settings?.preferredTheme === 'dark' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleUpdateSettings({ preferredTheme: 'dark' })}>Dark</button>
                  <button className={`btn ${settings?.preferredTheme === 'light' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleUpdateSettings({ preferredTheme: 'light' })}>Light</button>
                </div>
              </div>
            </div>
            <div className="info-card">
              <h3>Session Timeout</h3>
              <div className="info-item"><strong>Auto-logout after inactivity:</strong></div>
              <select value={settings?.inactivityTimeout} onChange={(e) => handleUpdateSettings({ inactivityTimeout: e.target.value })} style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px' }}>
                {[5, 10, 15, 30, 60, 120].map(m => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
