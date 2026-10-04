'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('info@leonimattia.it');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || 'Credenziali errate');
      }
    } catch {
      setError('Errore di connessione al server');
    } finally {
      setLoading(false);
    }
  };

  const selectPreset = (presetEmail: string, presetPass: string) => {
    setEmail(presetEmail);
    setPassword(presetPass);
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="glass-panel p-8 md:p-10 rounded-3xl w-full max-w-md relative z-10 border border-white/10">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-primary to-warning shadow-lg flex items-center justify-center font-black text-white text-2xl mb-3">
            P
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Proxmox<span className="text-primary font-black">AI</span> Dashboard
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Accesso Multi-Ruolo (Admin / Supervisore / Tecnico)
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Indirizzo Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="es. info@leonimattia.it"
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Inserisci la password..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              required
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-medium text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-orange-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-primary/25 flex justify-center items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Verifica credenziali...' : '🔐 Accedi alla Dashboard'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/10 space-y-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
            Seleziona Livello di Accesso Predefinito:
          </span>

          <div className="grid grid-cols-1 gap-2 text-xs">
            <button
              type="button"
              onClick={() => selectPreset('info@leonimattia.it', 'admin')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex justify-between items-center ${
                email === 'info@leonimattia.it'
                  ? 'border-primary bg-primary/15'
                  : 'border-white/10 bg-black/30 hover:bg-white/5'
              }`}
            >
              <div>
                <span className="font-bold text-white block">👑 Amministratore</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  info@leonimattia.it • pass: admin
                </span>
              </div>
              <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-[10px] font-bold">
                ACCESSO TOTALE
              </span>
            </button>

            <button
              type="button"
              onClick={() => selectPreset('supervisore@proxmox.local', 'supervisore')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex justify-between items-center ${
                email === 'supervisore@proxmox.local'
                  ? 'border-emerald-400 bg-emerald-500/15'
                  : 'border-white/10 bg-black/30 hover:bg-white/5'
              }`}
            >
              <div>
                <span className="font-bold text-white block">🛡️ Supervisore</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  supervisore@proxmox.local • pass: supervisore
                </span>
              </div>
              <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold">
                AZIENDE & AGENT
              </span>
            </button>

            <button
              type="button"
              onClick={() => selectPreset('tecnico@proxmox.local', 'tecnico')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex justify-between items-center ${
                email === 'tecnico@proxmox.local'
                  ? 'border-indigo-400 bg-indigo-500/15'
                  : 'border-white/10 bg-black/30 hover:bg-white/5'
              }`}
            >
              <div>
                <span className="font-bold text-white block">🛠️ Tecnico</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  tecnico@proxmox.local • pass: tecnico
                </span>
              </div>
              <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-[10px] font-bold">
                VISIONE & SOLUZIONI
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
