import { cookies } from 'next/headers';

export type UserRole = 'admin' | 'supervisore' | 'tecnico';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const DEFAULT_USERS: Array<SessionUser & { password: string }> = [
  {
    id: 'usr-admin-1',
    name: 'Mattia Leoni (Admin)',
    email: 'info@leonimattia.it',
    password: 'admin',
    role: 'admin',
  },
  {
    id: 'usr-admin-2',
    name: 'Admin GM-SYSTEM',
    email: 'admin@gm-system.it',
    password: 'admin',
    role: 'admin',
  },
  {
    id: 'usr-sup-1',
    name: 'Supervisore Installazione Agent',
    email: 'supervisore@gm-system.it',
    password: 'supervisore',
    role: 'supervisore',
  },
  {
    id: 'usr-tech-1',
    name: 'Tecnico Consultazione',
    email: 'tecnico@gm-system.it',
    password: 'tecnico',
    role: 'tecnico',
  },
];

export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('auth_user')?.value;
    if (!raw) return null;
    const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
    if (parsed && parsed.email && parsed.role) {
      return parsed as SessionUser;
    }
    return null;
  } catch {
    return null;
  }
}

/** Admin: accesso completo a tutto (utenti, impostazioni istanza, eliminazione aziende, ecc.) */
export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === 'admin';
}

/** Admin + Supervisore: possono registrare aziende e scaricare/installare gli agent preconfigurati */
export function canDeployAgents(user: SessionUser | null): boolean {
  return user?.role === 'admin' || user?.role === 'supervisore';
}
