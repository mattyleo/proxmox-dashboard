#!/bin/bash
# ============================================================
# ML-ProxVision Agent v6 - Auto-Discovery Cluster Multi-Nodo + PBS + VM
# Supporto nativo HTTP (3000) e HTTPS/SSL (443 Nginx auto-firmato)
# ============================================================

API_URL="http://INSERISCI_IP_DASHBOARD:3000/api/ingest"
API_KEY="INSERISCI_QUI_LA_API_KEY_AZIENDALE"
COMPANY_NAME="Azienda"

# ============================================================
# AUTO-INSTALLAZIONE IN CRON AL PRIMO AVVIO (Zero configurazione manuale!)
# Quando lanci lo script la prima volta sul nodo Proxmox, si copia da solo in
# /root/proxmox-agent.sh e crea in automatico il job in /etc/cron.d/proxmox-agent!
# ============================================================
if [ "$EUID" -eq 0 ]; then
    SCRIPT_REAL=$(readlink -f "$0" 2>/dev/null || echo "$0")
    if [ -f "$SCRIPT_REAL" ] && [ "$SCRIPT_REAL" != "/root/proxmox-agent.sh" ]; then
        cp -f "$SCRIPT_REAL" /root/proxmox-agent.sh 2>/dev/null || true
        chmod +x /root/proxmox-agent.sh 2>/dev/null || true
    elif [ ! -f "/root/proxmox-agent.sh" ]; then
        # Se lanciato direttamente via curl | bash, scarica una copia persistente in /root/proxmox-agent.sh
        BASE_DL_URL="${API_URL%/api/ingest}/api/agent-download?api_key=${API_KEY}"
        curl -k -fsSL "$BASE_DL_URL" -o /root/proxmox-agent.sh 2>/dev/null && chmod +x /root/proxmox-agent.sh || true
    fi

    if [ -f "/root/proxmox-agent.sh" ] && [ ! -f "/etc/cron.d/proxmox-agent" ]; then
        echo "*/2 * * * * root /root/proxmox-agent.sh >> /var/log/proxmox-agent.log 2>&1" > /etc/cron.d/proxmox-agent
        chmod 644 /etc/cron.d/proxmox-agent
        systemctl restart cron 2>/dev/null || service cron restart 2>/dev/null || true
        echo "[AUTO-SETUP] Cron configurato automaticamente in /etc/cron.d/proxmox-agent (ogni 2 minuti)!"
    fi
fi

if ! command -v python3 &> /dev/null; then
    echo "Errore: python3 non trovato."
    exit 1
fi

python3 - "$API_KEY" "$API_URL" "$COMPANY_NAME" << 'EOF'
import subprocess, json, sys, socket, os, shutil, urllib.request, urllib.error, urllib.parse, ssl

api_key = sys.argv[1]
api_url = sys.argv[2]
company_name = sys.argv[3] if len(sys.argv) > 3 else "Azienda"
local_hostname = socket.gethostname()

# Contesto SSL permissivo per supportare Nginx con certificati HTTPS auto-firmati (porta 443)
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

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

def build_candidate_urls(primary_url):
    urls = [primary_url]
    try:
        parsed = urllib.parse.urlparse(primary_url)
        host_only = parsed.hostname or ""
        if host_only and host_only not in ("localhost", "127.0.0.1"):
            https_443 = f"https://{host_only}/api/ingest"
            http_3000 = f"http://{host_only}:3000/api/ingest"
            http_80 = f"http://{host_only}/api/ingest"
            for u in (https_443, http_3000, http_80):
                if u not in urls:
                    urls.append(u)
    except Exception:
        pass
    return urls

