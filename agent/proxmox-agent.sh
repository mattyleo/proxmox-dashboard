#!/bin/bash
# ProxmoxAI Full Agent
# Requisiti: python3 (preinstallato su Proxmox/Debian)
# Questo script va inserito nel cron del nodo Proxmox (es. /etc/cron.d/proxmox-agent)
# Esempio cronjob (ogni 5 minuti):
# */5 * * * * root /root/proxmox-agent.sh >/dev/null 2>&1

# Sostituisci l'URL con quello fornito da Vercel (es. https://tuo-progetto.vercel.app/api/ingest)
API_URL="https://INSERISCI_URL_VERCEL_QUI/api/ingest"
# Inserisci la API Key generata dalla dashboard per questa azienda
API_KEY="INSERISCI_QUI_LA_API_KEY_AZIENDALE"

# Controlla che python3 sia installato
if ! command -v python3 &> /dev/null; then
    echo "Python3 non trovato. Impossibile generare il payload JSON in modo sicuro."
    exit 1
fi

# Raccogli le informazioni hardware
HOSTNAME=$(hostname)
STATUS="online"

# RAM
RAM_TOTAL=$(awk '/MemTotal/ {printf "%d", $2 * 1024}' /proc/meminfo)
RAM_FREE=$(awk '/MemAvailable/ {printf "%d", $2 * 1024}' /proc/meminfo)
if [ -z "$RAM_FREE" ]; then
    RAM_FREE=$(awk '/MemFree/ {printf "%d", $2 * 1024}' /proc/meminfo)
fi
RAM_USED=$((RAM_TOTAL - RAM_FREE))
RAM_PERCENT=$(( 100 * RAM_USED / RAM_TOTAL ))

# CPU Cores
CPU_TOTAL=$(nproc)
CPU_IDLE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
CPU_PERCENT=${CPU_IDLE%.*}

# Storage Principale (Root)
DISK_TOTAL=$(df -B1 / | awk 'NR==2 {print $2}')
DISK_USED=$(df -B1 / | awk 'NR==2 {print $3}')
DISK_PERCENT=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

# Ottieni la lista delle VM in formato JSON tramite l'API locale di Proxmox
VMS_JSON=$(pvesh get /nodes/$HOSTNAME/qemu --output-format json 2>/dev/null || echo "[]")

# Genera JSON Payload in modo sicuro utilizzando Python3
JSON_PAYLOAD=$(python3 -c "
import json, sys

try:
    vms = json.loads(sys.argv[8])
except:
    vms = []

# Mappiamo i campi necessari per le VM
mapped_vms = []
for vm in vms:
    mapped_vms.append({
        'vmid': vm.get('vmid'),
        'name': vm.get('name', 'Unknown'),
        'status': vm.get('status', 'unknown'),
        'maxmem': vm.get('maxmem', 0),
        'cpus': vm.get('cpus', 0),
        'maxdisk': vm.get('maxdisk', 0)
    })

payload = {
    'api_key': sys.argv[1],
    'hostname': sys.argv[2],
    'status': sys.argv[3],
    'total_ram': int(sys.argv[4]),
    'total_cpu': int(sys.argv[5]),
    'total_disk': int(sys.argv[6]),
    'ram_usage_percent': int(sys.argv[7]),
    'cpu_usage_percent': float(sys.argv[9]),
    'disk_usage_percent': int(sys.argv[10]),
    'vms': mapped_vms
}

print(json.dumps(payload))
" "$API_KEY" "$HOSTNAME" "$STATUS" "$RAM_TOTAL" "$CPU_TOTAL" "$DISK_TOTAL" "$RAM_PERCENT" "$VMS_JSON" "$CPU_PERCENT" "$DISK_PERCENT")

# Invia dati via HTTPS
curl -s -X POST -H "Content-Type: application/json" -d "$JSON_PAYLOAD" "$API_URL"
