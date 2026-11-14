import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (element: HTMLElement, options: object) => void;
        };
      };
    };
  }
}

export function GoogleSignIn({ mocking }: { mocking: boolean }) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [configState, setConfigState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const target = useRef<HTMLDivElement>(null);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    api
      .config()
      .then((config) => {
        if (active) {
          setClientId(config.googleClientId);
          setConfigState('ready');
        }
      })
      .catch(() => {
        if (active) setConfigState('error');
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    const render = () => {
      if (!active || !target.current || !window.google) return;
      target.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => {
          api
            .google(credential)
            .then((response) => {
              signIn(response);
              navigate('/');
            })
            .catch(() => setError('Google sign-in failed. Please try again.'));
        },
      });
      window.google.accounts.id.renderButton(target.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        width: Math.min(320, target.current.clientWidth || 320),
      });
    };
    const failed = () => {
      if (active) setError('Could not load Google sign-in. Please refresh and try again.');
    };
    let script = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', render);
    script.addEventListener('error', failed);
    if (window.google) render();
    return () => {
      active = false;
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', failed);
    };
  }, [clientId, navigate, signIn]);

  async function mockSignIn() {
    setError('');
    setBusy(true);
    try {
      const response = await api.google('mock-google-credential');
      signIn(response);
      navigate('/');
    } catch {
      setError('Mock sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sign-in-options">
      {configState === 'loading' && (
        <p className="auth-card-subtitle" role="status">
          Loading sign-in…
        </p>
      )}
      {configState === 'error' && (
        <div role="alert" className="sign-in-options">
          <p className="badge badge-danger">Could not load sign-in settings.</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setConfigState('loading');
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {configState === 'ready' && !clientId && (
        <p className="auth-card-subtitle" role="status">
          Google sign-in is not configured.
        </p>
      )}
      {configState === 'ready' && clientId && (
        <>
          <div ref={target} className="google-button" />
          {import.meta.env.DEV && mocking && (
            <button
              type="button"
              className="btn btn-secondary mock-sign-in"
              disabled={busy}
              onClick={() => void mockSignIn()}
            >
              Continue (mock)
            </button>
          )}
        </>
      )}
      {error && (
        <p className="badge badge-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