def send_payload(payload):
    data_bytes = json.dumps(payload).encode('utf-8')
    candidate_urls = build_candidate_urls(api_url)
    last_err = None

    for target_url in candidate_urls:
        req = urllib.request.Request(
            target_url,
            data=data_bytes,
            headers={'Content-Type': 'application/json', 'User-Agent': 'ML-ProxVision-Agent/6.0'},
            method='POST'
        )
        try:
            if target_url.startswith('https://'):
                resp_ctx = urllib.request.urlopen(req, timeout=25, context=ssl_ctx)
            else:
                resp_ctx = urllib.request.urlopen(req, timeout=25)
            with resp_ctx as resp:
                print(f"[OK] Inviati dati per nodo '{payload.get('hostname')}' a {target_url} (HTTP {resp.status})")
                return
        except urllib.error.HTTPError as he:
            err_body = ""
            try:
                err_body = he.read().decode('utf-8', errors='ignore')
            except Exception:
                pass
            last_err = f"HTTP {he.code} su {target_url}: {err_body or he.reason}"
        except Exception as e:
            last_err = f"{target_url} -> {e}"

    print(f"[ERRORE] Invio fallito per nodo '{payload.get('hostname')}': {last_err}")

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
                guest_agent_responding = True
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

            # ============================================================
            # CALCOLO RAM REALE INTERNA AL GUEST (Windows / Linux)
            # Se QEMU Guest Agent risponde:
            #   - legge RAM totale dentro Windows/Linux
            #   - legge RAM libera/disponibile dentro il guest
            #   - RAM usata = totale - libera
            # Se Guest Agent non risponde: mantiene il dato Proxmox (mem / maxmem) come fallback
            # ============================================================
            if guest_agent_responding:
                guest_ram_total = 0
                guest_ram_free = 0
                is_win_guest = ('win' in os_info.lower()) or ('win' in ostype_code.lower())

                # 1. Per Guest Linux: legge direttamente /proc/meminfo tramite QEMU Guest Agent file-read
                if not is_win_guest:
                    memfile_out = run_cmd(['pvesh', 'get', f'/nodes/{target_node}/qemu/{vmid}/agent/file-read', '--file', '/proc/meminfo', '--output-format', 'json'], timeout=4)
                    if memfile_out:
                        try:
                            mf_json = json.loads(memfile_out)
                            content_str = mf_json.get('content', '') if isinstance(mf_json, dict) else ''
                            if content_str:
                                mem_map = {}
                                for line in content_str.splitlines():
                                    parts = line.split(':')
                                    if len(parts) == 2:
                                        k = parts[0].strip()
                                        v_parts = parts[1].strip().split()
                                        if v_parts and v_parts[0].isdigit():
                                            mem_map[k] = int(v_parts[0]) * 1024
                                tot_b = mem_map.get('MemTotal', 0)
                                avail_b = mem_map.get('MemAvailable', 0)
                                if avail_b <= 0 and mem_map.get('MemFree', 0) > 0:
                                    avail_b = mem_map.get('MemFree', 0) + mem_map.get('Buffers', 0) + mem_map.get('Cached', 0)
                                if tot_b > 0 and 0 <= avail_b <= tot_b:
                                    guest_ram_total = tot_b
                                    guest_ram_free = avail_b
                        except Exception:
                            pass

                # 2. Per Guest Windows (o Linux se file-read non abilitato): controlla freemem / ballooninfo riportati dal Guest/VirtIO
                if guest_ram_free <= 0:
                    binfo = stat.get('ballooninfo') if isinstance(stat.get('ballooninfo'), dict) else {}
                    free_b = int(stat.get('freemem') or binfo.get('free_mem') or 0)
                    tot_b = int(binfo.get('total_mem') or maxmem or 0)
                    if tot_b > 0 and 0 < free_b <= tot_b:
                        guest_ram_total = tot_b
                        guest_ram_free = free_b

                # 3. Per Guest Windows (o Linux) tramite Guest Agent exec (legge FreePhysicalMemory e TotalVisibleMemorySize dentro l'OS)
                if guest_ram_free <= 0 and is_local:
                    if is_win_guest:
                        w_out = run_cmd(['qm', 'guest', 'exec', str(vmid), '--', 'cmd.exe', '/c', 'wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /Value'], timeout=5)
                        if not w_out or 'FreePhysicalMemory' not in w_out:
                            w_out = run_cmd(['qm', 'guest', 'exec', str(vmid), '--', 'powershell', '-NoProfile', '-Command', 'Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory,TotalVisibleMemorySize | ConvertTo-Json -Compress'], timeout=6)
                        if w_out:
                            try:
                                w_json = json.loads(w_out)
                                out_text = str(w_json.get('out-data', ''))
                                free_kb, tot_kb = 0, 0
                                for line in out_text.replace('\r', '\n').splitlines():
                                    if 'FreePhysicalMemory' in line:
                                        nums = ''.join(ch for ch in line.split(':', 1)[-1].split('=', 1)[-1] if ch.isdigit())
                                        if nums:
                                            free_kb = int(nums)
                                    elif 'TotalVisibleMemorySize' in line:
                                        nums = ''.join(ch for ch in line.split(':', 1)[-1].split('=', 1)[-1] if ch.isdigit())
                                        if nums:
                                            tot_kb = int(nums)
                                if tot_kb > 0 and 0 <= free_kb <= tot_kb:
                                    guest_ram_total = tot_kb * 1024
                                    guest_ram_free = free_kb * 1024
                            except Exception:
                                pass
                    else:
                        l_out = run_cmd(['qm', 'guest', 'exec', str(vmid), '--', 'sh', '-c', 'free -b'], timeout=4)
                        if l_out:
                            try:
                                l_json = json.loads(l_out)
                                out_text = str(l_json.get('out-data', ''))
                                for line in out_text.splitlines():
                                    if line.lower().startswith('mem:'):
                                        cols = line.split()
                                        if len(cols) >= 7 and cols[1].isdigit() and cols[6].isdigit():
                                            guest_ram_total = int(cols[1])
                                            guest_ram_free = int(cols[6])
                            except Exception:
                                pass

                # Se abbiamo letto con successo RAM totale e libera dal Guest OS, calcoliamo:
                # RAM usata = totale - libera
                if guest_ram_total > 0 and 0 <= guest_ram_free <= guest_ram_total:
                    maxmem = guest_ram_total
                    mem_used = guest_ram_total - guest_ram_free
                    ram_usage = round(100.0 * mem_used / maxmem, 1)

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
        'company_name': company_name,
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

    cluster_nodes = pvesh_get('/nodes') or []
    if isinstance(cluster_nodes, list) and len(cluster_nodes) > 0:
        for n in cluster_nodes:
            node_name = n.get('node')
            if node_name and n.get('status') == 'online':
                collect_and_send_pve_node(node_name, storage_cfg_map)
    else:
        collect_and_send_pve_node(local_hostname, storage_cfg_map)
EOF
