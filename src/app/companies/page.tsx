import { query } from '@/lib/db';
import { getCurrentUser, isAdmin, canDeployAgents } from '@/lib/auth';
import CompanyCreationForm from '@/components/CompanyCreationForm';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export default async function CompaniesPage() {
  const user = await getCurrentUser();
  const canDeploy = canDeployAgents(user);
  const canDelete = isAdmin(user);

  let companies: any[] = [];
  try {
    companies = await query('SELECT * FROM companies ORDER BY created_at DESC');
  } catch (e) {
    console.error(e);
  }

  async function addCompany(formData: FormData) {
    'use server';
    const current = await getCurrentUser();
    if (!canDeployAgents(current)) return;

    const name = (formData.get('name') as string)?.trim();
    const email = (formData.get('email') as string)?.trim();
    const customApiKey = (formData.get('api_key') as string)?.trim();

    if (name) {
      const { default: pool } = await import('@/lib/db');
      if (customApiKey) {
        await pool.execute(
          `INSERT INTO companies (id, name, contact_email, api_key)
           VALUES (UUID(), ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), contact_email = VALUES(contact_email)`,
          [name, email || null, customApiKey]
        );
      } else {
        await pool.execute(
          'INSERT INTO companies (id, name, contact_email, api_key) VALUES (UUID(), ?, ?, UUID())',
          [name, email || null]
        );
      }
      revalidatePath('/companies');
      revalidatePath('/');
    }
  }

  async function deleteCompany(formData: FormData) {
    'use server';
    const current = await getCurrentUser();
    if (!isAdmin(current)) return;

    const id = formData.get('id') as string;
    if (id) {
      const { default: pool } = await import('@/lib/db');
      await pool.execute('DELETE FROM companies WHERE id = ?', [id]);
      revalidatePath('/companies');
      revalidatePath('/');
    }
  }

  return (
    <div className="p-10 w-full max-w-7xl mx-auto space-y-10 relative z-10">
      <header className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Aziende & Installazione Agent</h2>
          <p className="text-muted-foreground">
            {canDeploy
              ? 'Registra le aziende clienti e scarica il file proxmox-agent.sh già configurato con la relativa API Key.'
              : 'Seleziona un’azienda per visualizzare la dashboard delle VM e consultare le soluzioni ai problemi.'}
          </p>
        </div>
        {!canDeploy && (
          <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold px-3.5 py-2 rounded-xl">
            🛠️ Accesso TECNICO — Visione Dashboard & Soluzioni
          </span>
        )}
        {user?.role === 'supervisore' && (
          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold px-3.5 py-2 rounded-xl">
            🛡️ Accesso SUPERVISORE — Abilitato Installazione Agent
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {canDeploy ? (
          <div className="lg:col-span-1 glass-panel p-6 rounded-3xl h-fit">
            <h3 className="text-xl font-bold mb-2">Nuova Azienda & Agent</h3>
            <p className="text-xs text-muted-foreground mb-5">
              Inserisci i dati dell&apos;azienda: il codice API e il file <code className="text-primary">.sh</code> preconfigurato vengono generati subito qui sotto.
            </p>
            <CompanyCreationForm addCompanyAction={addCompany} />
          </div>
        ) : (
          <div className="lg:col-span-1 glass-panel p-6 rounded-3xl h-fit space-y-3 border border-indigo-500/20">
            <div className="text-2xl">🛠️</div>
            <h3 className="text-lg font-bold">Profilo Tecnico</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Il tuo account (<strong>{user?.email}</strong>) ha accesso alla{' '}
              <strong>visione della dashboard e alla consultazione delle procedure di risoluzione</strong>. Clicca su un&apos;azienda a destra per ispezionare nodi, VM, stato risorse e comandi correttivi.
            </p>
          </div>
        )}

        <div className="lg:col-span-2 space-y-4">
          {companies.length === 0 ? (
            <div className="glass-panel p-10 rounded-3xl flex flex-col items-center justify-center text-center min-h-[300px]">
              <div className="text-4xl mb-4">🏢</div>
              <h4 className="text-lg font-bold mb-2">Nessuna azienda registrata</h4>
              <p className="text-sm text-muted-foreground max-w-sm">
                {canDeploy
                  ? 'Compila il modulo a sinistra per registrare la prima azienda e scaricare il file agent preconfigurato.'
                  : 'Nessuna azienda è stata ancora configurata.'}
              </p>
            </div>
          ) : (
            companies.map((company: any) => (
              <div
                key={company.id}
                className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
              >
                <div>
                  <Link href={`/companies/${company.id}`} className="hover:underline">
                    <h4 className="text-xl font-bold text-primary">{company.name}</h4>
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {company.contact_email || 'Nessuna email'}
                  </p>
                  <Link
                    href={`/companies/${company.id}`}
                    className="inline-block mt-2 text-xs font-bold text-white/80 hover:text-primary transition-colors"
                  >
                    🖥️ Apri Nodi Proxmox & Macchine Virtuali →
                  </Link>
                </div>

                <div className="flex flex-col gap-2.5 items-stretch md:items-end w-full md:w-auto">
                  {canDeploy ? (
                    <div className="bg-black/50 p-3.5 rounded-xl border border-white/10 text-xs space-y-2.5">
                      <div>
                        <span className="text-white/50 block mb-0.5 text-[11px]">
                          🔑 Codice API Key Agent:
                        </span>
                        <span className="font-mono text-primary font-bold select-all">
                          {company.api_key}
                        </span>
                      </div>

                      {/* Link di Download diretto sotto al codice API */}
                      <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                        <a
                          href={`/api/agent-download?api_key=${encodeURIComponent(
                            company.api_key
                          )}&name=${encodeURIComponent(company.name)}`}
                          download
                          className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                        >
                          ⬇️ Scarica Agent Già Configurato (.sh)
                        </a>

                        {canDelete && (
                          <form action={deleteCompany}>
                            <input type="hidden" name="id" value={company.id} />
                            <button
                              type="submit"
                              className="text-xs text-red-500 hover:text-red-400 hover:underline px-2 py-1 transition-colors cursor-pointer"
                            >
                              Elimina Azienda
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Link
                      href={`/companies/${company.id}`}
                      className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors text-center"
                    >
                      👁️ Apri Dashboard & Diagnostica VM →
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
