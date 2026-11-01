import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@settlecraft/shared';
import { api, refreshSession, setToken } from './api';
type Auth = {
  user: User | null;
  loading: boolean;
  error: string;
  accept: (user: User, token: string) => void;
  logout: () => Promise<void>;
  expire: (reason: string) => void;
  update: (user: User) => void;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const client = useQueryClient();
  useEffect(() => {
    void refreshSession()
      .then((s) => setUser(s?.user ?? null))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);
  function expire(reason: string) {
    sessionStorage.setItem('settlecraft-session-message', reason);
    setToken(null);
    setUser(null);
    client.clear();
    void api('/auth/logout', { method: 'POST', retryAuth: false }).catch(() => {});
  }
  useEffect(() => {
    const expired = () => {
      sessionStorage.setItem(
        'settlecraft-session-message',
        'Your session expired. Please sign in again.',
      );
      setToken(null);
      setUser(null);
      client.clear();
    };
    window.addEventListener('settlecraft-session-expired', expired);
    return () => window.removeEventListener('settlecraft-session-expired', expired);
  }, [client]);
  const value: Auth = {
    user,
    expire,
    loading,
    error,
    accept: (u, t) => {
      sessionStorage.removeItem('settlecraft-session-message');
      setToken(t);
      setUser(u);
      client.clear();
    },
    update: setUser,
    logout: async () => {
      await api('/auth/logout', { method: 'POST' });
      setToken(null);
      setUser(null);
      client.clear();
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() {
  const a = useContext(Context);
  if (!a) throw new Error('Auth provider missing');
  return a;
}
