import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
export function AppShell() {
  const { user, signOut } = useAuth();
  return (
    <>
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark">r.</span> recall
        </Link>
        <nav aria-label="Main navigation">
          <Link className="nav-current" to="/">
            Library
          </Link>
        </nav>
        <details className="account">
          <summary aria-label="Account menu">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" />
            ) : (
              <span className="avatar">{(user?.name || user?.email || 'R')[0].toUpperCase()}</span>
            )}
            <span className="account-name">{user?.name || user?.email}</span>
            <span aria-hidden="true">⌄</span>
          </summary>
          <div className="account-menu">
            <span>{user?.email}</span>
            <button onClick={signOut}>Sign out</button>
          </div>
        </details>
      </header>
      <Outlet />
    </>
  );
}
