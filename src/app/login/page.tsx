'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [hardwareHost, setHardwareHost] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/auth')
      .then((res) => res.json())
      .then((data) => {
        setNeedsSetup(Boolean(data.needsSetup));
      })
      .catch(() => {
        setNeedsSetup(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: needsSetup ? 'setup' : 'login',
          name,
          instance_name: instanceName,
          hardware_host: hardwareHost,
          email,
          password,
        }),
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="glass-panel p-8 md:p-10 rounded-3xl w-full max-w-md relative z-10 border border-white/10">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-primary to-warning shadow-lg flex items-center justify-center font-black text-white text-xl tracking-tighter mb-3">
            ML
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            ML-<span className="text-primary font-black">ProxVision</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {needsSetup
              ? '🚀 Prima Configurazione — Crea il tuo Account Amministratore'
              : 'Accesso Multi-Ruolo (Admin / Supervisore / Tecnico)'}
          </p>
        </div>

        {needsSetup && (
          <div className="mb-5 p-3.5 rounded-2xl bg-primary/10 border border-primary/30 text-xs text-muted-foreground leading-relaxed">
            <strong className="text-primary block mb-1">🎉 Benvenuto su ML-ProxVision!</strong>
            Nessun utente è ancora presente. Imposta ora il tuo account{' '}
            <strong className="text-white">Amministratore</strong>. Una volta entrato, potrai creare gli account per i tuoi{' '}
            <strong className="text-emerald-400">Supervisori</strong> e{' '}
            <strong className="text-indigo-400">Tecnici</strong> dal menu <em>Impostazioni</em>.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {needsSetup && (
            <>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Nome e Cognome Amministratore
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="es. Mario Rossi"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    Nome Tua Azienda (Opz.)
                  </label>
                  <input
                    type="text"
                    value={instanceName}
                    onChange={(e) => setInstanceName(e.target.value)}
                    placeholder="Nome azienda..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    Server Ospitante (Opz.)
                  </label>
                  <input
                    type="text"
                    value={hardwareHost}
                    onChange={(e) => setHardwareHost(e.target.value)}
                    placeholder="es. Server / Cloud..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-xs placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              {needsSetup ? 'Email Amministratore' : 'Indirizzo Email'}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Inserisci la tua email aziendale..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              {needsSetup ? 'Scegli una Password Amministratore' : 'Password'}
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
            {loading
              ? 'Attendere...'
              : needsSetup
              ? '🚀 Crea Amministratore e Avvia ML-ProxVision'
              : '🔐 Accedi a ML-ProxVision'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/10 space-y-2 text-[11px] text-muted-foreground">
          <div className="flex justify-between items-center">
            <span>👑 <strong>Admin</strong>: gestione totale e utenti</span>
            <span>🛡️ <strong>Supervisore</strong>: aziende e agent</span>
          </div>
          <div>🛠️ <strong>Tecnico</strong>: visione dashboard e soluzioni problematiche</div>
          <div className="pt-2 border-t border-white/5 text-[10px] text-center opacity-75">
            Programma ideato da <strong>Mattia Leoni</strong> — Reggio Emilia (RE) — info@leonimattia.it
          </div>
        </div>
      </div>
    </div>
  );
}
