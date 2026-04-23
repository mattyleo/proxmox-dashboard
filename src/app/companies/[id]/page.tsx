import { supabaseAdmin as supabase } from '@/lib/supabase';
import Link from 'next/link';

export default async function CompanyDetailsPage(props: any) {
  const params = await props.params;
  const id = params?.id;

  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single();

  if (!company) {
    return <div className="p-10">Azienda non trovata. Errore: {JSON.stringify(error)}</div>;
  }

  const { data: servers } = await supabase
    .from('servers')
    .select('*')
    .eq('company_id', company.id)
    .order('last_seen', { ascending: false });

  let vms: any[] = [];
  if (servers && servers.length > 0) {
    const serverIds = servers.map(s => s.id);
    const { data: vmsData } = await supabase
      .from('vms')
      .select('*')
      .in('server_id', serverIds);
    if (vmsData) vms = vmsData;
  }

  const formatGB = (bytes: number) => bytes ? (bytes / (1024 ** 3)).toFixed(2) + ' GB' : 'N/A';

  const UsageBar = ({ label, percent, color }: { label: string; percent: number | null; color: string }) => {
    const val = percent ?? 0;
    const barColor = val > 90 ? 'bg-red-500' : val > 70 ? 'bg-yellow-500' : color;
    return (
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{label}</span>
          <span className={val > 90 ? 'text-red-400 font-bold' : val > 70 ? 'text-yellow-400' : 'text-white'}>
            {percent !== null && percent !== undefined ? `${val}%` : 'N/A'}
          </span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(val, 100)}%` }} />
        </div>
      </div>
    );
  };

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
                    <div className={`absolute top-0 left-0 w-full h-1 ${server.status === 'online' ? 'bg-success' : 'bg-destructive'}`} />
                    
                    {/* Header nodo */}
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h4 className="font-bold text-2xl flex items-center gap-3">
                          🖥️ {server.hostname}
                          <span className={`text-xs font-bold px-2 py-1 rounded-md ${server.status === 'online' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                            {server.status.toUpperCase()}
                          </span>
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Ultimo Contatto: {new Date(server.last_seen).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{server.total_cpu} CPU cores</div>
                        <div>{formatGB(server.total_ram)} RAM</div>
                        <div>{formatGB(server.total_disk)} Disco</div>
                      </div>
                    </div>

                    {/* Barre utilizzo */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-2">
                        <UsageBar label="CPU" percent={server.cpu_usage_percent} color="bg-blue-500" />
                      </div>
                      <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-2">
                        <UsageBar label="RAM" percent={server.ram_usage_percent} color="bg-purple-500" />
                        <p className="text-xs text-muted-foreground">{formatGB(server.total_ram)} totali</p>
                      </div>
                      <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-2">
                        <UsageBar label="Disco" percent={server.disk_usage_percent} color="bg-orange-500" />
                        <p className="text-xs text-muted-foreground">{formatGB(server.total_disk)} totali</p>
                      </div>
                    </div>
                  </div>

                  {/* Lista VM */}
                  <div className="p-6 bg-card/10">
                    <h5 className="font-bold mb-4 text-sm text-muted-foreground">
                      Macchine Virtuali ({runningVms} / {serverVms.length} in esecuzione)
                    </h5>
                    {serverVms.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">Nessuna VM rilevata su questo nodo.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {serverVms.map(vm => (
                          <div key={vm.id} className="p-4 rounded-lg border border-white/5 bg-black/40 hover:bg-white/5 transition-colors">
                            <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${vm.status === 'running' ? 'bg-success' : 'bg-muted'}`} />
                                <div>
                                  <span className="font-bold text-sm block">{vm.name}</span>
                                  <span className="text-xs text-muted-foreground font-mono">VMID: {vm.vmid}</span>
                                </div>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded-md font-bold ${vm.status === 'running' ? 'bg-success/20 text-success' : 'bg-white/10 text-muted-foreground'}`}>
                                {vm.status?.toUpperCase()}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-muted-foreground">
                              <div className="bg-black/30 p-2 rounded-lg text-center">
                                <div className="font-bold text-white">{vm.cpus}</div>
                                <div>vCPU</div>
                              </div>
                              <div className="bg-black/30 p-2 rounded-lg text-center">
                                <div className="font-bold text-white">{formatGB(vm.maxmem)}</div>
                                <div>RAM</div>
                              </div>
                              <div className="bg-black/30 p-2 rounded-lg text-center">
                                <div className="font-bold text-white">{formatGB(vm.maxdisk)}</div>
                                <div>Disco</div>
                              </div>
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
