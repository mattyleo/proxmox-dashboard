import { NextResponse } from 'next/server';
import pool, { queryOne, ensureSchema } from '@/lib/db';
import { suggestProxmoxSolution } from '@/lib/ai';

// Genera diagnostica automatica lato server se l'agente non l'ha già calcolata
function buildVmDiagnostics(vm: any) {
  if (Array.isArray(vm.health_issues) && vm.health_issues.length > 0) {
    return vm.health_issues;
  }

  const issues: Array<{ severity: string; title: string; description: string; solution: string }> = [];
  const status = vm.status || 'unknown';
  const vmid = vm.vmid;
  const name = vm.name || `VM-${vmid}`;
  const cpuUsage = Number(vm.cpu_usage || 0);
  const ramUsage = Number(vm.ram_usage || 0);
  const diskUsage = Number(vm.disk_usage || 0);
  const pendingUpdates = Number(vm.pending_updates || 0);
  const agentEnabled = Number(vm.agent_enabled || 0);

  if (status !== 'running') {
    issues.push({
      severity: 'warning',
      title: 'Macchina Virtuale Spenta',
      description: `La macchina "${name}" (VMID ${vmid}) risulta attualmente in stato "${status}".`,
      solution: `Se lo spegnimento non è voluto:\n1. Avviala da shell Proxmox: qm start ${vmid}\n2. Verifica eventuali errori di avvio o storage pieno con: journalctl -u pvedaemon -n 50`
    });
  }

  if (status === 'running' && !agentEnabled) {
    issues.push({
      severity: 'info',
      title: 'QEMU Guest Agent non rilevato',
      description: 'Il Guest Agent permette di leggere versione esatta del Sistema Operativo, IP interno e spazio disco reale.',
      solution: `1. In Proxmox GUI -> VM ${vmid} -> Options -> QEMU Guest Agent -> Imposta su Enabled.\n2. Dentro la VM Linux esegui:\n   sudo apt update && sudo apt install -y qemu-guest-agent && sudo systemctl enable --now qemu-guest-agent`
    });
  }

  if (diskUsage >= 85) {
    issues.push({
      severity: diskUsage >= 92 ? 'critical' : 'warning',
      title: `Spazio Disco in Esaurimento (${diskUsage.toFixed(1)}%)`,
      description: `L'hard disk virtuale è occupato al ${diskUsage.toFixed(1)}%. Rischio blocco del sistema operativo o corruzione database.`,
      solution: `1. Pulisci cache e log interni alla VM:\n   sudo apt clean && sudo journalctl --vacuum-time=7d\n2. Per espandere il disco da Proxmox senza spegnere la VM:\n   qm resize ${vmid} scsi0 +20G`
    });
  }

  if (ramUsage >= 88) {
    issues.push({
      severity: ramUsage >= 95 ? 'critical' : 'warning',
      title: `Utilizzo RAM Critico (${ramUsage.toFixed(1)}%)`,
      description: `La memoria RAM in uso ha raggiunto il ${ramUsage.toFixed(1)}% del totale allocato.`,
      solution: `1. Individua i processi che consumano più RAM dentro la VM:\n   ps aux --sort=-%mem | head -n 10\n2. Aumenta la RAM allocata da Proxmox:\n   qm set ${vmid} -memory ${Math.round(Number(vm.maxmem || 4294967296) / (1024 * 1024)) + 2048}`
    });
  }

  if (cpuUsage >= 85) {
    issues.push({
      severity: 'warning',
      title: `Carico CPU Elevato (${cpuUsage.toFixed(1)}%)`,
      description: `La CPU della VM lavora costantemente sopra la soglia dell'85%.`,
      solution: `1. Controlla i processi attivi nella VM con 'top' o 'htop'.\n2. Valuta l'aumento dei core vCPU:\n   qm set ${vmid} -cores ${(Number(vm.cpus) || 2) + 2}`
    });
  }

  if (pendingUpdates > 0) {
    issues.push({
      severity: 'info',
      title: `${pendingUpdates} Aggiornamenti di Sistema da Installare`,
      description: `Sono presenti ${pendingUpdates} pacchetti di sistema o sicurezza non ancora aggiornati.`,
      solution: `Esegui uno snapshot preventivo su Proxmox e poi aggiorna la macchina:\nsudo apt update && sudo apt upgrade -y`
    });
  }

  return issues;
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const data = await request.json();
    const {
      api_key, hostname, ip_address, os_version, node_type, pbs_info, status,
      ram_usage_percent, cpu_usage_percent, disk_usage_percent,
      vms, total_ram, used_ram, total_cpu, total_disk, used_disk, pending_updates
    } = data;

    if (!api_key) return NextResponse.json({ error: 'Missing api_key' }, { status: 401 });

    // 1. Verifica azienda tramite API key
    const company = await queryOne('SELECT * FROM companies WHERE api_key = ?', [api_key]);
    if (!company) return NextResponse.json({ error: 'Invalid api_key' }, { status: 401 });

    const calcUsedRam = used_ram ?? (total_ram && ram_usage_percent ? Math.round((total_ram * ram_usage_percent) / 100) : null);
    const calcUsedDisk = used_disk ?? (total_disk && disk_usage_percent ? Math.round((total_disk * disk_usage_percent) / 100) : null);
    const pbsInfoJson = pbs_info ? JSON.stringify(pbs_info) : null;

    // 2. Trova o crea server (upsert)
    let server = await queryOne(
      'SELECT * FROM servers WHERE company_id = ? AND hostname = ?',
      [company.id, hostname]
    );

    if (server) {
      await pool.execute(
        `UPDATE servers SET 
          status=?, ip_address=COALESCE(?, ip_address), os_version=COALESCE(?, os_version),
          node_type=COALESCE(?, node_type), pbs_info=COALESCE(?, pbs_info),
          last_seen=NOW(), total_ram=?, used_ram=?, total_cpu=?, cpu_usage=?, total_disk=?, used_disk=?, pending_updates=?
         WHERE id=?`,
        [
          status || 'online',
          ip_address ?? null,
          os_version ?? null,
          node_type ?? 'pve',
          pbsInfoJson,
          total_ram ?? null,
          calcUsedRam,
          total_cpu ?? null,
          cpu_usage_percent ?? 0,
          total_disk ?? null,
          calcUsedDisk,
          pending_updates ?? 0,
          server.id
        ]
      );
    } else {
      await pool.execute(
        `INSERT INTO servers 
          (id, company_id, hostname, ip_address, os_version, node_type, pbs_info, status, last_seen, total_ram, used_ram, total_cpu, cpu_usage, total_disk, used_disk, pending_updates)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
        [
          company.id,
          hostname,
          ip_address ?? null,
          os_version ?? 'Proxmox VE',
          node_type ?? 'pve',
          pbsInfoJson,
          status || 'online',
          total_ram ?? null,
          calcUsedRam,
          total_cpu ?? null,
          cpu_usage_percent ?? 0,
          total_disk ?? null,
          calcUsedDisk,
          pending_updates ?? 0
        ]
      );
      server = await queryOne(
        'SELECT * FROM servers WHERE company_id = ? AND hostname = ?',
        [company.id, hostname]
      );
    }

    const serverId = server.id;

    // 3. Salva metriche nodo
    await pool.execute(
      'INSERT INTO metrics (id, server_id, type, value) VALUES (UUID(),?,?,?),(UUID(),?,?,?),(UUID(),?,?,?)',
      [
        serverId, 'cpu', cpu_usage_percent ?? 0,
        serverId, 'ram', ram_usage_percent ?? 0,
        serverId, 'disk', disk_usage_percent ?? 0,
      ]
    );

    // 4. Aggiorna VM con telemetria profonda e diagnostica
    if (vms && Array.isArray(vms)) {
      for (const vmData of vms) {
        const {
          vmid, name, vm_type, status: vmStatus, os_info, ip_address: vmIp,
          uptime, maxmem, mem_used, cpus, maxdisk, disk_used,
          cpu_usage, ram_usage, disk_usage, agent_enabled,
          pending_updates: vmUpdates, last_backup
        } = vmData;

        const calcMemUsed = mem_used ?? (maxmem && ram_usage ? Math.round((maxmem * ram_usage) / 100) : 0);
        const calcRamUsage = ram_usage ?? (maxmem && calcMemUsed ? Number(((100 * calcMemUsed) / maxmem).toFixed(1)) : 0);
        const calcDiskUsed = disk_used ?? (maxdisk && disk_usage ? Math.round((maxdisk * disk_usage) / 100) : 0);
        const calcDiskUsage = disk_usage ?? (maxdisk && calcDiskUsed ? Number(((100 * calcDiskUsed) / maxdisk).toFixed(1)) : 0);

        const issues = buildVmDiagnostics({
          ...vmData,
          ram_usage: calcRamUsage,
          disk_usage: calcDiskUsage,
        });
        const healthIssuesJson = JSON.stringify(issues);

        const existingVm = await queryOne(
          'SELECT * FROM vms WHERE server_id = ? AND vmid = ?',
          [serverId, vmid]
        );

        let targetVmId = existingVm?.id;

        if (existingVm) {
          await pool.execute(
            `UPDATE vms SET 
              name=?, vm_type=?, status=?, os_info=?, ip_address=?, uptime=?,
              maxmem=?, mem_used=?, cpus=?, maxdisk=?, disk_used=?,
              cpu_usage=?, ram_usage=?, disk_usage=?, agent_enabled=?,
              pending_updates=?, last_backup=?, health_issues=?, last_seen=NOW()
             WHERE id=?`,
            [
              name,
              vm_type || 'qemu',
              vmStatus,
              os_info || 'Linux / Proxmox Guest',
              vmIp || null,
              uptime ?? 0,
              maxmem ?? null,
              calcMemUsed,
              cpus ?? null,
              maxdisk ?? null,
              calcDiskUsed,
              cpu_usage ?? 0,
              calcRamUsage,
              calcDiskUsage,
              agent_enabled ? 1 : 0,
              vmUpdates ?? 0,
              last_backup || 'Non rilevato',
              healthIssuesJson,
              existingVm.id
            ]
          );
        } else {
          await pool.execute(
            `INSERT INTO vms 
              (id, server_id, vmid, name, vm_type, status, os_info, ip_address, uptime, maxmem, mem_used, cpus, maxdisk, disk_used, cpu_usage, ram_usage, disk_usage, agent_enabled, pending_updates, last_backup, health_issues, last_seen)
             VALUES (UUID(),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
            [
              serverId,
              vmid,
              name,
              vm_type || 'qemu',
              vmStatus,
              os_info || 'Linux / Proxmox Guest',
              vmIp || null,
              uptime ?? 0,
              maxmem ?? null,
              calcMemUsed,
              cpus ?? null,
              maxdisk ?? null,
              calcDiskUsed,
              cpu_usage ?? 0,
              calcRamUsage,
              calcDiskUsage,
              agent_enabled ? 1 : 0,
              vmUpdates ?? 0,
              last_backup || 'Non rilevato',
              healthIssuesJson
            ]
          );
          const newVm = await queryOne('SELECT id FROM vms WHERE server_id=? AND vmid=?', [serverId, vmid]);
          targetVmId = newVm?.id;
        }

        if (targetVmId) {
          if (cpu_usage != null) await pool.execute('INSERT INTO metrics (id, vm_id, type, value) VALUES (UUID(),?,?,?)', [targetVmId, 'cpu', cpu_usage]);
          if (calcRamUsage != null) await pool.execute('INSERT INTO metrics (id, vm_id, type, value) VALUES (UUID(),?,?,?)', [targetVmId, 'ram', calcRamUsage]);
          if (calcDiskUsage != null) await pool.execute('INSERT INTO metrics (id, vm_id, type, value) VALUES (UUID(),?,?,?)', [targetVmId, 'disk', calcDiskUsage]);
        }
      }
    }

    // 5. Alert automatico se risorse critiche sul nodo
    if ((ram_usage_percent && ram_usage_percent > 90) || (disk_usage_percent && disk_usage_percent > 90) || status !== 'online') {
      const existingAlert = await queryOne(
        'SELECT id FROM alerts WHERE server_id = ? AND status = ?',
        [serverId, 'open']
      );
      if (!existingAlert) {
        const title = status !== 'online' ? `Nodo ${hostname} Down` : `Risorse Critiche su ${hostname}`;
        const desc = `Status: ${status} | RAM: ${ram_usage_percent}% | Disco: ${disk_usage_percent}% | CPU: ${cpu_usage_percent}%`;
        const aiSolution = await suggestProxmoxSolution(title, desc, `Nodo ${hostname}`);
        await pool.execute(
          'INSERT INTO alerts (id, company_id, server_id, title, description, severity, status, ai_suggested_solution) VALUES (UUID(),?,?,?,?,?,?,?)',
          [company.id, serverId, title, desc, 'critical', 'open', aiSolution]
        );
      }
    }

    return NextResponse.json({ success: true, server_id: serverId });
  } catch (err: any) {
    console.error('Ingest Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
