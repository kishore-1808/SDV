import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/dashboard">Secure Data Vault</Link>
      </div>
      {user && (
        <div className="navbar-menu">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/store">Store Data</Link>
          <Link to="/vault">My Vault</Link>
          {user.role === 'admin' && <Link to="/audit">Audit Logs</Link>}
          <span className="user-info">
            {user.username} ({user.role}) | {user.location}
          </span>
          <button onClick={handleLogout} className="btn btn-logout">Logout</button>
        </div>
      )}
    </nav>
  );
}
