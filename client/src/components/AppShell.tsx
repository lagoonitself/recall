import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Outlet } from 'react-router-dom';
import { Library, MessageSquare, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';

export function AppShell() {
  const { user, signOut } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountOpen]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <Link className="topbar-brand" to="/">
            <span className="topbar-brand-mark">r</span>
            <span>Recall</span>
          </Link>
          <nav aria-label="Main navigation" className="topbar-nav">
            <NavLink to="/" end className={({ isActive }) => `topbar-nav-link ${isActive ? 'active' : ''}`}>
              <Library size={16} strokeWidth={1.75} />
              <span>Library</span>
            </NavLink>
            <NavLink to="/chat" className={({ isActive }) => `topbar-nav-link ${isActive ? 'active' : ''}`}>
              <MessageSquare size={16} strokeWidth={1.75} />
              <span>Chat</span>
            </NavLink>
          </nav>
        </div>

        <div className="topbar-account-wrapper" ref={accountRef}>
          <button
            type="button"
            className="topbar-account-trigger"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            aria-label="Account menu"
            onClick={() => setAccountOpen((prev) => !prev)}
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="topbar-avatar" />
            ) : (
              <span className="topbar-avatar">{(user?.name || user?.email || 'R')[0].toUpperCase()}</span>
            )}
            <span className="topbar-account-name">{user?.name || user?.email}</span>
          </button>

          {accountOpen && (
            <div className="account-popover" role="menu" aria-label="Account">
              <div className="account-popover-header">
                <span className="account-popover-name">{user?.name || 'User'}</span>
                <span className="account-popover-email">{user?.email}</span>
              </div>
              <div className="account-popover-divider" />
              <button
                type="button"
                role="menuitem"
                className="account-popover-item"
                onClick={() => {
                  setAccountOpen(false);
                  signOut();
                }}
              >
                <LogOut size={16} strokeWidth={1.75} />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </header>
      <Outlet />
    </>
  );
}
