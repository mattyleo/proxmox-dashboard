import pool, { query, getAppSettings } from '@/lib/db';
import { getCurrentUser, canDeployAgents } from '@/lib/auth';
import CompanyHealthCharts, { CompanyHealthItem } from '@/components/CompanyHealthCharts';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';

export default async function Home() {
  const [settings, user] = await Promise.all([getAppSettings(), getCurrentUser()]);
  const canDeploy = canDeployAgents(user);

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

    // Controlla anomalie sui nodi
    for (const srv of compServers) {
      if (srv.status !== 'online') {
        issuesCount++;
        criticalCount++;
        penaltyPercent += 25;
        topIssues.push(`Nodo ${srv.hostname} Offline`);
      }
    }

    // Controlla anomalie e difetti sulle VM
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

    // Aggiungi eventuali alert aperti non già contati
    for (const al of compAlerts) {
      issuesCount++;
      penaltyPercent += 10;
      if (!topIssues.includes(al.title)) {
        topIssues.push(al.title);
      }
    }

    // Se ci sono problematiche, minimo 10% di penalità come richiesto
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

  // Server action per popolare 3 aziende di test e vedere subito i grafici a Pizza e Rettangoli
  async function seedDemoCompanies() {
    'use server';
    const demoCompanies = [
      {
        name: 'GM-SYSTEM Sede Centrale',
        email: 'it@gm-system.it',
        hostname: 'pve-gmsystem-dl380',
        vms: [
          {
            vmid: 100,
            name: 'srv-erp-produzione',
            status: 'running',
            os_info: 'Ubuntu 24.04 LTS',
            ip: '192.168.1.100',
            cpus: 8,
            cpu_usage: 24.0,
            maxmem: 34359738368,
            mem_used: 12884901888,
            ram_usage: 37.5,
            maxdisk: 214748364800,
            disk_used: 85899345920,
            disk_usage: 40.0,
            pending_updates: 0,
            last_backup: 'OK (PBS)',
            issues: [],
          },
        ],
      },
      {
        name: 'Officine Meccaniche Rossi Srl',
        email: 'admin@officinerossi.it',
        hostname: 'pve-rossi-01',
        vms: [
          {
            vmid: 101,
            name: 'vm-gestionale-sql',
            status: 'running',
            os_info: 'Ubuntu 22.04 LTS',
            ip: '192.168.20.10',
            cpus: 4,
            cpu_usage: 45.0,
            maxmem: 17179869184,
            mem_used: 15461882265,
            ram_usage: 90.0,
            maxdisk: 107374182400,
            disk_used: 94489280512,
            disk_usage: 88.0,
            pending_updates: 12,
            last_backup: 'OK (Ieri)',
            issues: [
              {
                severity: 'warning',
                title: 'Spazio Disco in Esaurimento (88%)',
                description: 'Rimangono solo 12 GB liberi su 100 GB.',
                solution: 'Esegui pulizia log: sudo journalctl --vacuum-time=7d oppure espandi con: qm resize 101 scsi0 +20G',
              },
              {
                severity: 'warning',
                title: 'RAM Quasi Piena (90%)',
                description: '14.4 GB in uso su 16 GB.',
                solution: 'Aumenta la RAM da Proxmox: qm set 101 -memory 24576',
              },
            ],
          },
        ],
      },
      {
        name: 'Logistica Emiliana SpA',
        email: 'ced@logisticaemiliana.it',
        hostname: 'pve-logistica-cluster',
        vms: [
          {
            vmid: 201,
            name: 'win-dc-active-directory',
            status: 'running',
            os_info: 'Windows Server 2022',
            ip: '10.0.10.5',
            cpus: 4,
            cpu_usage: 89.0,
            maxmem: 17179869184,
            mem_used: 16106127360,
            ram_usage: 93.7,
            maxdisk: 161061273600,
            disk_used: 151397597184,
            disk_usage: 94.0,
            pending_updates: 8,
            last_backup: 'ERRORE (Timeout PBS)',
            issues: [
              {
                severity: 'critical',
                title: 'Disco Critico al 94% (Solo 9 GB liberi)',
                description: 'Partizione C: quasi satura sul Domain Controller.',
                solution: 'Espandi disco su Proxmox: qm resize 201 scsi0 +50G e poi estendi volume da Gestione Disco Windows.',
              },
              {
                severity: 'critical',
                title: 'Backup PBS Fallito (Timeout VSS)',
                description: 'Il backup notturno verso Proxmox Backup Server è fallito.',
                solution: 'Riavvia il servizio VSS su Windows e lancia: vzdump 201 --mode snapshot --compress zstd',
              },
            ],
          },
        ],
      },
    ];

    for (const dc of demoCompanies) {
      await pool.execute(
        'INSERT INTO companies (id, name, contact_email, api_key) VALUES (UUID(), ?, ?, UUID())',
        [dc.name, dc.email]
      );
      const createdComp = await query<{ id: string }>(
        'SELECT id FROM companies WHERE name = ? ORDER BY created_at DESC LIMIT 1',
        [dc.name]
      );
      const compId = createdComp[0]?.id;
      if (!compId) continue;

      await pool.execute(
        `INSERT INTO servers (id, company_id, hostname, ip_address, os_version, node_type, status, last_seen, total_ram, used_ram, total_cpu, cpu_usage, total_disk, used_disk)
         VALUES (UUID(), ?, ?, '192.168.10.20', 'Proxmox VE 8.2', 'pve', 'online', NOW(), 68719476736, 34359738368, 16, 28.0, 1099511627776, 549755813888)`,
        [compId, dc.hostname]
      );
      const createdSrv = await query<{ id: string }>(
        'SELECT id FROM servers WHERE company_id = ? LIMIT 1',
        [compId]
      );
      const srvId = createdSrv[0]?.id;
      if (!srvId) continue;

      for (const v of dc.vms) {
        await pool.execute(
          `INSERT INTO vms (id, server_id, vmid, name, vm_type, status, os_info, ip_address, uptime, cpus, cpu_usage, maxmem, mem_used, ram_usage, maxdisk, disk_used, disk_usage, agent_enabled, pending_updates, last_backup, health_issues, last_seen)
           VALUES (UUID(), ?, ?, ?, 'qemu', ?, ?, ?, 864000, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NOW())`,
          [
            srvId,
            v.vmid,
            v.name,
            v.status,
            v.os_info,
            v.ip,
            v.cpus,
            v.cpu_usage,
            v.maxmem,
            v.mem_used,
            v.ram_usage,
            v.maxdisk,
            v.disk_used,
            v.disk_usage,
            v.pending_updates,
            v.last_backup,
            JSON.stringify(v.issues),
          ]
        );
      }
    }

    revalidatePath('/');
    revalidatePath('/companies');
  }

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

          <div className="flex items-center gap-2">
            {canDeploy && companiesList.length === 0 && (
              <form action={seedDemoCompanies}>
                <button
                  type="submit"
                  className="text-xs bg-primary hover:bg-orange-500 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-primary/25 transition-all cursor-pointer"
                >
                  ⚡ Carica 3 Aziende Demo per Grafici
                </button>
              </form>
            )}
            <Link
              href="/settings"
              className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2.5 rounded-xl font-semibold text-muted-foreground hover:text-white transition-colors"
            >
              ⚙️ Impostazioni
            </Link>
          </div>
        </header>

        {/* CHARTS INTERATTIVI: PIZZA + RETTANGOLI PER AZIENDE */}
        {companyHealthData.length > 0 ? (
          <CompanyHealthCharts companies={companyHealthData} />
        ) : (
          <div className="glass-panel p-8 rounded-3xl border border-primary/30 text-center space-y-4">
            <div className="text-4xl">📊</div>
            <h3 className="text-xl font-bold">Grafici Salute Aziende (Pizza & Rettangoli)</h3>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Non ci sono ancora aziende nel database. Clicca sul pulsante qui sotto per generare subito 3 aziende di esempio (una al <strong>100% OK</strong>, una con <strong>20% problematiche</strong> e una con <strong>40% problematiche critiche</strong>) e testare i grafici interattivi!
            </p>
            {canDeploy && (
              <form action={seedDemoCompanies}>
                <button
                  type="submit"
                  className="bg-primary hover:bg-orange-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-primary/25 transition-all cursor-pointer"
                >
                  ⚡ Genera Subito Grafici & Aziende Demo
                </button>
              </form>
            )}
          </div>
        )}

        {/* Contatori Rapidi */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-panel glass-panel-hover p-6 rounded-2xl relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/20 rounded-full blur-2xl"></div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Aziende Collegate</h3>
            <div className="text-5xl font-black">{totalCompanies}</div>
            <p className="text-xs text-success font-medium mt-2">Database MySQL Locale ✅</p>
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
