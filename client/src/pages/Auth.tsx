import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { EmailSignIn } from '../components/EmailSignIn';
import { Logo, LogoMark } from '../components/brand/Logo';
import { AuthDemo } from '../components/brand/AuthDemo';

export function AuthPage({ mocking }: { mocking: boolean }) {
  const { user } = useAuth();
  const [register, setRegister] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <div className="auth-grid" aria-hidden="true" />

        <div className="auth-aside-top">
          <Link to="/" className="topbar-brand" aria-label="Recall home">
            <Logo size={22} />
          </Link>
        </div>

        <div className="auth-aside-content">
          <h1 className="auth-aside-headline">
            <span className="reveal-line" style={{ animationDelay: '40ms' }}>
              Ask your documents
            </span>
            <span className="reveal-line" style={{ animationDelay: '140ms' }}>
              anything.
            </span>
          </h1>
          <p className="auth-aside-lede">
            Upload PDFs, photos, recordings and videos. Get answers that point to the exact page or moment.
          </p>

          <AuthDemo />
        </div>

        <div className="auth-aside-footer">
          <span>Built for deep reading, research and recall</span>
        </div>
      </aside>

      <section className="auth-main">
        <div className="auth-card">
          <span className="corner corner-tl" aria-hidden="true" />
          <span className="corner corner-tr" aria-hidden="true" />
          <span className="corner corner-bl" aria-hidden="true" />
          <span className="corner corner-br" aria-hidden="true" />
          <div className="auth-card-header">
            <div className="auth-card-brand">
              <LogoMark size={36} />
            </div>
            <h2 className="auth-card-title">
              {register ? 'Create your Recall account' : 'Sign in to Recall'}
            </h2>
            <p className="auth-card-subtitle">
              {register
                ? 'Use your email or Google account to get started.'
                : 'Sign in with your email or Google account to access your library and chats.'}
            </p>
          </div>

          <EmailSignIn key={register ? 'register' : 'login'} register={register} />

          <div className="auth-divider" role="separator">
            <span>or</span>
          </div>

          <GoogleSignIn mocking={mocking} />

          <p className="auth-switch">
            {register ? 'Already have an account?' : 'New to Recall?'}{' '}
            <button type="button" className="auth-switch-link" onClick={() => setRegister(!register)}>
              {register ? 'Sign in' : 'Create an account'}
            </button>
          </p>

          <p className="auth-legal">
            By continuing, you agree to Recall's terms of service and privacy policy.
          </p>
        </div>
      </section>
    </main>
  );
}
