import { useState, useEffect } from 'react';
import { getAuditLogs } from '../services/api';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const fetchLogs = async (action = '') => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (action) params.action = action;
      const res = await getAuditLogs(params);
      setLogs(res.data.logs);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleFilter = (action) => {
    setFilter(action);
    fetchLogs(action);
  };

  const actionColors = {
    LOGIN: '#4caf50',
    LOGIN_FAILED: '#f44336',
    REGISTER: '#2196f3',
    STORE_DATA: '#9c27b0',
    RETRIEVE_DATA: '#ff9800',
    RETRIEVE_ALL: '#607d8b',
    DELETE_DATA: '#f44336',
    ACCESS_DENIED: '#e91e63',
    ENCRYPTION_APPLIED: '#00bcd4',
    DECRYPTION_APPLIED: '#ff5722',
    POLICY_EVALUATED: '#795548',
    VIEW_AUDIT_LOGS: '#9e9e9e'
  };

  const actions = [
    '', 'LOGIN', 'LOGIN_FAILED', 'REGISTER', 'STORE_DATA',
    'RETRIEVE_DATA', 'ACCESS_DENIED', 'ENCRYPTION_APPLIED',
    'DECRYPTION_APPLIED', 'POLICY_EVALUATED', 'DELETE_DATA'
  ];

  if (loading) return <div className="loading">Loading audit logs...</div>;

  return (
    <div className="page">
      <h1>Audit Logs</h1>
      <p className="subtitle">
        Complete audit trail of all system activities. {logs.length} entries shown.
      </p>

      {error && <div className="error-msg">{error}</div>}

      <div className="filter-bar">
        <label>Filter by Action: </label>
        <select value={filter} onChange={(e) => handleFilter(e.target.value)}>
          <option value="">All Actions</option>
          {actions.filter(a => a).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Role</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Details</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log._id} className={!log.success ? 'row-failed' : ''}>
                <td>{new Date(log.timestamp).toLocaleString()}</td>
                <td>{log.username}</td>
                <td><span className={`role-badge role-${log.role}`}>{log.role}</span></td>
                <td>
                  <span
                    className="action-badge"
                    style={{ backgroundColor: actionColors[log.action] || '#666', color: '#fff' }}
                  >
                    {log.action}
                  </span>
                </td>
                <td>{log.resource || '-'}</td>
                <td className="details-cell">{log.details || '-'}</td>
                <td>
                  <span className={`status-badge ${log.success ? 'status-success' : 'status-failed'}`}>
                    {log.success ? 'Success' : 'Failed'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logs.length === 0 && (
        <div className="empty-state">
          <p>No audit logs found for the selected filter.</p>
        </div>
      )}
    </div>
  );
}
