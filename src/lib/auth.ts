import { cookies } from 'next/headers';

export type UserRole = 'admin' | 'supervisore' | 'tecnico';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

// Nessun utente preimpostato: al primo avvio l'azienda che installa ML-ProxVision
// crea il proprio account Amministratore e poi genera i propri Supervisori e Tecnici.
export const DEFAULT_USERS: Array<SessionUser & { password: string }> = [];

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
