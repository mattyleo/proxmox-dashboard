import { supabaseAdmin as supabase } from '@/lib/supabase';
import Link from 'next/link';

export default async function CompanyDetailsPage({ params }: { params: { id: string } }) {
  console.log('=== DEBUG ===');
  console.log('params.id:', params.id);
  console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('SERVICE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('SERVICE_KEY length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length);

  // 1. Fetch Company
  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', params.id)
    .single();

  console.log('company:', company);
  console.log('error:', JSON.stringify(error));

  if (!company) {
    return <div className="p-10">Azienda non trovata. Errore: {JSON.stringify(error)}</div>;
  }

  // 2. Fetch Servers
  const { data: servers } = await supabase
    .from('servers')
    .select('*')
    .eq('company_id', company.id);

  // 3. Fetch VMs for these servers
  let vms: any[] = [];
  if (servers && servers.length > 0) {
    const serverIds = servers.map(s => s.id);
    const { data: vmsData } = await supabase
      .from('vms')
      .select('*')
      .in('server_id', serverIds);
    if (vmsData) vms = vmsData;
  }

  // Utility per formattare byte in GB
  const formatGB = (bytes: number) => bytes ? (bytes / (1024 ** 3)).toFixed(2) + ' GB' : 'N/A';

  return (
    <div className="p-10 w-full max-w-7xl mx-auto space-y-10 relative z-10">
      <header className="flex justify-between items-end border-b border-white/10 pb-6">
        <div>
          <Link href="/companies" className="text-sm font-medium text-primary hover:underline mb-2 inline-block">← Torna alle Aziende</Link>
          <h2 className="text-4xl font-black tracking-tight mb-2">{company.name}</h2>
          <p className="text-muted-foreground">{company.contact_email}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
           <div className="bg-black/50 p-3 rounded-lg border border-white/10 text-xs font-mono text-primary text-right">
             <span className="text-white/50 block mb-1">API Key Agent:</span>
             {company.api_key}
           </div>
        </div>
      </header>

      {/* Sezione Infrastruttura */}
      <div className="glass-panel p-6 rounded-3xl flex gap-6 items-center">
        <div className="flex-1 border-r border-white/10 pr-6">
           <h3 className="text-sm font-bold text-muted-foreground mb-1">Tipo Infrastruttura</h3>
           <p className="text-lg font-bold">Cluster PVE <span className="text-xs font-normal text-muted-foreground ml-2">(Rilevato)</span></p>
        </div>
        <div className="flex-1 border-r border-white/10 pr-6">
           <h3 className="text-sm font-bold text-muted-foreground mb-1">Sistema di Backup</h3>
           <p className="text-lg font-bold">Proxmox Backup Server (PBS)</p>
        </div>
        <div className="flex-1">
           <h3 className="text-sm font-bold text-muted-foreground mb-1">Stato Backup</h3>
           <p className="text-lg font-bold text-success flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-success"></span> Operativo (Ultimo check: 1h fa)</p>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-2xl font-bold">Nodi Proxmox & Virtual Machines</h3>
        
        {!servers || servers.length === 0 ? (
           <div className="glass-panel p-10 rounded-3xl text-center text-muted-foreground">
             Ancora nessun server ha inviato dati per questa azienda.
           </div>
        ) : (
          <div className="space-y-6">
            {servers.map((server: any) => {
              const serverVms = vms.filter(vm => vm.server_id === server.id);
              const runningVms = serverVms.filter(vm => vm.status === 'running').length;

              return (
                <div key={server.id} className="glass-panel rounded-3xl overflow-hidden border border-white/5">
                  <div className="p-6 bg-black/20 border-b border-white/5 relative">
                    <div className={`absolute top-0 left-0 w-full h-1 ${server.status === 'online' ? 'bg-success' : 'bg-destructive'}`}></div>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-2xl flex items-center gap-3">
                          🖥️ {server.hostname}
                          <span className={`text-xs font-bold px-2 py-1 rounded-md ${server.status === 'online' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                            {server.status.toUpperCase()}
                          </span>
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1">IP: {server.ip_address || 'Sconosciuto'} | Ultimo Contatto: {new Date(server.last_seen).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-6">
                      <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                        <span className="text-xs text-muted-foreground block mb-1">CPU Cores</span>
                        <span className="text-xl font-bold">{server.total_cpu || 'N/A'}</span>
                      </div>
                      <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                        <span className="text-xs text-muted-foreground block mb-1">RAM Totale</span>
                        <span className="text-xl font-bold">{formatGB(server.total_ram)}</span>
                      </div>
                      <div className="bg-black/30 p-4 rounded-xl border border-white/5">
                        <span className="text-xs text-muted-foreground block mb-1">Storage Totale</span>
                        <span className="text-xl font-bold">{formatGB(server.total_disk)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-card/10">
                    <h5 className="font-bold mb-4 text-sm text-muted-foreground">Macchine Virtuali ({runningVms} / {serverVms.length} in esecuzione)</h5>
                    {serverVms.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Nessuna VM rilevata su questo nodo.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {serverVms.map(vm => (
                          <div key={vm.id} className="p-3 rounded-lg border border-white/5 bg-black/40 flex justify-between items-center hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${vm.status === 'running' ? 'bg-success' : 'bg-muted'}`}></div>
                              <div>
                                <span className="font-bold text-sm block">{vm.name}</span>
                                <span className="text-xs text-muted-foreground font-mono">VMID: {vm.vmid}</span>
                              </div>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                               {vm.cpus} vCPU | {formatGB(vm.maxmem)} RAM
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
