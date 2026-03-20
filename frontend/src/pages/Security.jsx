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
      <p className="subtitle">Manage sessions, IP restrictions, and preferences.</p>
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
              <div className="info-item"><strong>Account:</strong> {settings?.isLocked ? <span style={{ color: '#f44336' }}> LOCKED</span> : <span style={{ color: '#4caf50' }}> Active</span>}</div>
            </div>
          </div>

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
