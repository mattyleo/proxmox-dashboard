import pool, { getAppSettings, ensureSchema, query } from '@/lib/db';
import { getCurrentUser, isAdmin, DEFAULT_USERS } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export default async function SettingsPage() {
  const [settings, currentUser] = await Promise.all([getAppSettings(), getCurrentUser()]);
  const canManage = isAdmin(currentUser);

  let usersList: any[] = [];
  try {
    usersList = await query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at ASC');
  } catch {
    usersList = DEFAULT_USERS.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    }));
  }

  async function saveSettings(formData: FormData) {
    'use server';
    const user = await getCurrentUser();
    if (!isAdmin(user)) return;

    await ensureSchema();
    const preset = formData.get('preset') as string | null;

    let instanceName = (formData.get('instance_name') as string) || 'GM-SYSTEM';
    let hardwareHost = (formData.get('hardware_host') as string) || 'Server HP ProLiant 380 (Locale)';
    let envLabel = (formData.get('environment_label') as string) || 'On-Premise Infrastructure';

    if (preset === 'gm-system') {
      instanceName = 'GM-SYSTEM';
      hardwareHost = 'Server HP ProLiant 380 (Locale)';
      envLabel = 'On-Premise Proxmox / Ubuntu Server';
    } else if (preset === 'leonimattia') {
      instanceName = 'leonimattia';
      hardwareHost = 'Microsoft Azure Cloud Infrastructure';
      envLabel = 'Cloud Multi-Tenant Production';
    }

    await pool.execute(
      `INSERT INTO app_settings (id, instance_name, hardware_host, environment_label, updated_at)
       VALUES (1, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         instance_name = VALUES(instance_name),
         hardware_host = VALUES(hardware_host),
         environment_label = VALUES(environment_label),
         updated_at = NOW()`,
      [instanceName.trim(), hardwareHost.trim(), envLabel.trim()]
    );

    revalidatePath('/', 'layout');
    revalidatePath('/settings');
  }

  async function addUser(formData: FormData) {
    'use server';
    const user = await getCurrentUser();
    if (!isAdmin(user)) return;

    const name = (formData.get('name') as string)?.trim();
    const email = (formData.get('email') as string)?.trim().toLowerCase();
    const password = (formData.get('password') as string)?.trim();
    const role = (formData.get('role') as string) || 'tecnico';

    if (name && email && password) {
      await ensureSchema();
      await pool.execute(
        `INSERT INTO users (id, name, email, password, role)
         VALUES (UUID(), ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password), role = VALUES(role)`,
        [name, email, password, role]
      );
      revalidatePath('/settings');
    }
  }

  async function deleteUser(formData: FormData) {
    'use server';
    const user = await getCurrentUser();
    if (!isAdmin(user)) return;

    const id = formData.get('id') as string;
    if (id) {
      await pool.execute('DELETE FROM users WHERE id = ?', [id]);
      revalidatePath('/settings');
    }
  }

  return (
    <div className="p-10 w-full max-w-6xl mx-auto space-y-10 relative z-10">
      <header className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 border-b border-white/10 pb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">⚙️ Impostazioni, Utenti & Info</h2>
          <p className="text-muted-foreground">
            Configura l&apos;identità dell&apos;istanza, gestisci gli account con permessi differenziati e consulta i crediti ufficiali.
          </p>
        </div>
        {!canManage && (
          <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold px-3.5 py-2 rounded-xl">
            👁️ Sola Visualizzazione ({currentUser?.role})
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* PANNELLO 1: CONFIGURAZIONE ISTANZA & HARDWARE OSPITANTE */}
        <section className="glass-panel p-8 rounded-3xl border border-white/10 space-y-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Personalizzazione Istanza
            </span>
            <h3 className="text-2xl font-bold mt-1">Azienda & Server Ospitante</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Nome mostrato nella dashboard (es. <strong>GM-SYSTEM</strong> sul server HP ProLiant 380 oppure{' '}
              <strong>leonimattia</strong> su Azure).
            </p>
          </div>

          {canManage ? (
            <form action={saveSettings} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  Nome Azienda / Istanza Dashboard
                </label>
                <input
                  type="text"
                  name="instance_name"
                  defaultValue={settings.instance_name}
                  required
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  Macchina / Server su cui gira la Dashboard
                </label>
                <input
                  type="text"
                  name="hardware_host"
                  defaultValue={settings.hardware_host}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  Tipo di Ambiente / Infrastruttura
                </label>
                <input
                  type="text"
                  name="environment_label"
                  defaultValue={settings.environment_label}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-primary hover:bg-orange-500 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-primary/25 cursor-pointer"
              >
                💾 Salva Impostazioni Istanza
              </button>

              <div className="pt-4 border-t border-white/10">
                <span className="text-xs text-muted-foreground block mb-3">
                  Profili Rapidi Preconfigurati:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="submit"
                    name="preset"
                    value="gm-system"
                    className="p-3 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 text-left transition-all cursor-pointer"
                  >
                    <span className="text-xs font-bold text-primary block">🖥️ Preset Aziendale Locale</span>
                    <span className="text-sm font-bold text-white block">GM-SYSTEM</span>
                    <span className="text-[11px] text-muted-foreground">HP ProLiant 380 (Ubuntu Server)</span>
                  </button>

                  <button
                    type="submit"
                    name="preset"
                    value="leonimattia"
                    className="p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-left transition-all cursor-pointer"
                  >
                    <span className="text-xs font-bold text-indigo-400 block">☁️ Preset Cloud Personale</span>
                    <span className="text-sm font-bold text-white block">leonimattia</span>
                    <span className="text-[11px] text-muted-foreground">Microsoft Azure Cloud</span>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="bg-black/30 p-5 rounded-2xl border border-white/10 space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Solo gli utenti con ruolo <strong>Amministratore</strong> possono modificare il nome dell&apos;istanza.
              </p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Istanza:</span>
                <strong className="text-primary">{settings.instance_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Server:</span>
                <strong>{settings.hardware_host}</strong>
              </div>
            </div>
          )}
        </section>

        {/* PANNELLO 2: INFORMAZIONI SUL PROGRAMMA & IDEATORE */}
        <section className="space-y-6">
          <div className="glass-panel p-8 rounded-3xl border border-primary/30 relative overflow-hidden space-y-6">
            <div className="absolute -right-8 -top-8 w-36 h-36 bg-primary/15 rounded-full blur-2xl pointer-events-none" />

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Informazioni Ufficiali & Copyright
              </span>
              <h3 className="text-2xl font-black mt-1">Crediti del Programma</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Piattaforma centralizzata di telemetria, diagnostica proattiva e monitoraggio per infrastrutture Proxmox VE.
              </p>
            </div>

            <div className="bg-black/40 p-6 rounded-2xl border border-white/10 space-y-4">
              <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary to-warning flex items-center justify-center text-white font-black text-xl shadow-lg">
                  ML
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">
                    Programma ideato e sviluppato da
                  </span>
                  <h4 className="text-xl font-black text-white">Mattia Leoni</h4>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <span className="text-primary text-base">📍</span>
                  <div>
                    <span className="text-xs text-muted-foreground block">Sede / Indirizzo</span>
                    <span className="font-semibold text-white">
                      Via Città di Pemba, 21 — Reggio Emilia (RE) 42123, Italy
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-primary text-base">📞</span>
                  <div>
                    <span className="text-xs text-muted-foreground block">Telefono</span>
                    <a
                      href="tel:+393770933621"
                      className="font-mono font-bold text-white hover:text-primary transition-colors"
                    >
                      (377) 093-3621
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-primary text-base">✉️</span>
                  <div>
                    <span className="text-xs text-muted-foreground block">Email Ufficiale</span>
                    <a
                      href="mailto:info@leonimattia.it"
                      className="font-mono font-bold text-primary hover:underline"
                    >
                      info@leonimattia.it
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-black/30 p-5 rounded-2xl border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Istanza Attiva:</span>
                <span className="font-bold text-primary">{settings.instance_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hardware Ospitante:</span>
                <span className="font-semibold text-white">{settings.hardware_host}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ambiente:</span>
                <span className="font-mono text-muted-foreground">{settings.environment_label}</span>
              </div>
            </div>

            <a
              href="/Manuale_Utilizzo_ProxmoxAI_GM-SYSTEM.pdf"
              download="Manuale_Utilizzo_ProxmoxAI_GM-SYSTEM.pdf"
              className="w-full flex items-center justify-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary font-bold text-xs py-3 px-4 rounded-xl transition-all"
            >
              📕 Scarica Manuale di Utilizzo Illustrato (PDF)
            </a>
          </div>
        </section>
      </div>

      {/* PANNELLO 3: GESTIONE UTENTI E PERMESSI (EMAIL & RUOLI) */}
      <section className="glass-panel p-8 rounded-3xl border border-white/10 space-y-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Controllo Accessi & Ruoli
          </span>
          <h3 className="text-2xl font-bold mt-1">👥 Gestione Utenti (Admin, Supervisori e Tecnici)</h3>
          <p className="text-sm text-muted-foreground mt-1">
            • <strong>👑 Admin</strong>: controllo completo su tutto.<br />
            • <strong>🛡️ Supervisore</strong>: inserisce le aziende, genera le API Key e scarica i file agent già configurati da installare sui sistemi.<br />
            • <strong>🛠️ Tecnico</strong>: ha solo la visione della dashboard e le informazioni consultabili su come risolvere i problemi.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {canManage ? (
            <form action={addUser} className="space-y-4 bg-black/30 p-6 rounded-2xl border border-white/10 h-fit">
              <h4 className="font-bold text-base">Aggiungi / Aggiorna Utente</h4>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nome e Cognome</label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="es. Marco Rossi"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Email di Login</label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="es. marco@gm-system.it"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Password</label>
                <input
                  type="text"
                  name="password"
                  required
                  placeholder="Imposta password..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Ruolo e Permessi</label>
                <select
                  name="role"
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white"
                >
                  <option value="supervisore">🛡️ Supervisore (Aziende & Scarico Agent Preconfigurato)</option>
                  <option value="tecnico">🛠️ Tecnico (Sola Visione Dashboard & Soluzioni Problemi)</option>
                  <option value="admin">👑 Amministratore (Accesso Completo a Tutto)</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full bg-primary hover:bg-orange-500 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all cursor-pointer"
              >
                + Salva Account Utente
              </button>
            </form>
          ) : (
            <div className="bg-black/30 p-6 rounded-2xl border border-white/10 text-xs text-muted-foreground h-fit">
              Solo un <strong>Amministratore</strong> può creare nuovi account o modificare i ruoli di accesso.
            </div>
          )}

          <div className="lg:col-span-2 space-y-3">
            {usersList.map((u: any) => (
              <div
                key={u.id || u.email}
                className="p-4 rounded-2xl bg-black/30 border border-white/10 flex flex-col sm:flex-row justify-between sm:items-center gap-3"
              >
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-white text-sm">{u.name}</span>
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                        u.role === 'admin'
                          ? 'bg-primary/20 text-primary'
                          : u.role === 'supervisore'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-indigo-500/20 text-indigo-300'
                      }`}
                    >
                      {u.role === 'admin'
                        ? '👑 ADMIN (Accesso Totale)'
                        : u.role === 'supervisore'
                        ? '🛡️ SUPERVISORE (Aziende & Agent)'
                        : '🛠️ TECNICO (Visione & Soluzioni)'}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{u.email}</span>
                </div>

                {canManage && u.email !== 'info@leonimattia.it' && (
                  <form action={deleteUser}>
                    <input type="hidden" name="id" value={u.id} />
                    <button
                      type="submit"
                      className="text-xs text-destructive hover:underline font-semibold cursor-pointer"
                    >
                      Rimuovi
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
