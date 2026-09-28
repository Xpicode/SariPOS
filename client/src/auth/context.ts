import { createContext, useContext } from 'react';
import type { User } from '@/api/types';

export type AuthValue = {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
