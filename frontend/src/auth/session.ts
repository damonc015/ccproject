import type { User } from '../api/types';

const SESSION_KEY = 'ccdemo.session';

export const userIdFor = (email: string) => 'u_' + email.trim().toLowerCase();

export function getSessionUser(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function setSessionUser(user: User | null) {
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else localStorage.removeItem(SESSION_KEY);
}
