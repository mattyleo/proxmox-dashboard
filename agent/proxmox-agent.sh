#!/bin/bash
# ============================================================
# ProxmoxAI Agent v4 - Auto-Detection PVE + PBS (Proxmox Backup Server)
# ============================================================
# COME FUNZIONA CON IL PBS (PROXMOX BACKUP SERVER):
#   1. RICONOSCIMENTO AUTOMATICO DAL NODO PVE:
#      Installando questo agente sul nodo Proxmox VE, lo script legge in
#      automatico gli storage configurati (/nodes/<nodo>/storage) e rileva
#      da solo il Proxmox Backup Server (PBS) collegato, l'IP del PBS,
#      il Datastore, lo spazio occupato/libero sul PBS e l'esito dei backup!
#   2. INSTALLAZIONE DIRETTA SUL PBS (OPZIONALE):
#      Se vuoi monitorare anche CPU/RAM/Aggiornamenti della macchina PBS
#      stessa, puoi mettere questo STESSO script anche sul PBS: riconosce
#      da solo `proxmox-backup-manager`!
# ============================================================

# URL della tua dashboard (es. http://192.168.1.100:3000/api/ingest)
API_URL="http://INSERISCI_IP_DASHBOARD:3000/api/ingest"

# API Key dell'azienda (visibile nella pagina Aziende della dashboard)
API_KEY="INSERISCI_QUI_LA_API_KEY_AZIENDALE"

# ============================================================
# RACCOLTA DATI NODO, PBS E MACCHINE VIRTUALI (QEMU + LXC)
# ============================================================

if ! command -v python3 &> /dev/null; then
    echo "Errore: python3 non trovato."
    exit 1
fi

JSON_PAYLOAD=$(python3 - "$API_KEY" << 'EOF'
import subprocess, json, sys, socket, os, shutil

api_key = sys.argv[1]
hostname = socket.gethostname()

def run_cmd(cmd, timeout=8):
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=timeout)
        return out.decode('utf-8', errors='ignore').strip()
    except Exception:
        return ""

def pvesh_get(path, timeout=8):
    out = run_cmd(['pvesh', 'get', path, '--output-format', 'json'], timeout=timeout)
    if not out:
        return None
    try:
        return json.loads(out)
    except Exception:
        return None

# Determina automaticamente se siamo su un nodo PVE o su un server PBS dedicato
is_pve = shutil.which('pvesh') is not None
is_pbs_host = (not is_pve) and (shutil.which('proxmox-backup-manager') is not None)
node_type = 'pbs' if is_pbs_host else 'pve'

# 1. Info Nodo
ip_address = run_cmd(['hostname', '-I']).split(' ')[0] if run_cmd(['hostname', '-I']) else ''
if is_pve:
    os_version = run_cmd(['pveversion']) or 'Proxmox VE'
elif is_pbs_host:
    os_version = run_cmd(['proxmox-backup-manager', 'versions']) or 'Proxmox Backup Server (PBS)'
else:
    os_version = 'Linux Server'

# RAM Nodo
mem_total = 0
mem_available = 0
try:
    with open('/proc/meminfo') as f:
        for line in f:
            if line.startswith('MemTotal:'):
                mem_total = int(line.split()[1]) * 1024
            elif line.startswith('MemAvailable:'):
                mem_available = int(line.split()[1]) * 1024
except Exception:
    pass
mem_used_node = max(0, mem_total - mem_available)
ram_pct_node = round(100.0 * mem_used_node / mem_total, 1) if mem_total > 0 else 0.0

# CPU Nodo
cpu_total = os.cpu_count() or 1
cpu_pct_node = 0.0
if is_pve:
    node_status = pvesh_get(f'/nodes/{hostname}/status')
    if isinstance(node_status, dict):
        cpu_pct_node = round(float(node_status.get('cpu', 0)) * 100.0, 1)

# Disco Nodo (Root /)
disk_total = 0
disk_used_node = 0
disk_pct_node = 0.0
try:
    st = os.statvfs('/')
    disk_total = st.f_blocks * st.f_frsize
    disk_free = st.f_bavail * st.f_frsize
    disk_used_node = disk_total - disk_free
    disk_pct_node = round(100.0 * disk_used_node / disk_total, 1) if disk_total > 0 else 0.0
except Exception:
    pass

# Aggiornamenti APT in sospeso sul nodo
node_updates_out = run_cmd(['bash', '-c', 'apt-get -s upgrade 2>/dev/null | grep -P "^\\d+ upgraded" | awk \'{print $1}\''])
node_pending_updates = int(node_updates_out) if node_updates_out.isdigit() else 0

# ============================================================
# 2. RILEVAMENTO AUTOMATICO PBS (PROXMOX BACKUP SERVER) E STORAGE BACKUP
# ============================================================
pbs_storages = []

