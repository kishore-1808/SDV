import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getVaultItems, getAuditStats } from '../services/api';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ itemCount: 0, auditStats: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const itemsRes = await getVaultItems();
        let auditStats = null;
        if (user.role === 'admin') {
          try {
            const auditRes = await getAuditStats();
            auditStats = auditRes.data;
          } catch (e) { /* ignore */ }
        }
        setStats({ itemCount: itemsRes.data.count, auditStats });
      } catch (err) {
        console.error('Failed to fetch dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const accessLevels = {
    admin: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    employee: ['LOW', 'MEDIUM', 'HIGH'],
    guest: ['LOW']
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;

  return (
    <div className="dashboard">
      <h1>Welcome, {user.username}</h1>
      <p className="subtitle">Secure Data Vault - Context-Aware Encryption System</p>

      <div className="info-cards">
        <div className="info-card">
          <h3>Your Profile</h3>
          <div className="info-item"><strong>Role:</strong> <span className={`role-badge role-${user.role}`}>{user.role.toUpperCase()}</span></div>
          <div className="info-item"><strong>Location:</strong> {user.location}</div>
          <div className="info-item"><strong>Email:</strong> {user.email}</div>
        </div>

        <div className="info-card">
          <h3>Access Permissions</h3>
          <div className="info-item"><strong>Allowed Sensitivity Levels:</strong></div>
          <div className="sensitivity-badges">
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((level) => (
              <span
                key={level}
                className={`sensitivity-badge ${accessLevels[user.role]?.includes(level) ? `s-${level.toLowerCase()}` : 's-denied'}`}
              >
                {level} {accessLevels[user.role]?.includes(level) ? '' : '(Denied)'}
              </span>
            ))}
          </div>
        </div>

        <div className="info-card">
          <h3>Vault Summary</h3>
          <div className="stat-number">{stats.itemCount}</div>
          <div className="stat-label">Items in Vault</div>
        </div>
      </div>

      {stats.auditStats && (
        <div className="info-cards" style={{ marginTop: '1rem' }}>
          <div className="info-card">
            <h3>Audit Statistics</h3>
            <div className="info-item"><strong>Total Logs:</strong> {stats.auditStats.totalLogs}</div>
            <div className="info-item"><strong>Failed Actions:</strong> {stats.auditStats.failedActions}</div>
            <div className="info-item"><strong>Success Rate:</strong> {stats.auditStats.successRate}</div>
          </div>
          <div className="info-card">
            <h3>Action Breakdown</h3>
            {stats.auditStats.actionBreakdown?.slice(0, 6).map((item) => (
              <div className="info-item" key={item._id}>
                <strong>{item._id}:</strong> {item.count}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <Link to="/store" className="btn btn-primary">Store New Data</Link>
          <Link to="/vault" className="btn btn-secondary">View Vault</Link>
          {user.role === 'admin' && <Link to="/audit" className="btn btn-warning">View Audit Logs</Link>}
        </div>
      </div>

      <div className="encryption-info">
        <h3>Encryption Strategy Guide</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Algorithm</th>
              <th>Key Size</th>
              <th>When Applied</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span className="strategy-badge strategy-basic">BASIC</span></td>
              <td>AES-128-CBC</td>
              <td>128-bit</td>
              <td>Low-risk contexts (internal admin + low sensitivity)</td>
            </tr>
            <tr>
              <td><span className="strategy-badge strategy-standard">STANDARD</span></td>
              <td>AES-192-CBC</td>
              <td>192-bit</td>
              <td>Medium-risk contexts (typical employee access)</td>
            </tr>
            <tr>
              <td><span className="strategy-badge strategy-strong">STRONG</span></td>
              <td>AES-256-GCM</td>
              <td>256-bit</td>
              <td>High-risk contexts (critical data, remote access, off-hours)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
