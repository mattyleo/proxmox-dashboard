import { query, getAppSettings } from '@/lib/db';
import CompanyHealthCharts, { CompanyHealthItem } from '@/components/CompanyHealthCharts';
import Link from 'next/link';

export default async function Home() {
  const settings = await getAppSettings();

  let totalCompanies = 0,
    totalServers = 0,
    totalAlerts = 0;
  let recentAlerts: any[] = [];
  let companiesList: any[] = [];
  let allServers: any[] = [];
  let allVms: any[] = [];
  let openAlerts: any[] = [];

  try {
    const [c] = await query<{ count: number }>('SELECT COUNT(*) as count FROM companies');
    const [s] = await query<{ count: number }>('SELECT COUNT(*) as count FROM servers');
    const [a] = await query<{ count: number }>('SELECT COUNT(*) as count FROM alerts WHERE status = ?', ['open']);
    totalCompanies = c.count;
    totalServers = s.count;
    totalAlerts = a.count;

    recentAlerts = await query(
      'SELECT al.*, c.name as company_name FROM alerts al JOIN companies c ON al.company_id = c.id ORDER BY al.created_at DESC LIMIT 5'
    );
    companiesList = await query('SELECT * FROM companies ORDER BY created_at DESC');
    allServers = await query('SELECT * FROM servers');
    allVms = await query(
      'SELECT v.*, s.company_id FROM vms v JOIN servers s ON v.server_id = s.id'
    );
    openAlerts = await query('SELECT * FROM alerts WHERE status = ?', ['open']);
  } catch (e) {
    console.error('DB Error:', e);
  }

  // Calcola per ogni azienda la % di funzionamento (100% = OK, >=10% = problematiche)
  const companyHealthData: CompanyHealthItem[] = companiesList.map((comp: any) => {
    const compServers = allServers.filter((s: any) => s.company_id === comp.id);
    const compVms = allVms.filter((v: any) => v.company_id === comp.id);
    const compAlerts = openAlerts.filter((al: any) => al.company_id === comp.id);

    let issuesCount = 0;
    let criticalCount = 0;
    let penaltyPercent = 0;
    const topIssues: string[] = [];

    for (const srv of compServers) {
      if (srv.status !== 'online') {
        issuesCount++;
        criticalCount++;
        penaltyPercent += 25;
        topIssues.push(`Nodo ${srv.hostname} Offline`);
      }
    }

    for (const vm of compVms) {
      let vmIssues: any[] = [];
      try {
        if (vm.health_issues) vmIssues = JSON.parse(vm.health_issues);
      } catch {}

      for (const iss of vmIssues) {
        issuesCount++;
        topIssues.push(`${vm.name}: ${iss.title}`);
        if (iss.severity === 'critical') {
          criticalCount++;
          penaltyPercent += 20;
        } else if (iss.severity === 'warning') {
          penaltyPercent += 10;
        } else {
          penaltyPercent += 5;
        }
      }
    }

    for (const al of compAlerts) {
      issuesCount++;
      penaltyPercent += 10;
      if (!topIssues.includes(al.title)) {
        topIssues.push(al.title);
      }
    }

    if (issuesCount > 0 && penaltyPercent < 10) {
      penaltyPercent = 10;
    }

    const problemPercent = Math.min(90, penaltyPercent);
    const okPercent = Math.max(10, 100 - problemPercent);

    return {
      id: comp.id,
      name: comp.name,
      totalVms: compVms.length,
      totalServers: compServers.length,
      issuesCount,
      criticalCount,
      problemPercent,
      okPercent,
      topIssues,
    };
  });

  return (
    <div className="p-10 w-full max-w-7xl mx-auto flex flex-col xl:flex-row gap-10 relative z-10 h-full">
      <div className="flex-1 space-y-8 overflow-y-auto pr-2 pb-10">
        <header className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2 flex-wrap">
              <span className="bg-primary/20 text-primary border border-primary/30 text-xs font-black px-3 py-1 rounded-lg tracking-wider">
                {settings.instance_name}
              </span>
              <span className="text-xs font-mono text-muted-foreground bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
                🖥️ {settings.hardware_host}
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Overview Infrastruttura & Stato Aziende</h2>
            <p className="text-sm text-muted-foreground mt-1">
              100% indica funzionamento regolare; percentuali di problematiche (≥10%) evidenziano anomalie cliccabili.
            </p>
          </div>

          <Link
            href="/settings"
            className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2.5 rounded-xl font-semibold text-muted-foreground hover:text-white transition-colors"
          >
            ⚙️ Impostazioni Istanza
          </Link>
        </header>

        {/* CHARTS INTERATTIVI: PIZZA + RETTANGOLI PER AZIENDE */}
        {companyHealthData.length > 0 ? (
          <CompanyHealthCharts companies={companyHealthData} />
        ) : (
          <div className="glass-panel p-8 rounded-3xl border border-white/10 text-center space-y-3">
            <div className="text-3xl">📊</div>
            <h3 className="text-lg font-bold">Grafici Salute Aziende (Pizza & Rettangoli)</h3>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Il database è pronto e vuoto. Appena registrerai la prima azienda nella sezione{' '}
              <Link href="/companies" className="text-primary font-bold hover:underline">
                Aziende & Clienti
              </Link>{' '}
              compariranno qui il grafico a pizza e la mappa a rettangoli con le percentuali di funzionamento.
            </p>
          </div>
        )}

        {/* Contatori Rapidi */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-panel glass-panel-hover p-6 rounded-2xl relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/20 rounded-full blur-2xl"></div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Aziende Collegate</h3>
            <div className="text-5xl font-black">{totalCompanies}</div>
            <p className="text-xs text-success font-medium mt-2">Database MySQL Attivo ✅</p>
          </div>
          <div className="glass-panel glass-panel-hover p-6 rounded-2xl relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/20 rounded-full blur-2xl"></div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Nodi Proxmox & PBS</h3>
            <div className="text-5xl font-black">{totalServers}</div>
            <p className="text-xs text-muted-foreground font-medium mt-2">
              {allVms.length} Macchine Virtuali totali
            </p>
          </div>
          <div className="glass-panel glass-panel-hover p-6 rounded-2xl relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-destructive/20 rounded-full blur-2xl"></div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Allarmi Aperti (AI)</h3>
            <div className="text-5xl font-black text-warning">{totalAlerts}</div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">In attesa di verifica</p>
          </div>
        </div>

        {/* Ultimi Alert Ricevuti */}
        <div className="glass-panel p-8 rounded-3xl">
          <h4 className="text-lg font-bold mb-4">Ultimi Ticket & Allarmi Ricevuti</h4>
          <div className="space-y-3">
            {recentAlerts.length === 0 ? (
              <div className="p-4 border border-border bg-white/5 rounded-xl border-dashed">
                <p className="text-sm text-muted-foreground text-center">Nessun ticket aperto al momento</p>
              </div>
            ) : (
              recentAlerts.map((alert: any) => (
                <div
                  key={alert.id}
                  className={`p-4 rounded-xl border ${
                    alert.status === 'open'
                      ? 'border-warning/50 bg-warning/5'
                      : 'border-success/30 bg-success/5'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-bold">{alert.title}</span>
                    <span className="text-xs opacity-50">
                      {new Date(alert.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">Da: {alert.company_name}</div>
                  <Link href="/alerts" className="text-xs text-primary hover:underline">
                    Vedi dettagli →
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Aziende */}
      <div className="w-full xl:w-80 flex-shrink-0 flex flex-col space-y-6">
        <div className="glass-panel p-6 rounded-3xl flex-1 overflow-y-auto">
          <h4 className="text-lg font-bold mb-6 flex items-center gap-2">
            <span className="text-xl">🏢</span> Accesso Rapido Aziende
          </h4>
          <div className="space-y-3">
            {companyHealthData.length === 0 ? (
              <div className="text-center p-4 border border-dashed border-border rounded-xl">
                <p className="text-sm text-muted-foreground">Nessuna azienda</p>
              </div>
            ) : (
              companyHealthData.map((comp) => (
                <Link
                  key={comp.id}
                  href={comp.problemPercent > 0 ? `/companies/${comp.id}#problematiche` : `/companies/${comp.id}`}
                  className="block group"
                >
                  <div className="p-4 rounded-xl border border-white/5 bg-black/20 hover:bg-white/10 hover:border-primary/50 transition-all">
                    <div className="flex justify-between items-center mb-1">
                      <h5 className="font-bold text-sm group-hover:text-primary transition-colors truncate">
                        {comp.name}
                      </h5>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          comp.problemPercent === 0
                            ? 'bg-success/20 text-success'
                            : comp.problemPercent >= 25
                            ? 'bg-destructive/20 text-destructive'
                            : 'bg-warning/20 text-warning'
                        }`}
                      >
                        {comp.problemPercent === 0 ? '100% OK' : `⚠️ ${comp.problemPercent}% Prob.`}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {comp.totalVms} VM • {comp.issuesCount} problematiche
                    </p>
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