if is_pve:
    # Legge la configurazione globale degli storage (per vedere IP/datastore del PBS)
    storage_cfg_list = pvesh_get('/storage') or []
    storage_cfg_map = {}
    if isinstance(storage_cfg_list, list):
        for sc in storage_cfg_list:
            if isinstance(sc, dict) and sc.get('storage'):
                storage_cfg_map[sc['storage']] = sc

    # Legge lo stato real-time degli storage sul nodo (spazio totale, usato, libero, attivo)
    node_storages = pvesh_get(f'/nodes/{hostname}/storage') or []
    if isinstance(node_storages, list):
        for st_item in node_storages:
            if not isinstance(st_item, dict):
                continue
            st_name = st_item.get('storage', '')
            st_type = st_item.get('type', '')
            st_content = st_item.get('content', '')
            # Rileva tutti gli storage di tipo 'pbs' oppure storage usati per 'backup'
            if st_type == 'pbs' or 'backup' in str(st_content):
                cfg = storage_cfg_map.get(st_name, {})
                pbs_storages.append({
                    'name': st_name,
                    'type': 'PBS (Proxmox Backup Server)' if st_type == 'pbs' else f'Backup Storage ({st_type.upper()})',
                    'server': cfg.get('server', 'Locale / Integrato'),
                    'datastore': cfg.get('datastore', st_name),
                    'active': bool(st_item.get('active', 0)),
                    'total_bytes': int(st_item.get('total') or 0),
                    'used_bytes': int(st_item.get('used') or 0),
                    'avail_bytes': int(st_item.get('avail') or 0),
                })

elif is_pbs_host:
    # Se lo script gira direttamente sulla macchina PBS
    ds_out = run_cmd(['proxmox-backup-manager', 'datastore', 'list', '--output-format', 'json'])
    try:
        ds_list = json.loads(ds_out) if ds_out else []
    except Exception:
        ds_list = []
    for ds in ds_list:
        ds_name = ds.get('name', 'datastore')
        ds_path = ds.get('path', '/')
        t_bytes, u_bytes, a_bytes = 0, 0, 0
        try:
            vfs = os.statvfs(ds_path)
            t_bytes = vfs.f_blocks * vfs.f_frsize
            a_bytes = vfs.f_bavail * vfs.f_frsize
            u_bytes = t_bytes - a_bytes
        except Exception:
            pass
        pbs_storages.append({
            'name': ds_name,
            'type': 'PBS Datastore Nativo',
            'server': ip_address or hostname,
            'datastore': ds_name,
            'active': True,
            'total_bytes': t_bytes,
            'used_bytes': u_bytes,
            'avail_bytes': a_bytes,
        })

# Mappa ultimi backup dal task log di Proxmox
recent_tasks = pvesh_get(f'/nodes/{hostname}/tasks') if is_pve else []
backup_map = {}
if isinstance(recent_tasks, list):
    for t in recent_tasks:
        if t.get('type') == 'vzdump':
            vmid_str = str(t.get('id', ''))
            status_str = t.get('status', 'UNKNOWN')
            if vmid_str and vmid_str not in backup_map:
                backup_map[vmid_str] = 'OK' if status_str == 'OK' else f'ERRORE ({status_str})'

OSTYPE_LABELS = {
    'l26': 'Linux 2.6 - 6.x Kernel',
    'l24': 'Linux 2.4 Kernel',
    'win11': 'Microsoft Windows 11 / Server 2022',
    'win10': 'Microsoft Windows 10 / Server 2016-2019',
    'win8': 'Microsoft Windows 8 / Server 2012',
    'win7': 'Microsoft Windows 7 / Server 2008 R2',
    'ubuntu': 'Ubuntu Linux',
    'debian': 'Debian GNU/Linux',
    'centos': 'CentOS / Rocky / AlmaLinux',
    'alpine': 'Alpine Linux',
}

vms_result = []

