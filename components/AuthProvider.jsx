'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from '@/lib/api-client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokenStore.get()) {
        setReady(true);
        return;
      }
      try {
        const { user } = await api.me();
        if (!cancelled) setUser(user);
      } catch {
        tokenStore.set(null); // expired, revoked, or the server restarted
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const { token, user } = await api.login(credentials);
    tokenStore.set(token);
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (details) => {
    const { token, user } = await api.register(details);
    tokenStore.set(token);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, register, logout, setUser }),
    [user, ready, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
