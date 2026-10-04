#!/bin/bash
# ============================================================
# ProxmoxAI Agent v5 - Auto-Discovery Cluster Multi-Nodo + PBS + VM
# ============================================================
# COME FUNZIONA CON PIÙ NODI PROXMOX:
#   - SE I PROXMOX SONO IN CLUSTER:
#     Basta installare questo file su UNO SOLO dei nodi del cluster!
#     Lo script interroga `/nodes` e rileva in automatico tutti i nodi
#     del cluster, le loro VM e gli storage PBS.
#   - SE I PROXMOX SONO SEPARATI (NON IN CLUSTER):
#     Copia questo STESSO file (con la stessa API Key dell'azienda)
#     su ciascun server Proxmox: la dashboard li raggrupperà tutti
#     sotto la stessa azienda!
# ============================================================

API_URL="http://INSERISCI_IP_DASHBOARD:3000/api/ingest"
API_KEY="INSERISCI_QUI_LA_API_KEY_AZIENDALE"

if ! command -v python3 &> /dev/null; then
    echo "Errore: python3 non trovato."
    exit 1
fi

python3 - "$API_KEY" "$API_URL" << 'EOF'
import subprocess, json, sys, socket, os, shutil, urllib.request

api_key = sys.argv[1]
api_url = sys.argv[2]
local_hostname = socket.gethostname()

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

