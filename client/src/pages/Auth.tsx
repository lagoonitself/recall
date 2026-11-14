import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { LoginRequestSchema, RegisterRequestSchema } from '@app/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { GoogleSignIn } from '../components/GoogleSignIn';
export function AuthPage({ register = false }: { register?: boolean }) {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const values = {
      email: String(data.get('email')).trim(),
      password: String(data.get('password')),
      name: String(data.get('name') || '').trim(),
    };
    const parsed = (register ? RegisterRequestSchema : LoginRequestSchema).safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const result = register ? await api.register(values) : await api.login(values);
      signIn(result);
      navigate('/');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }
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
          <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
          <p className="muted">
            {register ? 'Start building a more useful library.' : 'Sign in to pick up where you left off.'}
          </p>
          <form onSubmit={submit} noValidate>
            {register && (
              <label>
                Name <span className="optional">(optional)</span>
                <input name="name" autoComplete="name" />
              </label>
            )}
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                required
              />
            </label>
            {register && <small>At least 8 characters.</small>}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <GoogleSignIn />
          <p className="auth-switch">
            {register ? 'Already have an account?' : 'New to Recall?'}{' '}
            <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
