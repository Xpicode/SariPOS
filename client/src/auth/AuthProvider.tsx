import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as client from '@/api/client';
import type { User } from '@/api/types';
import { AuthContext, type AuthValue } from './context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthValue['status']>('loading');
  const [user, setUser] = useState<User | null>(null);

  // Wipes everything the previous person loaded. A counter tablet is shared: the next
  // person must never see the owner's cached data after the owner logs out.
  const signOutLocally = useCallback(() => {
    queryClient.clear();
    setUser(null);
    setStatus('anonymous');
  }, [queryClient]);

  // On app start: if the httpOnly cookie is still valid, restore the session silently.
  useEffect(() => {
    client.setSessionExpiredHandler(signOutLocally);
    client
      .refreshSession()
      .then((session) => {
        setUser(session.user);
        setStatus('authenticated');
      })
      .catch(signOutLocally);
  }, [signOutLocally]);

  const login = useCallback(
    async (username: string, password: string) => {
      const loggedIn = await client.login(username, password);
      queryClient.clear();
      setUser(loggedIn);
      setStatus('authenticated');
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await client.logout();
    } finally {
      signOutLocally();
    }
  }, [signOutLocally]);

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
