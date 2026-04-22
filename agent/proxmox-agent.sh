#!/bin/bash
# ProxmoxAI Minimal Agent
# Questo script va inserito nel cron del nodo Proxmox (es. /etc/cron.d/proxmox-agent)
# Esempio cronjob (ogni 5 minuti):
# */5 * * * * root /root/proxmox-agent.sh >/dev/null 2>&1

API_URL="https://il-tuo-dominio.com/api/ingest"
API_KEY="INSERISCI_QUI_LA_API_KEY_AZIENDALE"

# Raccogli metriche base dal sistema
HOSTNAME=$(hostname)
STATUS="online"
RAM_TOTAL=$(free -m | awk '/^Mem:/{print $2}')
RAM_USED=$(free -m | awk '/^Mem:/{print $3}')
RAM_PERCENT=$(( 100 * RAM_USED / RAM_TOTAL ))

CPU_IDLE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
CPU_PERCENT=${CPU_IDLE%.*}

DISK_TOTAL=$(df -h / | awk '/\//{print $2}' | sed 's/G//')
DISK_PERCENT=$(df -h / | awk '/\//{print $5}' | sed 's/%//')

# Genera JSON Payload
JSON_PAYLOAD=$(cat <<EOF
{
  "api_key": "$API_KEY",
  "hostname": "$HOSTNAME",
  "status": "$STATUS",
  "ram_usage_percent": $RAM_PERCENT,
  "cpu_usage_percent": $CPU_PERCENT,
  "disk_usage_percent": $DISK_PERCENT
}
EOF
)

# Invia dati via HTTPS
curl -s -X POST -H "Content-Type: application/json" -d "$JSON_PAYLOAD" "$API_URL"
