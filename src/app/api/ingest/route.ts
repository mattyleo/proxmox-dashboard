import { NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { suggestProxmoxSolution } from '@/lib/ai';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { api_key, hostname, status, ram_usage_percent, cpu_usage_percent, disk_usage_percent, vms, total_ram, total_cpu, total_disk } = data;

    if (!api_key) {
      return NextResponse.json({ error: 'Missing api_key' }, { status: 401 });
    }

    // 1. Verifica l'azienda tramite API_KEY
    const { data: company, error: compError } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('api_key', api_key)
      .single();

    if (compError || !company) {
      return NextResponse.json({ error: 'Invalid api_key' }, { status: 401 });
    }

    // 2. Trova o Crea il Server in questione
    let serverId;
    const { data: existingServer } = await supabase
      .from('servers')
      .select('id')
      .eq('company_id', company.id)
      .eq('hostname', hostname)
      .single();

    if (existingServer) {
      serverId = existingServer.id;
      // Aggiorna lo stato, metriche totali e il last_seen
      await supabaseAdmin.from('servers').update({ 
        status, 
        last_seen: new Date(),
        total_ram,
        total_cpu,
        total_disk
      }).eq('id', serverId);
    } else {
      const { data: newServer } = await supabaseAdmin
        .from('servers')
        .insert([{ 
          company_id: company.id, 
          hostname, 
          status, 
          last_seen: new Date(),
          total_ram,
          total_cpu,
          total_disk
        }])
        .select()
        .single();
      serverId = newServer?.id;
    }

    if (!serverId) throw new Error('Errore gestione server');

    // 3. Salvataggio Metriche Base Nodo
    await supabaseAdmin.from('metrics').insert([
      { server_id: serverId, type: 'cpu', value: cpu_usage_percent },
      { server_id: serverId, type: 'ram', value: ram_usage_percent },
      { server_id: serverId, type: 'disk', value: disk_usage_percent }
    ]);

    // 4. Analisi Anomalie ed Eventuale Alerting con IA
    // Esempio: Se la RAM o DISCO supera il 90%, generiamo un alert se non ce n'è uno già aperto
    if (ram_usage_percent > 90 || disk_usage_percent > 90 || status !== 'online') {
      
      const alertTitle = status !== 'online' ? `Nodo ${hostname} Down` : `Risorse Critiche su ${hostname}`;
      const alertDesc = `Il nodo ha riportato i seguenti valori: Status: ${status}, RAM: ${ram_usage_percent}%, Dischi: ${disk_usage_percent}%. `;

      // Controllo per non duplicare alert identici aperti
      const { data: existingAlerts } = await supabase
        .from('alerts')
        .select('id')
        .eq('server_id', serverId)
        .eq('status', 'open')
        .limit(1);

      if (!existingAlerts || existingAlerts.length === 0) {
        // Nessun alert aperto, procediamo a elaborare la soluzione IA
        const aiSolution = await suggestProxmoxSolution(
          alertTitle, 
          alertDesc, 
          `Nodo ${hostname} con risorse critiche (CPU: ${cpu_usage_percent}%). Macchine virtuali ospitate: ${vms?.length || 0}`
        );

        // Salviamo l'Allarme nel DB
        await supabaseAdmin.from('alerts').insert([{
          company_id: company.id,
          server_id: serverId,
          title: alertTitle,
          description: alertDesc,
          severity: 'high',
          status: 'open',
          ai_suggested_solution: aiSolution
        }]);
      }
    }

    // 5. Mappare le VM passate in array 'vms'
    if (vms && Array.isArray(vms)) {
      // Elimina le vecchie VM per questo server che non sono in questo batch (o meglio fare un upsert)
      for (const vm of vms) {
        const { vmid, name, status: vmStatus, maxmem, cpus, maxdisk } = vm;
        
        const { data: existingVm } = await supabaseAdmin
          .from('vms')
          .select('id')
          .eq('server_id', serverId)
          .eq('vmid', vmid)
          .single();

        if (existingVm) {
          await supabaseAdmin.from('vms').update({
            name, status: vmStatus, maxmem, cpus, maxdisk, last_seen: new Date()
          }).eq('id', existingVm.id);
        } else {
          await supabaseAdmin.from('vms').insert([{
            server_id: serverId, vmid, name, status: vmStatus, maxmem, cpus, maxdisk, last_seen: new Date()
          }]);
        }
      }
    }

    return NextResponse.json({ success: true, server_id: serverId });

  } catch (err: any) {
    console.error('Ingest Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
