import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, onUnauthorized, setToken } from '../api/client';
import { keys } from '../api/hooks';
import type { Me, Org, User } from '../api/types';

interface AuthState {
  me: Me | undefined;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  // Kept in React state (as well as storage) so logging in/out re-renders the app.
  const [token, setTokenState] = useState<string | null>(getToken);
  const meQuery = useQuery({
    queryKey: keys.me,
    queryFn: () => api<Me>('GET', '/me'),
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const clear = useCallback(() => {
    setToken(null);
    setTokenState(null);
    qc.removeQueries();
  }, [qc]);

  useEffect(() => onUnauthorized(clear), [clear]);

  const login = useCallback(
    async (loginId: string, password: string) => {
      const res = await api<{ token: string; user: User; org: Org }>('POST', '/auth/login', { body: { login: loginId, password } });
      setToken(res.token);
      // Drop anything cached for a previous user, then load the new one.
      qc.removeQueries();
      await qc.fetchQuery({ queryKey: keys.me, queryFn: () => api<Me>('GET', '/me') });
      setTokenState(res.token);
    },
    [qc],
  );

  const logout = useCallback(async () => {
    try {
      await api('POST', '/auth/logout');
    } catch {
      // Session may already be gone; log out locally anyway.
    }
    clear();
  }, [clear]);

  const value = useMemo<AuthState>(
    () => ({
      me: token ? meQuery.data : undefined,
      loading: !!token && meQuery.isPending,
      login,
      logout,
    }),
    [token, meQuery.data, meQuery.isPending, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** The logged-in user (only call inside pages that require login). */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('Not logged in');
  return me;
}