def send_payload(payload):
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(api_url, data=data_bytes, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            print(f"[OK] Inviati dati per nodo '{payload.get('hostname')}' (HTTP {resp.status})")
    except Exception as e:
        print(f"[ERRORE] Invio fallito per nodo '{payload.get('hostname')}': {e}")

is_pve = shutil.which('pvesh') is not None
is_pbs_host = (not is_pve) and (shutil.which('proxmox-backup-manager') is not None)
local_ip = run_cmd(['hostname', '-I']).split(' ')[0] if run_cmd(['hostname', '-I']) else ''
pve_version = run_cmd(['pveversion']) or 'Proxmox VE'

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

def collect_and_send_pve_node(target_node, storage_cfg_map):
    node_stat = pvesh_get(f'/nodes/{target_node}/status') or {}
    is_local = (target_node == local_hostname)

    # CPU, RAM e Disco del nodo (letti via API cluster di Proxmox così funziona anche per gli altri nodi del cluster!)
    cpu_pct_node = round(float(node_stat.get('cpu', 0)) * 100.0, 1)
    cpu_info = node_stat.get('cpuinfo', {}) if isinstance(node_stat.get('cpuinfo'), dict) else {}
    cpu_total = int(cpu_info.get('cpus') or os.cpu_count() or 1)

    mem_info = node_stat.get('memory', {}) if isinstance(node_stat.get('memory'), dict) else {}
    mem_total = int(mem_info.get('total') or 0)
    mem_used_node = int(mem_info.get('used') or 0)
    ram_pct_node = round(100.0 * mem_used_node / mem_total, 1) if mem_total > 0 else 0.0

    rootfs_info = node_stat.get('rootfs', {}) if isinstance(node_stat.get('rootfs'), dict) else {}
    disk_total = int(rootfs_info.get('total') or 0)
    disk_used_node = int(rootfs_info.get('used') or 0)
    disk_pct_node = round(100.0 * disk_used_node / disk_total, 1) if disk_total > 0 else 0.0

    node_pending_updates = 0
    if is_local:
        upd_out = run_cmd(['bash', '-c', 'apt-get -s upgrade 2>/dev/null | grep -P "^\\d+ upgraded" | awk \'{print $1}\''])
        node_pending_updates = int(upd_out) if upd_out.isdigit() else 0

    # Rileva PBS e Storage di Backup del nodo
    pbs_storages = []
    node_storages = pvesh_get(f'/nodes/{target_node}/storage') or []
    if isinstance(node_storages, list):
        for st_item in node_storages:
            if not isinstance(st_item, dict):
                continue
            st_name = st_item.get('storage', '')
            st_type = st_item.get('type', '')
            st_content = st_item.get('content', '')
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

    recent_tasks = pvesh_get(f'/nodes/{target_node}/tasks') or []
    backup_map = {}
    if isinstance(recent_tasks, list):
        for t in recent_tasks:
            if t.get('type') == 'vzdump':
                vmid_str = str(t.get('id', ''))
                status_str = t.get('status', 'UNKNOWN')
                if vmid_str and vmid_str not in backup_map:
                    backup_map[vmid_str] = 'OK' if status_str == 'OK' else f'ERRORE ({status_str})'

    vms_result = []

    def collect_vm(vm_summary, vm_type='qemu'):
        vmid = vm_summary.get('vmid')
        name = vm_summary.get('name') or f'{vm_type}-{vmid}'
        status = vm_summary.get('status', 'unknown')

        stat = pvesh_get(f'/nodes/{target_node}/{vm_type}/{vmid}/status/current') or vm_summary
        conf = pvesh_get(f'/nodes/{target_node}/{vm_type}/{vmid}/config') or {}

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
            os_data = pvesh_get(f'/nodes/{target_node}/qemu/{vmid}/agent/get-osinfo', timeout=4)
            if isinstance(os_data, dict) and 'result' in os_data:
                res = os_data['result']
                pretty = res.get('pretty-name') or res.get('name')
                kernel = res.get('kernel-release')
                if pretty:
                    os_info = f"{pretty}" + (f" (Kernel {kernel})" if kernel else "")
                guest_agent_responding = True

            fs_data = pvesh_get(f'/nodes/{target_node}/qemu/{vmid}/agent/get-fsinfo', timeout=4)
            if isinstance(fs_data, dict) and isinstance(fs_data.get('result'), list):
                guest_agent_responding = True
                total_fs, used_fs = 0, 0
                for fs in fs_data['result']:
                    tb = int(fs.get('total-bytes') or 0)
                    ub = int(fs.get('used-bytes') or 0)
                    if tb > 0:
                        total_fs += tb
                        used_fs += ub
                if total_fs > 0:
                    maxdisk = total_fs
                    disk_used = used_fs

            net_data = pvesh_get(f'/nodes/{target_node}/qemu/{vmid}/agent/network-get-interfaces', timeout=4)
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

        disk_usage = round(100.0 * disk_used / maxdisk, 1) if maxdisk > 0 else 0.0
        last_backup = backup_map.get(str(vmid), 'Non rilevato')

        issues = []
        if status != 'running':
            issues.append({
                'severity': 'warning',
                'title': 'Macchina Virtuale Spenta',
                'description': f'La macchina {name} (VMID {vmid}) risulta in stato "{status}".',
                'solution': f'Avviala da terminale Proxmox con: qm start {vmid} oppure pct start {vmid}'
            })
        if disk_usage >= 85:
            issues.append({
                'severity': 'critical' if disk_usage >= 92 else 'warning',
                'title': f'Spazio Disco in Esaurimento ({disk_usage}%)',
                'description': f'Il disco della VM ha superato la soglia di sicurezza ({disk_usage}% occupato).',
                'solution': f'Libera spazio con sudo apt clean && sudo journalctl --vacuum-time=7d oppure espandi con: qm resize {vmid} scsi0 +20G'
            })
        if ram_usage >= 88:
            issues.append({
                'severity': 'critical' if ram_usage >= 95 else 'warning',
                'title': f'Pressione Memoria RAM Elevata ({ram_usage}%)',
                'description': f'La VM sta utilizzando il {ram_usage}% della RAM allocata.',
                'solution': f'Aumenta la RAM allocata sul nodo Proxmox: qm set {vmid} -memory {int((maxmem / (1024*1024)) + 2048)}'
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

    for q in (pvesh_get(f'/nodes/{target_node}/qemu') or []):
        collect_vm(q, 'qemu')
    for c in (pvesh_get(f'/nodes/{target_node}/lxc') or []):
        collect_vm(c, 'lxc')

    payload = {
        'api_key': api_key,
        'hostname': target_node,
        'ip_address': local_ip if is_local else f'Cluster Node ({target_node})',
        'os_version': pve_version,
        'node_type': 'pve',
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
    send_payload(payload)

if is_pve:
    storage_cfg_list = pvesh_get('/storage') or []
    storage_cfg_map = {sc['storage']: sc for sc in storage_cfg_list if isinstance(sc, dict) and sc.get('storage')}

    # Rileva automaticamente tutti i nodi se siamo in un Cluster Proxmox!
    cluster_nodes = pvesh_get('/nodes') or []
    if isinstance(cluster_nodes, list) and len(cluster_nodes) > 0:
        for n in cluster_nodes:
            node_name = n.get('node')
            if node_name and n.get('status') == 'online':
                collect_and_send_pve_node(node_name, storage_cfg_map)
    else:
        collect_and_send_pve_node(local_hostname, storage_cfg_map)
EOF
