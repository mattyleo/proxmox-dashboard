'use client';

import React, { useState } from 'react';

interface UpdateInfo {
  current_commit: string;
  remote_commit: string;
  branch: string;
  updates_available: boolean;
  commits_behind: number;
  changelog: string[];
  fetch_error?: string | null;
  last_check?: string;
}

export default function SystemUpdateCard() {
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [countdown, setCountdown] = useState(25);

  const checkUpdates = async () => {
    setChecking(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/system/update', { method: 'GET' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Errore durante la verifica');
      }
      setInfo(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Errore di connessione');
    } finally {
      setChecking(false);
    }
  };

  const applyUpdate = async () => {
    if (!confirm('Vuoi scaricare gli ultimi aggiornamenti e riavviare la Dashboard ML-ProxVision?')) {
      return;
    }
    setUpdating(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/system/update', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Errore durante l'aggiornamento");
      }
      setSuccessMsg(data.message);
      setRestarting(true);

      // Countdown di riavvio prima di ricaricare la pagina
      let count = 25;
      const interval = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count <= 0) {
          clearInterval(interval);
          window.location.reload();
        }
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || "Errore durante l'aggiornamento");
      setUpdating(false);
    }
  };

  return (
    <section className="glass-panel p-8 rounded-3xl border border-white/10 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Aggiornamenti & Flotta Agenti
          </span>
          <h3 className="text-2xl font-bold mt-1">🔄 Aggiornamento Sistema (1-Click Update)</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Verifica la disponibilità di nuove release del codice da GitHub e mantieni aggiornata sia la Dashboard che gli Agenti sui nodi Proxmox.
          </p>
        </div>

        <button
          onClick={checkUpdates}
          disabled={checking || updating}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs py-3 px-5 rounded-2xl transition-all cursor-pointer disabled:opacity-50 shrink-0"
        >
          {checking ? (
            <>
              <span className="animate-spin text-base">⏳</span>
              Verifica in corso...
            </>
          ) : (
            <>
              <span className="text-base">🔍</span>
              Verifica Aggiornamenti
            </>
          )}
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-destructive/15 border border-destructive/40 text-destructive text-sm flex items-center gap-3">
          <span>⚠️</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm flex items-center gap-3">
          <span>✅</span>
          <span>{successMsg}</span>
        </div>
      )}

      {restarting && (
        <div className="p-5 rounded-2xl bg-primary/20 border border-primary/40 space-y-2 text-center animate-pulse">
          <p className="font-bold text-primary text-base">
            🚀 Compilazione e Riavvio Servizio in corso...
          </p>
          <p className="text-xs text-muted-foreground">
            Ricaricamento automatico della pagina tra <strong>{countdown} secondi</strong>.
          </p>
          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden max-w-xs mx-auto mt-2">
            <div
              className="bg-primary h-full transition-all duration-1000"
              style={{ width: `${((25 - countdown) / 25) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Dettagli Versione e Notifica Aggiornamenti */}
      {info && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-1">
              <span className="text-muted-foreground block">Commit Attuale Locale</span>
              <span className="font-mono font-bold text-white text-sm">#{info.current_commit}</span>
            </div>
            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-1">
              <span className="text-muted-foreground block">Branch Principale</span>
              <span className="font-mono font-bold text-primary text-sm">{info.branch}</span>
            </div>
            <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-1">
              <span className="text-muted-foreground block">Ultimo Controllo</span>
              <span className="font-bold text-white text-sm">{info.last_check || 'Adesso'}</span>
            </div>
          </div>

          {info.updates_available ? (
            <div className="p-6 rounded-2xl bg-gradient-to-r from-primary/20 to-orange-500/20 border border-primary/40 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎉</span>
                    <h4 className="font-black text-lg text-white">
                      Nuova Versione Disponibile ({info.commits_behind} aggiornamenti rilasciati)
                    </h4>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    È disponibile una nuova versione con miglioramenti di stabilità e sicurezza.
                  </p>
                </div>

                <button
                  onClick={applyUpdate}
                  disabled={updating || restarting}
                  className="bg-primary hover:bg-orange-500 text-white font-black text-sm py-3 px-6 rounded-xl transition-all shadow-lg hover:shadow-primary/30 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {updating ? '⚡ Aggiornamento in corso...' : '⚡ Installa e Aggiorna Ora'}
                </button>
              </div>

              {info.changelog && info.changelog.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-white/10">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Novità incluse nel rilascio:
                  </span>
                  <ul className="space-y-1 text-xs font-mono text-white/90">
                    {info.changelog.map((c, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-emerald-300 font-semibold">
                <span className="text-base">🛡️</span>
                <span>Il sistema è aggiornato all&apos;ultima versione disponibile (#{info.current_commit}).</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">Repo Up-to-Date</span>
            </div>
          )}
        </div>
      )}

      {/* Box esplicativo Auto-Update dei 50+ Proxmox */}
      <div className="p-5 rounded-2xl bg-black/30 border border-white/5 space-y-2 text-xs">
        <div className="flex items-center gap-2 text-white font-bold text-sm">
          <span>📡</span>
          <span>Auto-Aggiornamento Automatico dei 50+ Nodi Proxmox</span>
        </div>
        <p className="text-muted-foreground leading-relaxed">
          Grazie al modulo <strong>Auto-Update Agent v6.2</strong> integrato, non hai bisogno di accedere via SSH ai 50 server Proxmox dei clienti. Ogni volta che aggiorni la Dashboard, gli agenti installati sui server Proxmox remoti rilevano in automatico la nuova versione al loro successivo ciclo (cron ogni 2 minuti) e si auto-aggiornano da soli senza interruzioni del servizio.
        </p>
      </div>
    </section>
  );
}