def collect_vm(vm_summary, vm_type='qemu'):
    vmid = vm_summary.get('vmid')
    name = vm_summary.get('name') or f'{vm_type}-{vmid}'
    status = vm_summary.get('status', 'unknown')

    stat = pvesh_get(f'/nodes/{hostname}/{vm_type}/{vmid}/status/current') or vm_summary
    conf = pvesh_get(f'/nodes/{hostname}/{vm_type}/{vmid}/config') or {}

    cpus = int(stat.get('cpus') or conf.get('cores') or 1)
    cpu_usage = round(float(stat.get('cpu', 0)) * 100.0, 1) if status == 'running' else 0.0

    maxmem = int(stat.get('maxmem') or 0)
    mem_used = int(stat.get('mem') or 0) if status == 'running' else 0
    ram_usage = round(100.0 * mem_used / maxmem, 1) if maxmem > 0 and status == 'running' else 0.0

    maxdisk = int(stat.get('maxdisk') or 0)
    disk_used = int(stat.get('disk') or 0)
    uptime = int(stat.get('uptime') or 0) if status == 'running' else 0

    ostype_code = str(conf.get('ostype', 'l26'))
    os_info = OSTYPE_LABELS.get(ostype_code, f'OS ({ostype_code})')
    ip_addr = ''
    agent_enabled = 1 if str(conf.get('agent', '0')).startswith('1') or vm_type == 'lxc' else 0
    guest_agent_responding = False
    pending_updates = 0

    if vm_type == 'qemu' and status == 'running' and agent_enabled:
        os_data = pvesh_get(f'/nodes/{hostname}/qemu/{vmid}/agent/get-osinfo', timeout=4)
        if isinstance(os_data, dict) and 'result' in os_data:
            res = os_data['result']
            pretty = res.get('pretty-name') or res.get('name')
            kernel = res.get('kernel-release')
            if pretty:
                os_info = f"{pretty}" + (f" (Kernel {kernel})" if kernel else "")
            guest_agent_responding = True

        fs_data = pvesh_get(f'/nodes/{hostname}/qemu/{vmid}/agent/get-fsinfo', timeout=4)
        if isinstance(fs_data, dict) and isinstance(fs_data.get('result'), list):
            guest_agent_responding = True
            total_fs = 0
            used_fs = 0
            for fs in fs_data['result']:
                tb = int(fs.get('total-bytes') or 0)
                ub = int(fs.get('used-bytes') or 0)
                if tb > 0:
                    total_fs += tb
                    used_fs += ub
            if total_fs > 0:
                maxdisk = total_fs
                disk_used = used_fs

        net_data = pvesh_get(f'/nodes/{hostname}/qemu/{vmid}/agent/network-get-interfaces', timeout=4)
        if isinstance(net_data, dict) and isinstance(net_data.get('result'), list):
            ips = []
            for iface in net_data['result']:
                if iface.get('name') == 'lo':
                    continue
                for ipobj in iface.get('ip-addresses', []):
                    if ipobj.get('ip-address-type') == 'ipv4':
                        ip_val = ipobj.get('ip-address', '')
                        if ip_val and not ip_val.startswith('127.'):
                            ips.append(ip_val)
            if ips:
                ip_addr = ', '.join(ips[:2])

    elif vm_type == 'lxc' and status == 'running':
        guest_agent_responding = True
        lxc_ips = run_cmd(['pct', 'exec', str(vmid), '--', 'hostname', '-I'], timeout=4)
        if lxc_ips:
            ip_addr = lxc_ips.split()[0]
        lxc_os = run_cmd(['pct', 'exec', str(vmid), '--', 'bash', '-c', 'source /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"'], timeout=4)
        if lxc_os:
            os_info = lxc_os
        lxc_upd = run_cmd(['pct', 'exec', str(vmid), '--', 'bash', '-c', 'apt-get -s upgrade 2>/dev/null | grep -P "^\\d+ upgraded" | awk \'{print $1}\''], timeout=5)
        if lxc_upd.isdigit():
            pending_updates = int(lxc_upd)

    disk_usage = round(100.0 * disk_used / maxdisk, 1) if maxdisk > 0 else 0.0
    last_backup = backup_map.get(str(vmid), 'Non rilevato')

    issues = []
    if status != 'running':
        issues.append({
            'severity': 'warning',
            'title': 'Macchina Virtuale Spenta',
            'description': f'La macchina {name} (VMID {vmid}) risulta attualmente in stato "{status}".',
            'solution': f'Se lo spegnimento non è programmato, avviala da terminale Proxmox con:\nqm start {vmid} (per VM QEMU) oppure pct start {vmid} (per container LXC)\ne controlla i log di sistema con: journalctl -xe'
        })
    if vm_type == 'qemu' and status == 'running' and not guest_agent_responding:
        issues.append({
            'severity': 'info',
            'title': 'QEMU Guest Agent non attivo o non raggiungibile',
            'description': 'Senza il QEMU Guest Agent attivo dentro la VM, Proxmox non può leggere lo spazio disco interno reale, l\'IP e il sistema operativo esatto.',
            'solution': f'1. Nella GUI Proxmox vai su VM {vmid} -> Options -> QEMU Guest Agent -> Abilita.\n2. Dentro la VM Linux esegui: sudo apt update && sudo apt install -y qemu-guest-agent && sudo systemctl enable --now qemu-guest-agent\n(Su Windows installa i driver VirtIO e il pacchetto qemu-ga-x86_64.msi).'
        })
    if disk_usage >= 85:
        issues.append({
            'severity': 'critical' if disk_usage >= 92 else 'warning',
            'title': f'Spazio Disco in Esaurimento ({disk_usage}%)',
            'description': f'Il disco della VM ha superato la soglia di sicurezza ({disk_usage}% occupato). Rischio blocco servizi o database.',
            'solution': f'1. Libera spazio temporaneo dentro la VM:\n   sudo apt clean && sudo journalctl --vacuum-time=7d\n2. Oppure espandi il disco a caldo da Proxmox:\n   qm resize {vmid} scsi0 +20G\n   e poi ridimensiona la partizione interna con growpart / resize2fs.'
        })
    if ram_usage >= 88:
        issues.append({
            'severity': 'critical' if ram_usage >= 95 else 'warning',
            'title': f'Pressione Memoria RAM Elevata ({ram_usage}%)',
            'description': f'La VM sta utilizzando il {ram_usage}% della RAM allocata. Rischio intervento OOM Killer.',
            'solution': f'1. Verifica i processi più pesanti dentro la VM con: htop o ps aux --sort=-%mem | head -n 10\n2. Aumenta la RAM allocata sul nodo Proxmox:\n   qm set {vmid} -memory {int((maxmem / (1024*1024)) + 2048)}'
        })
    if cpu_usage >= 85:
        issues.append({
            'severity': 'warning',
            'title': f'Carico CPU Elevato ({cpu_usage}%)',
            'description': f'Le {cpus} vCPU della macchina lavorano costantemente vicino alla saturazione.',
            'solution': f'Controlla eventuali processi bloccati dentro la VM con `top` oppure assegna più core dalla console Proxmox:\nqm set {vmid} -cores {cpus + 2}'
        })
    if pending_updates > 0:
        issues.append({
            'severity': 'info',
            'title': f'{pending_updates} Aggiornamenti di Sistema Disponibili',
            'description': f'Sono stati rilevati {pending_updates} pacchetti da aggiornare per mantenere la sicurezza e stabilità dell\'OS.',
            'solution': 'Accedi alla macchina ed esegui:\nsudo apt update && sudo apt upgrade -y\nConsigliato eseguire prima uno snapshot da Proxmox.'
        })
    if last_backup.startswith('ERRORE') or last_backup == 'Non rilevato':
        issues.append({
            'severity': 'warning' if last_backup.startswith('ERRORE') else 'info',
            'title': f'Stato Backup: {last_backup}',
            'description': 'Nessun backup recente completato con successo trovato nei log del nodo.',
            'solution': f'Esegui subito un backup manuale di sicurezza:\nvzdump {vmid} --mode snapshot --compress zstd\ne verifica la pianificazione in Datacenter -> Backup.'
        })

    vms_result.append({
        'vmid': vmid,
        'name': name,
        'vm_type': vm_type,
        'status': status,
        'os_info': os_info,
        'ip_address': ip_addr,
        'uptime': uptime,
        'cpus': cpus,
        'cpu_usage': cpu_usage,
        'maxmem': maxmem,
        'mem_used': mem_used,
        'ram_usage': ram_usage,
        'maxdisk': maxdisk,
        'disk_used': disk_used,
        'disk_usage': disk_usage,
        'agent_enabled': 1 if guest_agent_responding else 0,
        'pending_updates': pending_updates,
        'last_backup': last_backup,
        'health_issues': issues
    })

