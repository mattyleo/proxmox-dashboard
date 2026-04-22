import { supabaseAdmin as supabase } from '@/lib/supabase';
import Link from 'next/link';

export default async function Home() {
  // Try to fetch stats dynamically
  let totalCompanies = 0;
  let totalServers = 0;
  let totalAlerts = 0;
  let recentAlerts: any[] = [];
  let companiesList: any[] = [];

  try {
    const [
      { count: cCount }, 
      { count: sCount }, 
      { count: aCount }, 
      { data: alertsData },
      { data: companiesData }
    ] = await Promise.all([
      supabase.from('companies').select('*', { count: 'exact', head: true }),
      supabase.from('servers').select('*', { count: 'exact', head: true }),
      supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('alerts').select('*, companies(name)').order('created_at', { ascending: false }).limit(5),
      supabase.from('companies').select('*').order('created_at', { ascending: false })
    ]);
    
    totalCompanies = cCount || 0;
    totalServers = sCount || 0;
    totalAlerts = aCount || 0;
    if (alertsData) recentAlerts = alertsData;
    if (companiesData) companiesList = companiesData;
  } catch (e) {
    console.error(e);
  }

  return (
    <div className="p-10 w-full max-w-7xl mx-auto flex gap-10 relative z-10 h-full">
      <div className="flex-1 space-y-10 overflow-y-auto pr-4 pb-10">
        <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Overview Sistema</h2>
          <p className="text-muted-foreground">Benvenuto nella Dashboard centralizzata ProxmoxAI.</p>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel glass-panel-hover p-6 rounded-2xl relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/20 rounded-full blur-2xl"></div>
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Aziende Collegate</h3>
          <div className="text-5xl font-black">{totalCompanies}</div>
          <p className="text-xs text-success font-medium mt-2">Database Connesso ✅</p>
        </div>
        
        <div className="glass-panel glass-panel-hover p-6 rounded-2xl relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/20 rounded-full blur-2xl"></div>
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Nodi Proxmox</h3>
          <div className="text-5xl font-black">{totalServers}</div>
          <p className="text-xs text-muted-foreground font-medium mt-2">Agent monitorati</p>
        </div>

        <div className="glass-panel glass-panel-hover p-6 rounded-2xl relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-destructive/20 rounded-full blur-2xl"></div>
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Allarmi Aperti (AI)</h3>
          <div className="text-5xl font-black text-warning">{totalAlerts}</div>
          <p className="text-xs text-muted-foreground mt-2 font-medium">In attesa di check</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-10">
        
        {/* Quick Actions */}
        <div className="glass-panel p-8 rounded-3xl min-h-[400px] flex flex-col justify-center items-center text-center">
          <div className="w-16 h-16 rounded-full bg-success/20 border border-success/30 flex items-center justify-center mb-6 text-2xl">
            🚀
          </div>
          <h4 className="text-xl font-bold mb-2">Sistema Prontissimo!</h4>
          <p className="text-sm text-muted-foreground max-w-sm mb-8">
            Il database Supabase è collegato correttamente. Ora puoi iniziare a registrare i tuoi clienti.
          </p>
          
          <Link href="/companies" className="bg-primary hover:bg-orange-500 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-primary/25">
            Aggiungi la prima Azienda
          </Link>
        </div>

        {/* Recent Alerts Activity */}
        <div className="glass-panel p-8 rounded-3xl min-h-[400px]">
           <h4 className="text-lg font-bold mb-6">Ultimi Alert Ricevuti</h4>
           <div className="space-y-4">
             {recentAlerts.length === 0 ? (
                <div className="p-4 border border-border bg-white/5 rounded-xl border-dashed">
                  <p className="text-sm text-muted-foreground text-center">Nessun dato cronologico disponibile</p>
                </div>
             ) : (
               recentAlerts.map(alert => (
                 <div key={alert.id} className={`p-4 rounded-xl border ${alert.status === 'open' ? 'border-warning/50 bg-warning/5' : 'border-success/30 bg-success/5'}`}>
                   <div className="flex justify-between items-start mb-1">
                     <span className="text-sm font-bold">{alert.title}</span>
                     <span className="text-xs opacity-50">{new Date(alert.created_at).toLocaleDateString()}</span>
                   </div>
                   <div className="text-xs text-muted-foreground mb-2">Da: {alert.companies?.name}</div>
                   <Link href="/alerts" className="text-xs text-primary hover:underline">Vedi dettagli & Soluzione IA →</Link>
                 </div>
               ))
             )}
           </div>
        </div>
      </div>
      </div>

      {/* Sidebar Aziende Monitorate */}
      <div className="w-80 flex-shrink-0 flex flex-col space-y-6">
        <div className="glass-panel p-6 rounded-3xl flex-1 overflow-y-auto">
          <h4 className="text-lg font-bold mb-6 flex items-center gap-2">
            <span className="text-xl">🏢</span> Aziende Monitorate
          </h4>
          
          <div className="space-y-3">
            {companiesList.length === 0 ? (
              <div className="text-center p-4 border border-dashed border-border rounded-xl">
                <p className="text-sm text-muted-foreground">Nessuna azienda sotto controllo</p>
              </div>
            ) : (
              companiesList.map(company => (
                <Link key={company.id} href={`/companies/${company.id}`} className="block group">
                  <div className="p-4 rounded-xl border border-white/5 bg-black/20 hover:bg-white/10 hover:border-primary/50 transition-all">
                    <div className="flex justify-between items-center mb-1">
                      <h5 className="font-bold text-sm group-hover:text-primary transition-colors">{company.name}</h5>
                      <span className={`w-2 h-2 rounded-full ${company.status === 'active' ? 'bg-success' : 'bg-warning'}`}></span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{company.contact_email || 'Nessun contatto'}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
