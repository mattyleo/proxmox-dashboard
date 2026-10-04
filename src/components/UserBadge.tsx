'use client';

import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/auth';

export default function UserBadge({ user }: { user: SessionUser | null }) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  };

  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const isSupervisor = user.role === 'supervisore';

  return (
    <div className="glass-panel p-3 rounded-xl border border-white/10 space-y-2 text-xs">
      <div className="flex justify-between items-start gap-2">
        <div className="truncate">
          <span className="font-bold text-white block truncate">{user.name}</span>
          <span className="text-[11px] font-mono text-muted-foreground block truncate">
            {user.email}
          </span>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase flex-shrink-0 ${
            isAdmin
              ? 'bg-primary/20 text-primary border border-primary/30'
              : isSupervisor
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
          }`}
        >
          {isAdmin ? '👑 ADMIN' : isSupervisor ? '🛡️ SUPERVISORE' : '🛠️ TECNICO'}
        </span>
      </div>

      <div className="flex justify-between items-center pt-1.5 border-t border-white/10">
        <span className="text-[10px] text-muted-foreground">
          {isAdmin
            ? 'Accesso Totale'
            : isSupervisor
            ? 'Aziende & Installazione Agent'
            : 'Visione & Soluzioni Problemi'}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          className="text-[11px] font-bold text-destructive hover:underline cursor-pointer"
        >
          Esci ↪
        </button>
      </div>
    </div>
  );
}