if is_pve:
    qemu_list = pvesh_get(f'/nodes/{hostname}/qemu') or []
    if isinstance(qemu_list, list):
        for q in qemu_list:
            collect_vm(q, 'qemu')

    lxc_list = pvesh_get(f'/nodes/{hostname}/lxc') or []
    if isinstance(lxc_list, list):
        for c in lxc_list:
            collect_vm(c, 'lxc')

payload = {
    'api_key': api_key,
    'hostname': hostname,
    'ip_address': ip_address,
    'os_version': os_version,
    'node_type': node_type,
    'pbs_info': pbs_storages,
    'status': 'online',
    'total_ram': mem_total,
    'used_ram': mem_used_node,
    'total_cpu': cpu_total,
    'total_disk': disk_total,
    'used_disk': disk_used_node,
    'pending_updates': node_pending_updates,
    'ram_usage_percent': ram_pct_node,
    'cpu_usage_percent': cpu_pct_node,
    'disk_usage_percent': disk_pct_node,
    'vms': vms_result
}

print(json.dumps(payload))
EOF
)

if [ -z "$JSON_PAYLOAD" ]; then
    echo "[$(date)] Errore: impossibile generare il payload JSON"
    exit 1
fi

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD" \
    --max-time 30 \
    "$API_URL")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo "[$(date)] ✅ Dati (PVE + PBS + Diagnostica VM) inviati con successo a $API_URL"
else
    echo "[$(date)] ❌ Errore HTTP $HTTP_CODE: $BODY"
    exit 1
fi
