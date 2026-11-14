import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Quote, Layers, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { EmailSignIn } from '../components/EmailSignIn';

export function AuthPage({ mocking }: { mocking: boolean }) {
  const { user } = useAuth();
  const [register, setRegister] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <div className="auth-aside-top">
          <Link to="/" className="topbar-brand">
            <span className="topbar-brand-mark">r</span>
            <span>Recall</span>
          </Link>
        </div>

        <div className="auth-aside-content">
          <h1 className="auth-aside-headline">Ask your documents anything.</h1>
          <ul className="auth-features-list">
            <li className="auth-feature-item">
              <Quote className="auth-feature-icon" size={18} strokeWidth={1.75} />
              <span>Cited answers with exact page numbers and timestamps</span>
            </li>
            <li className="auth-feature-item">
              <Layers className="auth-feature-icon" size={18} strokeWidth={1.75} />
              <span>Search across PDFs, images, audio, and video</span>
            </li>
            <li className="auth-feature-item">
              <Sparkles className="auth-feature-icon" size={18} strokeWidth={1.75} />
              <span>Visible reasoning steps you can inspect and verify</span>
            </li>
          </ul>
        </div>

        <div className="auth-aside-footer">
          <span>Research tool for deep reading and synthesis</span>
        </div>
      </aside>

      <section className="auth-main">
        <div className="auth-card">
          <div className="auth-card-header">
            <div className="auth-card-brand">
              <span className="topbar-brand-mark">r</span>
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
