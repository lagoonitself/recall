import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { GoogleSignIn } from '../components/GoogleSignIn';

export function AuthPage({ mocking }: { mocking: boolean }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return (
    <main className="auth-layout">
      <aside className="auth-aside">
        <Link to="/" className="brand light">
          <span className="brand-mark">r.</span> recall
        </Link>
        <div>
          <p className="eyebrow">A HOME FOR YOUR IDEAS</p>
          <h1>Everything worth remembering, in one place.</h1>
          <p>
            Bring your documents, images and recordings together. Find the connections when you need them.
          </p>
        </div>
        <small>YOUR KNOWLEDGE, WITH CONTEXT.</small>
      </aside>
      <section className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">YOUR LIBRARY AWAITS</p>
          <h2>Sign in to Recall</h2>
          <p className="muted">Use your Google account to continue.</p>
          <GoogleSignIn mocking={mocking} />
        </div>
      </section>
    </main>
  );
}
