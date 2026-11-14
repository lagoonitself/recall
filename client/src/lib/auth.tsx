import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthResponse, User } from '@app/shared';
import { api, getToken, setToken, ApiError } from './api';
type Auth = {
  user: User | null;
  loading: boolean;
  signIn: (response: AuthResponse) => void;
  signOut: () => void;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  useEffect(() => {
    const expired = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener('recall:unauthorized', expired);
    if (getToken())
      api
        .me()
        .then(({ user }) => setUser(user))
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401) expired();
        })
        .finally(() => setLoading(false));
    return () => window.removeEventListener('recall:unauthorized', expired);
  }, []);
  return (
    <Context.Provider
      value={{
        user,
        loading,
        signIn: ({ token, user }) => {
          setToken(token);
          setUser(user);
        },
        signOut: () => {
          setToken(null);
          setUser(null);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing AuthProvider');
  return value;
}
