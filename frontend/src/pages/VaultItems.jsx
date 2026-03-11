import { useState, useEffect } from 'react';
import { getVaultItems, retrieveData, deleteVaultItem } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function VaultItems() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [decryptedData, setDecryptedData] = useState({});
  const [decrypting, setDecrypting] = useState({});
  const [error, setError] = useState('');

  const fetchItems = async () => {
    try {
      const res = await getVaultItems();
      setItems(res.data.items);
    } catch (err) {
      setError('Failed to load vault items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const handleRetrieve = async (id) => {
    setDecrypting((prev) => ({ ...prev, [id]: true }));
    setError('');
    try {
      const res = await retrieveData(id);
      setDecryptedData((prev) => ({ ...prev, [id]: res.data.vaultItem }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to retrieve data');
    } finally {
      setDecrypting((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) return;
    try {
      await deleteVaultItem(id);
      setItems(items.filter((item) => item._id !== id));
      setDecryptedData((prev) => { const copy = { ...prev }; delete copy[id]; return copy; });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete item');
    }
  };

  if (loading) return <div className="loading">Loading vault items...</div>;

  return (
    <div className="page">
      <h1>My Vault</h1>
      <p className="subtitle">
        {items.length} encrypted item{items.length !== 1 ? 's' : ''} stored.
        Click "Decrypt & View" to retrieve data (context will be re-evaluated).
      </p>

      {error && <div className="error-msg">{error}</div>}

      {items.length === 0 ? (
        <div className="empty-state">
          <p>No items in your vault yet. Go to "Store Data" to add encrypted data.</p>
        </div>
      ) : (
        <div className="vault-grid">
          {items.map((item) => (
            <div key={item._id} className="vault-card">
              <div className="vault-card-header">
                <h3>{item.title}</h3>
                <span className={`sensitivity-badge s-${item.sensitivityLevel.toLowerCase()}`}>
                  {item.sensitivityLevel}
                </span>
              </div>

              <div className="vault-card-body">
                <div className="info-item">
                  <strong>Encryption:</strong>{' '}
                  <span className={`strategy-badge strategy-${item.encryptionStrategy.toLowerCase()}`}>
                    {item.encryptionStrategy}
                  </span>
                </div>
                <div className="info-item"><strong>Algorithm:</strong> {item.algorithm}</div>
                <div className="info-item">
                  <strong>Stored:</strong> {new Date(item.createdAt).toLocaleString()}
                </div>
                {item.owner && (
                  <div className="info-item">
                    <strong>Owner:</strong> {item.owner.username} ({item.owner.role})
                  </div>
                )}
              </div>

              {decryptedData[item._id] && (
                <div className="decrypted-section">
                  <h4>Decrypted Data:</h4>
                  <pre className="decrypted-data">{decryptedData[item._id].data}</pre>
                  <div className="info-item" style={{ marginTop: '0.5rem' }}>
                    <strong>Context at Storage:</strong>
                  </div>
                  {item.metadata?.contextSnapshot && (
                    <div className="context-info">
                      <span>Role: {item.metadata.contextSnapshot.role}</span>
                      <span>Location: {item.metadata.contextSnapshot.location}</span>
                      <span>Policy: {item.metadata.contextSnapshot.policyDecision}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="vault-card-actions">
                <button
                  onClick={() => handleRetrieve(item._id)}
                  className="btn btn-primary btn-sm"
                  disabled={decrypting[item._id]}
                >
                  {decrypting[item._id] ? 'Decrypting...' : decryptedData[item._id] ? 'Re-decrypt' : 'Decrypt & View'}
                </button>
                {(user.role === 'admin' || item.owner?._id === user.id) && (
                  <button
                    onClick={() => handleDelete(item._id, item.title)}
                    className="btn btn-danger btn-sm"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
