import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    const wasAdmin = user?.role === 'ADMIN';
    await logout();
    navigate(wasAdmin ? '/admin' : '/login');
  }

  return (
    <header className="app-header">
      <span className="app-title">Loyalty Program</span>
      {user && (
        <nav className="header-nav">
          <NavLink
            to={user.role === 'ADMIN' ? '/admin' : '/'}
            end
            className={({ isActive }) => (isActive ? 'nav-active' : undefined)}
          >
            Dashboard
          </NavLink>
          {user.role === 'USER' && (
            <NavLink to="/upload" end className={({ isActive }) => (isActive ? 'nav-active' : undefined)}>
              Upload
            </NavLink>
          )}
          {user.role === 'USER' && (
            <NavLink to="/vouchers" end className={({ isActive }) => (isActive ? 'nav-active' : undefined)}>
              My Vouchers
            </NavLink>
          )}
          <NavLink to="/settings" end className={({ isActive }) => (isActive ? 'nav-active' : undefined)}>
            Settings
          </NavLink>
        </nav>
      )}
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
