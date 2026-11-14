import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { Library, MessageSquare, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Logo } from './brand/Logo';

type Box = { x: number; w: number };

/**
 * Vercel-style tabs: an underline that slides to the active tab, and a gray
 * pill that follows the pointer between tabs while hovering.
 */
function useNavIndicators(pathname: string) {
  const navRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<Box | null>(null);
  const [hover, setHover] = useState<Box | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      const el = navRef.current?.querySelector<HTMLElement>('.topbar-nav-link.active');
      setActive(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [pathname]);

  // Only animate after the first placement so nothing flies in from the left edge.
  useEffect(() => {
    if (active && !animate) {
      const raf = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [active, animate]);

  const onPointerOver = (event: ReactPointerEvent) => {
    const link = (event.target as HTMLElement).closest<HTMLElement>('.topbar-nav-link');
    if (link) setHover({ x: link.offsetLeft, w: link.offsetWidth });
  };
  const onPointerLeave = () => setHover(null);

  return { navRef, active, hover, animate, onPointerOver, onPointerLeave };
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const nav = useNavIndicators(location.pathname);
  const section = location.pathname.split('/')[1] || 'library';

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
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-left">
          <Link className="topbar-brand" to="/" aria-label="Recall home">
            <Logo size={20} />
          </Link>
          <span className="topbar-divider" aria-hidden="true">
            /
          </span>
          <nav
            aria-label="Main navigation"
            className={`topbar-nav ${nav.animate ? 'is-animated' : ''}`}
            ref={nav.navRef}
            onPointerOver={nav.onPointerOver}
            onPointerLeave={nav.onPointerLeave}
          >
            <span
              className={`topbar-nav-hover ${nav.hover ? 'is-visible' : ''}`}
              style={
                nav.hover ? { transform: `translateX(${nav.hover.x}px)`, width: nav.hover.w } : undefined
              }
              aria-hidden="true"
            />
            <span
              className="topbar-nav-underline"
              style={
                nav.active
                  ? { transform: `translateX(${nav.active.x}px)`, width: nav.active.w }
                  : { opacity: 0 }
              }
              aria-hidden="true"
            />
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
      <div id="main-content" key={section} className="page-transition">
        <Outlet />
      </div>
    </>
  );
}
