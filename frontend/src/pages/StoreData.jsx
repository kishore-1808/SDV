import { useState } from 'react';
import { storeData } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function StoreData() {
  const { user } = useAuth();
  const [form, setForm] = useState({ title: '', data: '', sensitivityLevel: 'LOW' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const accessLevels = {
    admin: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    employee: ['LOW', 'MEDIUM', 'HIGH'],
    guest: ['LOW']
  };

  const allowedLevels = accessLevels[user.role] || ['LOW'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await storeData(form);
      setResult(res.data);
      setForm({ title: '', data: '', sensitivityLevel: 'LOW' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to store data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h1>Store Data Securely</h1>
      <p className="subtitle">
        The system will automatically determine encryption strength based on your role ({user.role}),
        location ({user.location}), time of access, and data sensitivity.
      </p>

      {error && <div className="error-msg">{error}</div>}

      <form onSubmit={handleSubmit} className="store-form">
        <div className="form-group">
          <label>Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            placeholder="Name for this data entry"
          />
        </div>

        <div className="form-group">
          <label>Sensitivity Level</label>
          <select
            value={form.sensitivityLevel}
            onChange={(e) => setForm({ ...form, sensitivityLevel: e.target.value })}
          >
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((level) => (
              <option key={level} value={level} disabled={!allowedLevels.includes(level)}>
                {level} {!allowedLevels.includes(level) ? '(Not allowed for your role)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Data to Encrypt</label>
          <textarea
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
            required
            placeholder="Enter the sensitive data you want to securely store..."
            rows={6}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Encrypting & Storing...' : 'Encrypt & Store'}
        </button>
      </form>

      {result && (
        <div className="result-card success">
          <h3>Data Stored Successfully</h3>
          <div className="result-details">
            <div className="info-item"><strong>Title:</strong> {result.vaultItem.title}</div>
            <div className="info-item"><strong>Sensitivity:</strong> <span className={`sensitivity-badge s-${result.vaultItem.sensitivityLevel.toLowerCase()}`}>{result.vaultItem.sensitivityLevel}</span></div>
            <div className="info-item"><strong>Encryption Strategy:</strong> <span className={`strategy-badge strategy-${result.vaultItem.encryptionStrategy.toLowerCase()}`}>{result.vaultItem.encryptionStrategy}</span></div>
            <div className="info-item"><strong>Algorithm:</strong> {result.vaultItem.algorithm}</div>
            <div className="info-item"><strong>Policy Score:</strong> {result.vaultItem.policyEvaluation.score}</div>
            <div className="policy-reasons">
              <strong>Policy Evaluation:</strong>
              <ul>
                {result.vaultItem.policyEvaluation.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
