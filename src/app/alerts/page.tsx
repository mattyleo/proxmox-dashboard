import pool, { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export default async function AlertsPage() {
  let alerts: any[] = [];
  try {
    alerts = await query(
      `SELECT a.*, c.name as company_name, s.hostname as server_hostname, v.name as vm_name, v.vmid as vm_vmid
       FROM alerts a
       LEFT JOIN companies c ON a.company_id = c.id
       LEFT JOIN servers s ON a.server_id = s.id
       LEFT JOIN vms v ON a.vm_id = v.id
       ORDER BY a.created_at DESC`
    );
  } catch (e) {
    console.error('Errore lettura alerts:', e);
  }

  async function resolveAlert(formData: FormData) {
    'use server';
    const alertId = formData.get('id') as string;
    const saveKb = formData.get('save_kb') === 'true';
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const solution = formData.get('solution') as string;

    if (alertId) {
      await pool.execute(
        'UPDATE alerts SET status = ?, resolved_at = NOW() WHERE id = ?',
        ['resolved', alertId]
      );

      if (saveKb && title && solution) {
        await pool.execute(
          'INSERT INTO knowledge_base (id, title, description, solution, tags) VALUES (UUID(), ?, ?, ?, ?)',
          [title, description || '', solution, JSON.stringify(['Proxmox', 'Risolto'])]
        );
        revalidatePath('/kb');
      }

      revalidatePath('/alerts');
      revalidatePath('/');
    }
  }

  return (
    <div className="p-10 w-full max-w-7xl mx-auto space-y-10 relative z-10">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Ticket e Allarmi</h2>
          <p className="text-muted-foreground">
            Monitora le anomalie rilevate su nodi e VM e applica le soluzioni proposte.
          </p>
        </div>
      </header>

      <div className="space-y-6">
        {alerts.length === 0 ? (
          <div className="glass-panel p-10 rounded-3xl flex flex-col items-center justify-center text-center">
            <div className="text-4xl mb-4">✅</div>
            <h4 className="text-lg font-bold">Tutto tranquillo!</h4>
            <p className="text-muted-foreground">Nessun alert rilevato sui sistemi analizzati.</p>
          </div>
        ) : (
          alerts.map((alert: any) => (
            <div
              key={alert.id}
              className={`glass-panel p-6 rounded-3xl space-y-4 border-l-4 ${
                alert.status === 'open' ? 'border-l-warning' : 'border-l-success'
              }`}
            >
              <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                        alert.status === 'open'
                          ? 'bg-warning/20 text-warning'
                          : 'bg-success/20 text-success'
                      }`}
                    >
                      {String(alert.status).toUpperCase()}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">
                      🏢 {alert.company_name || 'Azienda'} | 🖥️ {alert.server_hostname || 'Nodo'}
                      {alert.vm_name ? ` | 💻 ${alert.vm_name} (#${alert.vm_vmid})` : ''}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(alert.created_at).toLocaleString()}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white">{alert.title}</h3>
                  <p className="text-sm text-gray-400 mt-1">{alert.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  {alert.vm_id && alert.company_id && (
                    <Link
                      href={`/companies/${alert.company_id}/vms/${alert.vm_id}`}
                      className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-2 px-3 rounded-xl transition-all"
                    >
                      Vai alla VM →
                    </Link>
                  )}
                  {alert.status === 'open' && (
                    <form action={resolveAlert} className="flex gap-2">
                      <input type="hidden" name="id" value={alert.id} />
                      <input type="hidden" name="title" value={alert.title} />
                      <input type="hidden" name="description" value={alert.description} />
                      <input type="hidden" name="solution" value={alert.ai_suggested_solution || ''} />
                      <button
                        type="submit"
                        name="save_kb"
                        value="false"
                        className="bg-success/20 hover:bg-success/40 text-success text-xs font-bold py-2 px-4 rounded-xl transition-all"
                      >
                        ✓ Segna Risolto
                      </button>
                      {alert.ai_suggested_solution && (
                        <button
                          type="submit"
                          name="save_kb"
                          value="true"
                          className="bg-primary/20 hover:bg-primary/40 text-primary text-xs font-bold py-2 px-4 rounded-xl transition-all"
                        >
                          ✓ Risolvi & Salva in KB
                        </button>
                      )}
                    </form>
                  )}
                </div>
              </div>

              {alert.ai_suggested_solution && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-xs">
                      🤖
                    </div>
                    <h4 className="font-bold text-sm text-primary">
                      Soluzione e Comandi Consigliati
                    </h4>
                  </div>
                  <div className="bg-black/50 p-4 rounded-xl border border-white/5 text-sm text-gray-300">
                    <pre className="whitespace-pre-wrap font-sans leading-relaxed">
                      {alert.ai_suggested_solution}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
