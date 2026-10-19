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

/** Hashing crittografico memory-hard scrypt con salt casuale a 16 byte (standard NIST) */
export function hashPassword(password: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/** Verifica sicura con timingSafeEqual contro attacchi di timing, con fallback su legacy plaintext */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  // Se la password è un vecchio hash plaintext (non ancora migrato)
  if (!storedHash.startsWith('scrypt$')) {
    return password === storedHash;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, salt, originalHash] = parts;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(originalHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Verifica se la password nel database è ancora in chiaro e richiede migrazione */
export function needsPasswordMigration(storedHash: string): boolean {
  return !storedHash || !storedHash.startsWith('scrypt$');
}
