import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <header className="app-header">
      <span className="app-title">Loyalty Program</span>
      {user && (
        <div className="header-right">
          <span>
            {user.name} ({user.role})
          </span>
          <button onClick={handleLogout}>Log out</button>
        </div>
      )}
    </header>
  );
}
