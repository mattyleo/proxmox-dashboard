import { supabaseAdmin as supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export default async function AlertsPage() {
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*, companies(name), servers(hostname)')
    .order('created_at', { ascending: false });

  async function resolveAlert(formData: FormData) {
    'use server';
    const alertId = formData.get('id') as string;
    if (alertId) {
      await supabase.from('alerts').update({ status: 'resolved', resolved_at: new Date() }).eq('id', alertId);
      revalidatePath('/alerts');
    }
  }

  return (
    <div className="p-10 w-full max-w-7xl mx-auto space-y-10 relative z-10">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Ticket e Allarmi</h2>
          <p className="text-muted-foreground">Monitora le anomalie e visualizza le soluzioni proposte dall'AI.</p>
        </div>
      </header>

      <div className="space-y-6">
        {!alerts || alerts.length === 0 ? (
          <div className="glass-panel p-10 rounded-3xl flex flex-col items-center justify-center text-center">
            <div className="text-4xl mb-4">✅</div>
            <h4 className="text-lg font-bold">Tutto tranquillo!</h4>
            <p className="text-muted-foreground">Nessun alert rilevato sui sistemi analizzati.</p>
          </div>
        ) : (
          alerts.map((alert: any) => (
            <div key={alert.id} className={`glass-panel p-6 rounded-3xl space-y-4 border-l-4 ${alert.status === 'open' ? 'border-l-warning' : 'border-l-success'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className={`text-xs font-bold px-2 py-1 rounded-md ${alert.status === 'open' ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'}`}>
                      {alert.status.toUpperCase()}
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">
                      🏢 {alert.companies?.name} |  🖥️ {alert.servers?.hostname}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white">{alert.title}</h3>
                  <p className="text-sm text-gray-400 mt-2">{alert.description}</p>
                </div>
                {alert.status === 'open' && (
                  <form action={resolveAlert}>
                    <input type="hidden" name="id" value={alert.id} />
                    <button type="submit" className="bg-success/20 hover:bg-success/40 text-success font-bold py-2 px-4 rounded-xl transition-all">
                      Segna Risolto
                    </button>
                  </form>
                )}
              </div>

              {/* Box Soluzione Proposta dall'AI */}
              {alert.ai_suggested_solution && (
                <div className="mt-6 pt-6 border-t border-white/10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-xs">🤖</div>
                    <h4 className="font-bold text-sm text-primary">Soluzione Suggerita dall'IA</h4>
                  </div>
                  <div className="bg-black/50 p-4 rounded-xl border border-white/5 text-sm text-gray-300 prose prose-invert max-w-none">
                    {/* Render raw text per ora, in produzione si usa un parser markdown */}
                    <pre className="whitespace-pre-wrap font-sans">{alert.ai_suggested_solution}</pre>
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
