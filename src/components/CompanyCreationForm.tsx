'use client';

import { useState, useEffect } from 'react';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function CompanyCreationForm({
  addCompanyAction,
}: {
  addCompanyAction: (formData: FormData) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [apiKey, setApiKey] = useState('');

  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setApiKey(generateUUID());
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const handleSubmit = async (formData: FormData) => {
    await addCompanyAction(formData);
    setName('');
    setEmail('');
    setApiKey(generateUUID());
  };

  const downloadUrl = `/api/agent-download?api_key=${encodeURIComponent(
    apiKey
  )}&name=${encodeURIComponent(name || 'azienda')}&email=${encodeURIComponent(
    email
  )}&origin=${encodeURIComponent(origin)}`;

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="api_key" value={apiKey} />

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Nome Azienda
        </label>
        <input
          type="text"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="es. Acme Corp s.r.l."
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Email di Contatto
        </label>
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="es. admin@acme.com"
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
        />
      </div>

      {/* Box API Key generata in tempo reale + Link Download Agent sottostante */}
      <div className="p-4 rounded-2xl bg-black/50 border border-primary/30 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            🔑 Codice API Generato per l&apos;Azienda
          </span>
          <button
            type="button"
            onClick={() => setApiKey(generateUUID())}
            className="text-[11px] text-muted-foreground hover:text-white underline cursor-pointer"
          >
            Rigenera chiave
          </button>
        </div>

        <div className="font-mono text-xs text-white bg-black/60 px-3 py-2.5 rounded-lg border border-white/10 select-all break-all">
          {apiKey || 'Generazione in corso...'}
        </div>

        {/* Link di download del file agent generato in tempo reale sotto al codice API */}
        {apiKey && (
          <div className="pt-2 border-t border-white/10 space-y-2">
            <a
              href={downloadUrl}
              download
              className="w-full flex items-center justify-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs py-2.5 px-3 rounded-xl transition-all"
            >
              ⬇️ Scarica File Agent Già Configurato ({name ? `proxmox-agent-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.sh` : 'proxmox-agent.sh'})
            </a>
            <p className="text-[11px] text-muted-foreground text-center">
              Il file contiene già la chiave API qui sopra. Ricordati di cliccare anche su{' '}
              <strong>&quot;Registra Azienda&quot;</strong> per salvarla nel DB.
            </p>
          </div>
        )}
      </div>

      <button
        type="submit"
        className="w-full bg-primary hover:bg-orange-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg shadow-primary/25 cursor-pointer"
      >
        💾 Registra Azienda & Attiva API Key
      </button>
    </form>
  );
}
