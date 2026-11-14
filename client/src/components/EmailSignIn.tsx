import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginRequestSchema, RegisterRequestSchema } from '@app/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export function EmailSignIn({ register }: { register: boolean }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const values = {
      email: String(data.get('email') ?? '').trim(),
      password: String(data.get('password') ?? ''),
      name: String(data.get('name') ?? '').trim() || undefined,
    };
    const parsed = (register ? RegisterRequestSchema : LoginRequestSchema).safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your details and try again.');
      return;
    }
    setBusy(true);
    try {
      signIn(register ? await api.register(values) : await api.login(values));
      navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="email-sign-in" onSubmit={(event) => void submit(event)} noValidate>
      {register && (
        <label className="field">
          <span className="field-label">
            Name <span className="field-optional">(optional)</span>
          </span>
          <input className="input" name="name" autoComplete="name" />
        </label>
      )}
      <label className="field">
        <span className="field-label">Email</span>
        <input className="input" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="field">
        <span className="field-label">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete={register ? 'new-password' : 'current-password'}
          minLength={register ? 8 : undefined}
          required
        />
        {register && <span className="field-hint">At least 8 characters.</span>}
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
      </button>
    </form>
  );
}
