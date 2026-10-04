import pool, { query, queryOne } from '@/lib/db';
import { suggestProxmoxSolution } from '@/lib/ai';
import LiveRefresh from '@/components/LiveRefresh';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';

const formatGB = (bytes: number | null | undefined) => {
  if (bytes === null || bytes === undefined || isNaN(Number(bytes))) return '0.00 GB';
  return (Number(bytes) / 1024 ** 3).toFixed(2) + ' GB';
};

const formatUptime = (seconds: number | null | undefined) => {
  const s = Number(seconds || 0);
  if (s <= 0) return 'Spenta / N/D';
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}g ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins} minuti`;
};

export default async function VmDetailPage({
  params,
}: {
  params: Promise<{ id: string; vmid: string }>;
}) {
  const { id, vmid } = await params;

  const vm = await queryOne(
    `SELECT v.*, s.hostname as server_hostname, s.ip_address as server_ip, s.company_id, c.name as company_name
     FROM vms v
     JOIN servers s ON v.server_id = s.id
     JOIN companies c ON s.company_id = c.id
     WHERE v.id = ? AND s.company_id = ?`,
    [vmid, id]
  );

  if (!vm) notFound();

  // Ultime 20 metriche per questa VM
  const metrics = await query(
    'SELECT * FROM metrics WHERE vm_id = ? ORDER BY created_at DESC LIMIT 20',
    [vm.id]
  );

  // Calcoli RAM (Totale, In uso, Libera, %)
  const maxMem = Number(vm.maxmem || 0);
  const usedMem = Number(vm.mem_used ?? (maxMem * Number(vm.ram_usage || 0)) / 100);
  const freeMem = Math.max(0, maxMem - usedMem);
  const ramPct = Number(vm.ram_usage ?? (maxMem > 0 ? (100 * usedMem) / maxMem : 0));

  // Calcoli Hard Disk (Totale, In uso, Libero, %)
  const maxDisk = Number(vm.maxdisk || 0);
  const usedDisk = Number(vm.disk_used ?? (maxDisk * Number(vm.disk_usage || 0)) / 100);
  const freeDisk = Math.max(0, maxDisk - usedDisk);
  const diskPct = Number(vm.disk_usage ?? (maxDisk > 0 ? (100 * usedDisk) / maxDisk : 0));

  const cpuPct = Number(vm.cpu_usage || 0);
  const pendingUpdates = Number(vm.pending_updates || 0);

  // Estrai o genera l'elenco difetti, problematiche e soluzioni
  let issues: Array<{ severity: string; title: string; description: string; solution: string }> = [];
  try {
    if (vm.health_issues) {
      issues = JSON.parse(vm.health_issues);
    }
  } catch {}

  // Se il JSON era vuoto ma ci sono condizioni da segnalare, calcolale al volo
  if (issues.length === 0) {
    if (vm.status !== 'running') {
      issues.push({
        severity: 'warning',
        title: 'Macchina Virtuale Spenta',
        description: `La VM ${vm.name} (VMID ${vm.vmid}) non è in esecuzione.`,
        solution: `Avvia la macchina dal nodo ${vm.server_hostname} con:\nqm start ${vm.vmid}\ne controlla eventuali errori nei task Proxmox.`
      });
    }
    if (diskPct >= 80) {
      issues.push({
        severity: diskPct >= 90 ? 'critical' : 'warning',
        title: `Spazio Disco Critico (${diskPct.toFixed(1)}% occupato - Liberi: ${formatGB(freeDisk)})`,
        description: 'Lo spazio libero su disco sta terminando. Questo può bloccare database, servizi di posta o impedire il login.',
        solution: `1. Pulisci cache pacchetti e log dentro la VM:\n   sudo apt clean && sudo journalctl --vacuum-time=7d\n2. Oppure aumenta il disco a caldo dal nodo Proxmox (${vm.server_hostname}):\n   qm resize ${vm.vmid} scsi0 +20G`
      });
    }
    if (ramPct >= 85) {
      issues.push({
        severity: ramPct >= 93 ? 'critical' : 'warning',
        title: `Memoria RAM Quasi Esaurita (${ramPct.toFixed(1)}% in uso - Liberi: ${formatGB(freeMem)})`,
        description: 'Poca RAM libera disponibile. Il sistema potrebbe rallentare usando lo swap o terminare processi critici (OOM Killer).',
        solution: `1. Verifica i processi più esosi nella VM con: ps aux --sort=-%mem | head -n 10\n2. Aumenta la RAM assegnata su Proxmox:\n   qm set ${vm.vmid} -memory ${Math.round(maxMem / (1024 * 1024)) + 2048}`
      });
    }
    if (pendingUpdates > 0) {
      issues.push({
        severity: 'info',
        title: `${pendingUpdates} Aggiornamenti di Sistema Disponibili`,
        description: `Sono stati rilevati ${pendingUpdates} pacchetti da aggiornare sul sistema operativo (${vm.os_info || 'Guest OS'}).`,
        solution: `1. Esegui uno snapshot preventivo da Proxmox: qm snapshot ${vm.vmid} pre-update\n2. Esegui gli aggiornamenti dentro la VM:\n   sudo apt update && sudo apt upgrade -y`
      });
    }
  }

  // Server action per salvare una soluzione direttamente nella Knowledge Base
  async function saveToKnowledgeBase(formData: FormData) {
    'use server';
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const solution = formData.get('solution') as string;
    if (title && solution) {
      await pool.execute(
        'INSERT INTO knowledge_base (id, title, description, solution, tags) VALUES (UUID(), ?, ?, ?, ?)',
        [title, description, solution, JSON.stringify(['Proxmox', vm.vm_type || 'QEMU', vm.name])]
      );
      revalidatePath('/kb');
    }
  }

  // Server action per richiedere un check diagnostico AI e aprire un Ticket
  async function runAiDiagnosticCheck() {
    'use server';
    const alertTitle = `Analisi Diagnostica VM: ${vm.name} (VMID ${vm.vmid})`;
    const alertDesc = `Stato: ${vm.status} | OS: ${vm.os_info || 'N/D'} | CPU: ${cpuPct.toFixed(1)}% (${vm.cpus} vCPU) | RAM: ${formatGB(usedMem)} usati / ${formatGB(freeMem)} liberi (${ramPct.toFixed(1)}%) | HD: ${formatGB(usedDisk)} usati / ${formatGB(freeDisk)} liberi (${diskPct.toFixed(1)}%) | Aggiornamenti: ${pendingUpdates} | Backup: ${vm.last_backup || 'N/D'}`;

    const aiSolution = await suggestProxmoxSolution(
      alertTitle,
      alertDesc,
      `Nodo Proxmox: ${vm.server_hostname}, Tipo VM: ${vm.vm_type}, Difetti rilevati: ${issues.map((i) => i.title).join('; ') || 'Nessuno'}`
    );

    await pool.execute(
      `INSERT INTO alerts (id, company_id, server_id, vm_id, title, description, severity, status, ai_suggested_solution)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'open', ?)`,
      [
        vm.company_id,
        vm.server_id,
        vm.id,
        alertTitle,
        alertDesc,
        diskPct > 85 || ramPct > 85 ? 'critical' : 'warning',
        aiSolution
      ]
    );

    revalidatePath('/alerts');
    revalidatePath(`/companies/${id}/vms/${vmid}`);
  }

  // Ultimo ticket AI per questa VM (se presente)
  const latestVmAlert = await queryOne(
    'SELECT * FROM alerts WHERE vm_id = ? ORDER BY created_at DESC LIMIT 1',
    [vm.id]
  );

  return (
    <div className="p-10 w-full max-w-6xl mx-auto space-y-8 relative z-10">
      {/* Top Bar: Breadcrumb + Live Sync */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          <Link href="/companies" className="hover:text-primary transition-colors">
            Aziende
          </Link>
          <span>/</span>
          <Link href={`/companies/${id}`} className="hover:text-primary transition-colors">
            {vm.company_name}
          </Link>
          <span>/</span>
          <span className="text-foreground font-bold">{vm.name}</span>
        </div>

        <LiveRefresh intervalSeconds={10} />
      </div>

      {/* Header Principale VM */}
      <header className="glass-panel p-8 rounded-3xl border border-white/10 relative overflow-hidden">
        <div
          className={`absolute top-0 left-0 w-full h-1.5 ${
            vm.status === 'running' ? 'bg-success' : 'bg-destructive'
          }`}
        />
        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-6">
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3">
                💻 {vm.name}
              </h1>
              <span
                className={`text-xs font-bold px-3 py-1.5 rounded-lg ${
                  vm.status === 'running'
                    ? 'bg-success/20 text-success border border-success/30'
                    : 'bg-destructive/20 text-destructive border border-destructive/30'
                }`}
              >
                {vm.status === 'running' ? '● IN ESECUZIONE (ONLINE)' : '○ FERMA (STOPPED)'}
              </span>
              <span className="text-xs font-mono bg-white/10 px-3 py-1.5 rounded-lg">
                {vm.vm_type === 'lxc' ? 'Container LXC' : 'QEMU Virtual Machine'} #{vm.vmid}
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              Ospitata sul nodo Proxmox <strong className="text-white">{vm.server_hostname}</strong> ({vm.server_ip || 'IP nodo N/D'}) •
              Ultimo contatto agente:{' '}
              <strong className="text-white">
                {vm.last_seen ? new Date(vm.last_seen).toLocaleString() : 'N/D'}
              </strong>
            </p>
          </div>

          <form action={runAiDiagnosticCheck}>
            <button
              type="submit"
              className="bg-primary hover:bg-orange-500 text-white font-bold text-sm px-5 py-3 rounded-xl shadow-lg shadow-primary/25 transition-all flex items-center gap-2"
            >
              🤖 Genera Report AI & Ticket
            </button>
          </form>
        </div>

        {/* Griglia Info OS, IP, Uptime, Backup, Guest Agent, Aggiornamenti */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-white/10 text-xs">
          <div className="bg-black/30 p-3.5 rounded-xl border border-white/5 col-span-2">
            <span className="text-muted-foreground block mb-1">Sistema Operativo (OS)</span>
            <span className="font-bold text-sm text-white block truncate" title={vm.os_info}>
              💿 {vm.os_info || 'Linux / Windows Guest'}
            </span>
          </div>
          <div className="bg-black/30 p-3.5 rounded-xl border border-white/5">
            <span className="text-muted-foreground block mb-1">Indirizzo IP VM</span>
            <span className="font-mono font-bold text-sm text-primary">
              {vm.ip_address || 'Non rilevato'}
            </span>
          </div>
          <div className="bg-black/30 p-3.5 rounded-xl border border-white/5">
            <span className="text-muted-foreground block mb-1">Tempo di Attività (Uptime)</span>
            <span className="font-bold text-sm text-white">⏱️ {formatUptime(vm.uptime)}</span>
          </div>
          <div className="bg-black/30 p-3.5 rounded-xl border border-white/5">
            <span className="text-muted-foreground block mb-1">Stato Ultimo Backup</span>
            <span
              className={`font-bold text-sm ${
                String(vm.last_backup).startsWith('OK')
                  ? 'text-success'
                  : String(vm.last_backup).startsWith('ERRORE')
                  ? 'text-destructive'
                  : 'text-warning'
              }`}
            >
              🛡️ {vm.last_backup || 'Non rilevato'}
            </span>
          </div>
          <div className="bg-black/30 p-3.5 rounded-xl border border-white/5">
            <span className="text-muted-foreground block mb-1">Aggiornamenti OS</span>
            <span className={`font-bold text-sm ${pendingUpdates > 0 ? 'text-warning' : 'text-success'}`}>
              {pendingUpdates > 0 ? `🔄 ${pendingUpdates} da installare` : '✅ Aggiornato'}
            </span>
          </div>
        </div>
      </header>

      {/* PANNELLO RISORSE IN TEMPO REALE: CPU, RAM (Usata/Libera/Totale), HD (Usato/Libero/Totale) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card CPU */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Processore (CPU)</span>
                <h3 className="text-3xl font-black mt-1">{cpuPct.toFixed(1)}%</h3>
              </div>
              <span className="text-2xl bg-primary/15 border border-primary/30 p-2.5 rounded-2xl">⚙️</span>
            </div>
            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all ${
                  cpuPct > 85 ? 'bg-destructive' : cpuPct > 65 ? 'bg-warning' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(100, cpuPct)}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/10 text-xs">
            <div>
              <span className="text-muted-foreground block">Core Assegnati</span>
              <span className="font-bold text-white text-sm">{vm.cpus || 1} vCPU</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Margine Libero</span>
              <span className="font-bold text-success text-sm">{Math.max(0, 100 - cpuPct).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Card Memoria RAM */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Memoria RAM</span>
                <h3 className="text-3xl font-black mt-1">{ramPct.toFixed(1)}%</h3>
              </div>
              <span className="text-2xl bg-indigo-500/15 border border-indigo-500/30 p-2.5 rounded-2xl">🧠</span>
            </div>
            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all ${
                  ramPct > 88 ? 'bg-destructive' : ramPct > 75 ? 'bg-warning' : 'bg-indigo-400'
                }`}
                style={{ width: `${Math.min(100, ramPct)}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-xs">
            <div>
              <span className="text-muted-foreground block">In Uso</span>
              <span className="font-bold text-white text-sm">{formatGB(usedMem)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Libera</span>
              <span className="font-bold text-success text-sm">{formatGB(freeMem)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Totale</span>
              <span className="font-bold text-white/80 text-sm">{formatGB(maxMem)}</span>
            </div>
          </div>
        </div>

        {/* Card Hard Disk (HD) */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Spazio Disco (HD)</span>
                <h3 className="text-3xl font-black mt-1">{diskPct.toFixed(1)}%</h3>
              </div>
              <span className="text-2xl bg-emerald-500/15 border border-emerald-500/30 p-2.5 rounded-2xl">💾</span>
            </div>
            <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all ${
                  diskPct > 85 ? 'bg-destructive' : diskPct > 70 ? 'bg-warning' : 'bg-emerald-400'
                }`}
                style={{ width: `${Math.min(100, diskPct)}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-xs">
            <div>
              <span className="text-muted-foreground block">Occupato</span>
              <span className="font-bold text-white text-sm">{formatGB(usedDisk)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Libero</span>
              <span className="font-bold text-success text-sm">{formatGB(freeDisk)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Capacità</span>
              <span className="font-bold text-white/80 text-sm">{formatGB(maxDisk)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* SEZIONE DIAGNOSTICA: CONTROLLO DIFETTI, AGGIORNAMENTI, PROBLEMATICHE E SOLUZIONI */}
      <section className="glass-panel p-8 rounded-3xl border border-white/10 space-y-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-2 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              🩺 Controllo Difetti, Aggiornamenti & Soluzioni Guidate
            </h2>
            <p className="text-sm text-muted-foreground">
              Analisi automatica dello stato di salute della VM, pacchetti da aggiornare e procedure passo-passo per risolvere le anomalie.
            </p>
          </div>
          <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
            Guest Agent: {vm.agent_enabled ? '✅ Attivo' : '⚠️ Non rilevato'}
          </span>
        </div>

        {issues.length === 0 ? (
          <div className="p-8 rounded-2xl bg-success/10 border border-success/30 text-center space-y-2">
            <div className="text-4xl">✅</div>
            <h4 className="text-lg font-bold text-success">Nessun difetto o anomalia rilevata!</h4>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              La macchina virtuale ha spazio disco sufficiente, memoria RAM sotto controllo, backup regolari e nessun pacchetto critico in sospeso.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {issues.map((issue, idx) => {
              const isCrit = issue.severity === 'critical';
              const isWarn = issue.severity === 'warning';
              return (
                <div
                  key={idx}
                  className={`p-6 rounded-2xl border-l-4 bg-black/30 border border-white/10 ${
                    isCrit
                      ? 'border-l-destructive'
                      : isWarn
                      ? 'border-l-warning'
                      : 'border-l-primary'
                  }`}
                >
                  <div className="flex flex-col md:flex-row justify-between md:items-start gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${
                            isCrit
                              ? 'bg-destructive/20 text-destructive'
                              : isWarn
                              ? 'bg-warning/20 text-warning'
                              : 'bg-primary/20 text-primary'
                          }`}
                        >
                          {isCrit ? 'Critico' : isWarn ? 'Attenzione' : 'Manutenzione / Aggiornamenti'}
                        </span>
                      </div>
                      <h4 className="text-lg font-bold text-white">{issue.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
                    </div>

                    <form action={saveToKnowledgeBase}>
                      <input type="hidden" name="title" value={`${vm.name}: ${issue.title}`} />
                      <input type="hidden" name="description" value={issue.description} />
                      <input type="hidden" name="solution" value={issue.solution} />
                      <button
                        type="submit"
                        className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
                      >
                        📚 Salva in Knowledge Base
                      </button>
                    </form>
                  </div>

                  <div className="mt-4 bg-black/60 p-4 rounded-xl border border-white/5">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider block mb-2">
                      🛠️ Come risolvere (Comandi & Procedura):
                    </span>
                    <pre className="text-xs font-mono text-gray-200 whitespace-pre-wrap leading-relaxed">
                      {issue.solution}
                    </pre>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Box Ultimo Report AI se generato */}
        {latestVmAlert && latestVmAlert.ai_suggested_solution && (
          <div className="mt-6 p-6 rounded-2xl bg-primary/10 border border-primary/30 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-primary flex items-center gap-2">
                🤖 Ultima Diagnosi Approfondita AI ({new Date(latestVmAlert.created_at).toLocaleString()})
              </h4>
              <Link href="/alerts" className="text-xs text-primary hover:underline font-bold">
                Vai ai Ticket →
              </Link>
            </div>
            <pre className="text-xs font-sans text-gray-200 whitespace-pre-wrap bg-black/50 p-4 rounded-xl border border-white/5">
              {latestVmAlert.ai_suggested_solution}
            </pre>
          </div>
        )}
      </section>

      {/* STORICO CAMPIONAMENTI */}
      {metrics.length > 0 && (
        <section className="glass-panel p-8 rounded-3xl border border-white/10">
          <h3 className="text-xl font-bold mb-6">📈 Storico Ultimi {metrics.length} Campionamenti</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-white/10">
                  <th className="pb-3 pr-4">Data / Ora</th>
                  <th className="pb-3 pr-4">Risorsa</th>
                  <th className="pb-3">Utilizzo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {metrics.map((m: any) => (
                  <tr key={m.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          m.type === 'cpu'
                            ? 'bg-primary/20 text-primary'
                            : m.type === 'ram'
                            ? 'bg-indigo-500/20 text-indigo-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {String(m.type).toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono font-bold">{Number(m.value).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
