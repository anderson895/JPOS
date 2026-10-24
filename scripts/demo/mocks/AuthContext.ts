// DEMO ONLY — stand-in for src/contexts/AuthContext used by the demo recorder.
// No Firebase: "signing in" just switches to a fake user. Never used in the real app.
import { createContext, createElement, useContext, useState, type ReactNode } from 'react';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const DEMO_USERS = {
  admin: { id: 'u1', displayName: 'Alex Rivera', email: 'admin@jpos.demo', role: 'admin', isActive: true, photoURL: '', createdAt: '', updatedAt: '' },
  staff: { id: 'u3', displayName: 'Bea Garcia', email: 'bea@jpos.demo', role: 'staff', isActive: true, photoURL: '', createdAt: '', updatedAt: '' },
} as const;

const AuthCtx = createContext<any>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // ?as=admin / ?as=staff starts signed in (handy for screenshots)
  const [currentUser, setCurrentUser] = useState<any>(() => {
    const as = new URLSearchParams(location.search).get('as') as keyof typeof DEMO_USERS | null;
    return as ? DEMO_USERS[as] : null;
  });
  const value = {
    currentUser,
    loading: false,
    login: async (email: string) => { await wait(700); setCurrentUser(email.startsWith('staff') ? DEMO_USERS.staff : DEMO_USERS.admin); },
    loginWithGoogle: async () => { await wait(700); setCurrentUser(DEMO_USERS.admin); },
    logout: async () => setCurrentUser(null),
    refreshUser: async () => {},
  };
  return createElement(AuthCtx.Provider, { value }, children);
}

export function useAuth() {
  return useContext(AuthCtx);
}
