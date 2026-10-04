import { query, queryOne } from '@/lib/db';
import { getCurrentUser, canDeployAgents } from '@/lib/auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';

const formatGB = (bytes: number | null | undefined) => {
  if (bytes === null || bytes === undefined || isNaN(Number(bytes))) return 'N/A';
  return (Number(bytes) / 1024 ** 3).toFixed(1) + ' GB';
};

export default async function CompanyDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [company, currentUser] = await Promise.all([
    queryOne('SELECT * FROM companies WHERE id = ?', [id]),
    getCurrentUser(),
  ]);
  if (!company) notFound();

  const canDeploy = canDeployAgents(currentUser);

  const servers = await query('SELECT * FROM servers WHERE company_id = ? ORDER BY hostname ASC', [company.id]);
  const serverIds = servers.map((s: any) => s.id);
  const vms =
    serverIds.length > 0
      ? await query(
          `SELECT v.*, s.hostname as server_hostname 
           FROM vms v 
           JOIN servers s ON v.server_id = s.id 
           WHERE v.server_id IN (${serverIds.map(() => '?').join(',')})
           ORDER BY v.vmid ASC`,
          serverIds
        )
      : [];

  return (
    <div className="p-10 w-full max-w-7xl mx-auto space-y-10 relative z-10">
      <header className="flex flex-col md:flex-row justify-between md:items-end gap-4 border-b border-white/10 pb-6">
        <div>
          <Link href="/companies" className="text-sm font-medium text-primary hover:underline mb-2 inline-block">
            ← Torna alle Aziende
          </Link>
          <h2 className="text-4xl font-black tracking-tight mb-2">{company.name}</h2>
          <p className="text-muted-foreground">{company.contact_email || 'Nessuna email di contatto'}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          {canDeploy && (
            <div className="bg-black/50 p-3.5 rounded-xl border border-white/10 text-xs text-right space-y-2">
              <div className="font-mono text-primary">
                <span className="text-white/50 block mb-0.5 font-sans">🔑 API Key per Agente Proxmox:</span>
                {company.api_key}
              </div>
              <a
                href={`/api/agent-download?api_key=${encodeURIComponent(
                  company.api_key
                )}&name=${encodeURIComponent(company.name)}`}
                download
                className="inline-flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold px-3 py-1.5 rounded-lg transition-all"
              >
                ⬇️ Scarica Agent Già Configurato (.sh)
              </a>
            </div>
          )}
        </div>
      </header>

      {/* RIEPILOGO PROBLEMATICHE RILEVATE (Ancora #problematiche dai grafici della Home) */}
      {(() => {
        const companyIssues: Array<{
          vmId: string;
          vmName: string;
          vmid: number;
          severity: string;
          title: string;
          description: string;
          solution: string;
        }> = [];

        for (const vm of vms as any[]) {
          let parsed: any[] = [];
          try {
            if (vm.health_issues) parsed = JSON.parse(vm.health_issues);
          } catch {}
          for (const iss of parsed) {
            companyIssues.push({
              vmId: vm.id,
              vmName: vm.name,
              vmid: vm.vmid,
              severity: iss.severity || 'warning',
              title: iss.title,
              description: iss.description,
              solution: iss.solution,
            });
          }
        }

        const penalty = Math.min(
          90,
          companyIssues.reduce(
            (acc, cur) => acc + (cur.severity === 'critical' ? 20 : cur.severity === 'warning' ? 10 : 5),
            companyIssues.length > 0 ? 10 : 0
          )
        );
        const okPct = Math.max(10, 100 - penalty);

        return (
          <section
            id="problematiche"
            className={`glass-panel p-6 rounded-3xl border space-y-4 scroll-mt-6 ${
              companyIssues.length === 0
                ? 'border-success/30 bg-success/5'
                : 'border-warning/40 bg-warning/5'
            }`}
          >
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Stato Salute Aziendale & Diagnostica
                </span>
                <h3 className="text-xl font-bold flex items-center gap-2 mt-0.5">
                  {companyIssues.length === 0
                    ? '✅ Infrastruttura al 100% — Nessuna Problematica Rilevata'
                    : `⚠️ ${companyIssues.length} Problematiche Rilevate sull'Azienda`}
                </h3>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono font-bold">
                <span className="bg-success/20 text-success px-3 py-1.5 rounded-xl">
                  Funzionamento: {companyIssues.length === 0 ? 100 : okPct}% OK
                </span>
                {companyIssues.length > 0 && (
                  <span className="bg-destructive/20 text-destructive px-3 py-1.5 rounded-xl">
                    Problematiche: {penalty}%
                  </span>
                )}
              </div>
            </div>

            {companyIssues.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {companyIssues.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl bg-black/40 border border-white/10 border-l-4 flex flex-col justify-between gap-3 ${
                      item.severity === 'critical'
                        ? 'border-l-destructive'
                        : item.severity === 'warning'
                        ? 'border-l-warning'
                        : 'border-l-primary'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <span className="text-xs font-mono text-primary font-bold">
                          💻 {item.vmName} (#{item.vmid})
                        </span>
                        <Link
                          href={`/companies/${company.id}/vms/${item.vmId}`}
                          className="text-[11px] bg-primary/20 hover:bg-primary/30 text-primary font-bold px-2.5 py-1 rounded-lg transition-colors"
                        >
                          Apri VM & Soluzione →
                        </Link>
                      </div>
                      <h4 className="font-bold text-sm text-white">{item.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                    </div>
                    <div className="bg-black/60 p-2.5 rounded-xl border border-white/5 text-[11px] font-mono text-gray-300 whitespace-pre-wrap">
                      🛠️ {item.solution}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })()}

      {/* SEZIONE 1: TUTTE LE MACCHINE VIRTUALI DELL'AZIENDA */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold flex items-center gap-2">
              💻 Tutte le Macchine Virtuali ({vms.length})
            </h3>
            <p className="text-sm text-muted-foreground">
              Clicca su qualsiasi VM per aprire lo stato in tempo reale, spazio libero/usato, aggiornamenti, difetti e soluzioni.
            </p>
          </div>
        </div>

        {vms.length === 0 ? (
          <div className="glass-panel p-10 rounded-3xl text-center text-muted-foreground">
            <p className="text-lg font-medium mb-1">Nessuna Macchina Virtuale ancora rilevata per questa azienda.</p>
            <p className="text-sm">
              Scarica il file <code className="text-primary">.sh</code> in alto a destra e avvialo sul nodo Proxmox del cliente per ricevere i dati in automatico.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {vms.map((vm: any) => {
              const maxMem = Number(vm.maxmem || 0);
              const usedMem = Number(vm.mem_used ?? (maxMem * Number(vm.ram_usage || 0)) / 100);
              const freeMem = Math.max(0, maxMem - usedMem);
              const ramPct = Number(vm.ram_usage || (maxMem > 0 ? (100 * usedMem) / maxMem : 0));

              const maxDisk = Number(vm.maxdisk || 0);
              const usedDisk = Number(vm.disk_used ?? (maxDisk * Number(vm.disk_usage || 0)) / 100);
              const freeDisk = Math.max(0, maxDisk - usedDisk);
              const diskPct = Number(vm.disk_usage || (maxDisk > 0 ? (100 * usedDisk) / maxDisk : 0));

              const cpuPct = Number(vm.cpu_usage || 0);

              let issues: any[] = [];
              try {
                if (vm.health_issues) issues = JSON.parse(vm.health_issues);
              } catch {}
              const criticalCount = issues.filter((i) => i.severity === 'critical').length;
              const warningCount = issues.filter((i) => i.severity === 'warning').length;

              return (
                <Link
                  key={vm.id}
                  href={`/companies/${company.id}/vms/${vm.id}`}
                  className="glass-panel glass-panel-hover p-6 rounded-3xl border border-white/10 flex flex-col justify-between group relative overflow-hidden"
                >
                  <div
                    className={`absolute top-0 left-0 w-full h-1 ${
                      vm.status === 'running'
                        ? criticalCount > 0
                          ? 'bg-destructive'
                          : warningCount > 0
                          ? 'bg-warning'
                          : 'bg-success'
                        : 'bg-muted'
                    }`}
                  />

                  <div>
                    <div className="flex justify-between items-start gap-2 mb-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-3 h-3 rounded-full flex-shrink-0 ${
                            vm.status === 'running' ? 'bg-success animate-pulse' : 'bg-muted'
                          }`}
                        />
                        <div>
                          <h4 className="font-bold text-lg group-hover:text-primary transition-colors leading-tight">
                            {vm.name}
                          </h4>
                          <span className="text-xs font-mono text-muted-foreground">
                            {vm.vm_type === 'lxc' ? 'LXC' : 'QEMU'} #{vm.vmid} • Nodo: {vm.server_hostname}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${
                          vm.status === 'running'
                            ? 'bg-success/20 text-success'
                            : 'bg-white/10 text-muted-foreground'
                        }`}
                      >
                        {vm.status?.toUpperCase()}
                      </span>
                    </div>

                    <div className="bg-black/30 rounded-xl p-3 mb-4 border border-white/5 text-xs space-y-1">
                      <div className="truncate text-white/90 font-medium">
                        💿 {vm.os_info || 'Sistema Operativo non rilevato'}
                      </div>
                      <div className="flex justify-between text-muted-foreground font-mono">
                        <span>🌐 IP: {vm.ip_address || 'N/D'}</span>
                        <span>⚙️ {vm.cpus || 1} vCPU</span>
                      </div>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-muted-foreground">CPU in uso</span>
                          <span className="font-mono font-bold">{cpuPct.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              cpuPct > 85 ? 'bg-destructive' : cpuPct > 65 ? 'bg-warning' : 'bg-primary'
                            }`}
                            style={{ width: `${Math.min(100, cpuPct)}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-muted-foreground">RAM ({formatGB(usedMem)} usati)</span>
                          <span className="font-mono text-success font-semibold">{formatGB(freeMem)} liberi</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              ramPct > 88 ? 'bg-destructive' : ramPct > 75 ? 'bg-warning' : 'bg-indigo-400'
                            }`}
                            style={{ width: `${Math.min(100, ramPct)}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-muted-foreground">HD ({formatGB(usedDisk)} usati)</span>
                          <span className="font-mono text-success font-semibold">{formatGB(freeDisk)} liberi</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              diskPct > 85 ? 'bg-destructive' : diskPct > 70 ? 'bg-warning' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${Math.min(100, diskPct)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-white/10 flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      {issues.length === 0 ? (
                        <span className="text-success font-semibold flex items-center gap-1">
                          ✅ Nessun difetto
                        </span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            criticalCount > 0
                              ? 'bg-destructive/20 text-destructive'
                              : warningCount > 0
                              ? 'bg-warning/20 text-warning'
                              : 'bg-primary/20 text-primary'
                          }`}
                        >
                          ⚠️ {issues.length} {issues.length === 1 ? 'Avviso/Difetto' : 'Avvisi/Difetti'}
                        </span>
                      )}
                      {Number(vm.pending_updates) > 0 && (
                        <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-semibold">
                          🔄 {vm.pending_updates} upd
                        </span>
                      )}
                    </div>
                    <span className="text-primary font-bold group-hover:translate-x-1 transition-transform">
                      Ispeziona →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* SEZIONE 2: STATO NODI PROXMOX (PVE) & PROXMOX BACKUP SERVER (PBS) */}
      <section className="space-y-4 pt-4">
        <h3 className="text-2xl font-bold">🖥️ Nodi Fisici Proxmox & Storage PBS ({servers.length})</h3>
        {servers.map((server: any) => {
          const totalRam = Number(server.total_ram || 0);
          const usedRam = Number(server.used_ram || 0);
          const freeRam = Math.max(0, totalRam - usedRam);

          const totalDisk = Number(server.total_disk || 0);
          const usedDisk = Number(server.used_disk || 0);
          const freeDisk = Math.max(0, totalDisk - usedDisk);

          let pbsStorages: any[] = [];
          try {
            if (server.pbs_info) pbsStorages = JSON.parse(server.pbs_info);
          } catch {}

          return (
            <div key={server.id} className="glass-panel rounded-3xl overflow-hidden border border-white/10 p-6 space-y-6">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 pb-6 border-b border-white/10">
                <div>
                  <h4 className="font-bold text-2xl flex items-center gap-3">
                    {server.node_type === 'pbs' ? '🛡️' : '🖥️'} {server.hostname}
                    <span className="text-xs font-mono bg-white/10 px-2.5 py-1 rounded-md">
                      {server.node_type === 'pbs' ? 'PBS (Backup Server)' : 'Proxmox VE Node'}
                    </span>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                        server.status === 'online'
                          ? 'bg-success/20 text-success'
                          : 'bg-destructive/20 text-destructive'
                      }`}
                    >
                      {server.status?.toUpperCase()}
                    </span>
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {server.os_version || 'Proxmox VE'} • IP: {server.ip_address || 'N/D'} • Ultimo contatto:{' '}
                    {server.last_seen ? new Date(server.last_seen).toLocaleString() : 'Mai'}
                  </p>
                </div>
                {Number(server.pending_updates) > 0 && (
                  <div className="bg-warning/15 border border-warning/30 text-warning px-4 py-2 rounded-xl text-xs font-bold">
                    🔄 {server.pending_updates} aggiornamenti APT disponibili sul nodo
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                  <span className="text-xs text-muted-foreground block mb-1">CPU Nodo</span>
                  <span className="text-xl font-bold">
                    {server.cpu_usage != null ? `${Number(server.cpu_usage).toFixed(1)}%` : 'N/A'}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({server.total_cpu || '?'} Cores)
                    </span>
                  </span>
                </div>
                <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                  <span className="text-xs text-muted-foreground block mb-1">
                    RAM Nodo (Usata / Libera / Totale)
                  </span>
                  <span className="text-xl font-bold">
                    {formatGB(usedRam)} / <span className="text-success">{formatGB(freeRam)} liberi</span>
                  </span>
                  <span className="text-xs text-muted-foreground block mt-0.5">
                    Totale: {formatGB(totalRam)}
                  </span>
                </div>
                <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                  <span className="text-xs text-muted-foreground block mb-1">
                    Storage Nodo (Usato / Libero / Totale)
                  </span>
                  <span className="text-xl font-bold">
                    {formatGB(usedDisk)} / <span className="text-success">{formatGB(freeDisk)} liberi</span>
                  </span>
                  <span className="text-xs text-muted-foreground block mt-0.5">
                    Totale: {formatGB(totalDisk)}
                  </span>
                </div>
              </div>

              {/* Riquadro PBS / Storage di Backup Rilevati Automaticamente */}
              <div className="pt-4 border-t border-white/10">
                <h5 className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
                  🛡️ Proxmox Backup Server (PBS) & Storage di Backup Rilevati dal Nodo
                </h5>
                {pbsStorages.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Nessuno storage PBS o di backup esterno rilevato su questo nodo.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pbsStorages.map((pbs: any, i: number) => (
                      <div
                        key={i}
                        className="bg-black/40 p-4 rounded-2xl border border-primary/20 flex justify-between items-center gap-4"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{pbs.name}</span>
                            <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-bold">
                              {pbs.type}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                pbs.active
                                  ? 'bg-success/20 text-success'
                                  : 'bg-destructive/20 text-destructive'
                              }`}
                            >
                              {pbs.active ? '● ATTIVO' : '○ OFFLINE'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono mt-1">
                            Server PBS: <strong>{pbs.server}</strong> • Datastore: <strong>{pbs.datastore}</strong>
                          </p>
                        </div>
                        <div className="text-right text-xs font-mono">
                          <span className="text-white font-bold block">
                            Usati: {formatGB(pbs.used_bytes)}
                          </span>
                          <span className="text-success font-bold block">
                            Liberi: {formatGB(pbs.avail_bytes)}
                          </span>
                          <span className="text-muted-foreground text-[11px]">
                            Tot: {formatGB(pbs.total_bytes)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
