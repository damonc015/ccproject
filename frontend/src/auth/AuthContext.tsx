import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { User } from '../api/types';
import { getSessionUser, setSessionUser, userIdFor } from './session';
import { USE_LOCAL_API } from '../config';

// Mock of the Cognito flow: signUp -> confirmSignUp(code) -> signIn -> signOut.
// The method names match what the real Cognito client will expose, so pages
// do not change when this file is swapped out.

const USERS_KEY = 'ccdemo.users';
export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_CONFIRM_CODE = '123456';

interface StoredUser {
  email: string;
  name: string;
  confirmed: boolean;
}

function loadUsers(): Record<string, StoredUser> {
  let users: Record<string, StoredUser> = {};
  try {
    if (!USE_LOCAL_API) users = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
  } catch {
    /* start fresh */
  }
  // Matches backend/src/storage/seed.ts. Local API mode has no registration endpoint.
  for (const [email, name] of [[DEMO_EMAIL, 'Demo User'], ['grace@example.com', 'Grace'], ['linus@example.com', 'Linus'], ['outsider@example.com', 'Outsider']]) {
    if (!users[email]) users[email] = { email, name, confirmed: true };
  }
  return users;
}

export function findRegisteredDemoUser(email: string) {
  const user = loadUsers()[email.trim().toLowerCase()];
  return user?.confirmed ? user : undefined;
}

const saveUsers = (u: Record<string, StoredUser>) => localStorage.setItem(USERS_KEY, JSON.stringify(u));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface AuthValue {
  user: User | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string): Promise<void>;
  confirmSignUp(email: string, code: string): Promise<void>;
  signOut(): void;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getSessionUser());

  const startSession = useCallback((u: StoredUser) => {
    const next: User = { userId: userIdFor(u.email), email: u.email, name: u.name };
    setSessionUser(next);
    setUser(next);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      async signIn(email, password) {
        await wait(500);
        const found = loadUsers()[email.trim().toLowerCase()];
        if (!found) throw new Error('No account found for this email.');
        if (!found.confirmed) throw new Error('This account has not been confirmed yet.');
        if (password.length < 8) throw new Error('Incorrect email or password.');
        startSession(found);
      },
      async signUp(email, password, name) {
        if (USE_LOCAL_API) throw new Error('Use a seeded test account in local API mode.');
        await wait(500);
        const key = email.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(key)) throw new Error('Enter a valid email address.');
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        const users = loadUsers();
        if (users[key]?.confirmed) throw new Error('An account with this email already exists.');
        users[key] = { email: key, name: name.trim() || key.split('@')[0], confirmed: false };
        saveUsers(users);
      },
      async confirmSignUp(email, code) {
        await wait(400);
        const key = email.trim().toLowerCase();
        const users = loadUsers();
        if (!users[key]) throw new Error('No pending sign-up for this email.');
        if (code.trim() !== DEMO_CONFIRM_CODE) throw new Error('That code is not correct.');
        users[key].confirmed = true;
        saveUsers(users);
        startSession(users[key]);
      },
      signOut() {
        setSessionUser(null);
        setUser(null);
      },
    }),
    [user, startSession],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
