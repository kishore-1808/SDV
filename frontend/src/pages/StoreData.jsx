import { useState, useRef } from 'react';
import API from '../services/api';
import { useAuth } from '../context/AuthContext';

const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const API_BASE = isLocalhost ? 'http://localhost:5000/api' : 'https://backend-one-blush-33.vercel.app/api';

export default function StoreData() {
  const { user } = useAuth();
  const [form, setForm] = useState({ title: '', data: '', sensitivityLevel: 'LOW' });
  const [selectedFile, setSelectedFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadMode, setUploadMode] = useState('text');
  const fileInputRef = useRef(null);

  if (!user) return <div className="loading">Loading...</div>;

  const accessLevels = {
    admin: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    student: ['LOW', 'MEDIUM', 'HIGH'],
    professor: ['LOW']
  };

  const allowedLevels = accessLevels[user?.role] || ['LOW'];

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        setError('Only PDF files are allowed.');
        setSelectedFile(null);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB.');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    try {
      if (uploadMode === 'pdf' && selectedFile) {
        const formData = new FormData();
        formData.append('title', form.title);
        formData.append('sensitivityLevel', form.sensitivityLevel);
        formData.append('file', selectedFile);

        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/vault/store/pdf`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to upload PDF');
        setResult(data);
        setForm({ title: '', data: '', sensitivityLevel: 'LOW' });
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        const res = await API.post('/vault/store', form);
        setResult(res.data);
        setForm({ title: '', data: '', sensitivityLevel: 'LOW' });
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to store data');
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

      <div className="upload-mode-toggle">
        <button 
          className={`btn ${uploadMode === 'text' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setUploadMode('text')}
        >
          Text Data
        </button>
        <button 
          className={`btn ${uploadMode === 'pdf' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setUploadMode('pdf')}
        >
          PDF File
        </button>
      </div>

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

        {uploadMode === 'text' ? (
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
        ) : (
          <div className="form-group">
            <label>Upload PDF File</label>
            <input
              type="file"
              ref={fileInputRef}
              accept="application/pdf"
              onChange={handleFileChange}
              required
              className="file-input"
            />
            {selectedFile && (
              <div className="selected-file">
                <strong>Selected:</strong> {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
              </div>
            )}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Encrypting & Storing...' : uploadMode === 'pdf' ? 'Encrypt PDF & Store' : 'Encrypt & Store'}
        </button>
      </form>

      {result && (
        <div className="result-card success">
          <h3>Data Stored Successfully</h3>
          <div className="result-details">
            <div className="info-item"><strong>Title:</strong> {result.vaultItem.title}</div>
            {result.vaultItem.originalFileName && (
              <div className="info-item"><strong>File:</strong> {result.vaultItem.originalFileName}</div>
            )}
            <div className="info-item"><strong>Type:</strong> {result.vaultItem.fileType === 'pdf' ? 'PDF Document' : 'Text'}</div>
            <div className="info-item"><strong>Sensitivity:</strong> <span className={`sensitivity-badge s-${result.vaultItem.sensitivityLevel.toLowerCase()}`}>{result.vaultItem.sensitivityLevel}</span></div>
            <div className="info-item"><strong>Encryption Strategy:</strong> <span className={`strategy-badge strategy-${result.vaultItem.encryptionStrategy.toLowerCase()}`}>{result.vaultItem.encryptionStrategy}</span></div>
            <div className="info-item"><strong>Algorithm:</strong> {result.vaultItem.algorithm}</div>
            {result.vaultItem.policyEvaluation && (
              <div className="info-item"><strong>Policy Score:</strong> {result.vaultItem.policyEvaluation.score}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
