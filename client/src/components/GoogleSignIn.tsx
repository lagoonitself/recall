import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useNavigate } from 'react-router-dom';
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
export function GoogleSignIn() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const target = useRef<HTMLDivElement>(null);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    api
      .config()
      .then((config) => {
        if (active) setClientId(config.googleClientId);
      })
      .catch(() => {
        if (active) setError('Google sign-in is unavailable right now.');
      });
    return () => {
      active = false;
    };
  }, []);
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
        width: 320,
      });
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
    if (window.google) render();
    return () => {
      active = false;
      script?.removeEventListener('load', render);
    };
  }, [clientId, navigate, signIn]);
  return (
    <>
      {clientId && (
        <>
          <div className="divider">or continue with</div>
          <div ref={target} className="google-button" />
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
