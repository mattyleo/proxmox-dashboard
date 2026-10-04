#!/bin/bash
# ==============================================================================
# ML-ProxVision — INSTALLER AUTOMATICO COMPLETO (Ubuntu Server / Debian)
# Ideato e sviluppato da: Mattia Leoni
# Via Città di Pemba, 21 - 42123 Reggio Emilia (RE) Italy
# Tel: (377)093-3621 | Email: info@leonimattia.it
# ==============================================================================

set -e

echo "=================================================================="
echo " 🚀 INSTALLER ML-ProxVision"
echo " Ideato da Mattia Leoni — info@leonimattia.it | (377)093-3621"
echo "=================================================================="

if [ "$EUID" -ne 0 ]; then
  echo "⚠️  Esegui questo installer come root: sudo ./install.sh"
  exit 1
fi

INSTALL_DIR=$(pwd)
SERVER_IP=$(hostname -I | awk '{print $1}')

echo "📦 [1/6] Aggiornamento pacchetti base di sistema..."
apt-get update -y
apt-get install -y curl git ca-certificates gnupg lsb-release build-essential

# 2. Installazione Node.js 22 LTS (se non presente)
if ! command -v node &> /dev/null; then
  echo "🟢 [2/6] Installazione Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
else
  echo "✅ [2/6] Node.js già installato ($(node -v))"
fi

# 3. Installazione e Configurazione MySQL Server Nativo (DB pulito e vuoto)
if ! command -v mysql &> /dev/null; then
  echo "🐬 [3/6] Installazione MySQL Server locale..."
  apt-get install -y mysql-server
  systemctl enable --now mysql
else
  echo "✅ [3/6] MySQL Server già presente"
  systemctl start mysql || true
fi

echo "🗄️  Configurazione Database 'proxmox_dashboard' (vuoto)..."
mysql -u root <<EOF || true
CREATE DATABASE IF NOT EXISTS proxmox_dashboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'proxmox_root_2024';
CREATE USER IF NOT EXISTS 'proxmox_user'@'localhost' IDENTIFIED BY 'proxmox_pass_2024';
GRANT ALL PRIVILEGES ON proxmox_dashboard.* TO 'proxmox_user'@'localhost';
FLUSH PRIVILEGES;
EOF

if [ -f "$INSTALL_DIR/supabase_schema.sql" ]; then
  mysql -u root -pproxmox_root_2024 proxmox_dashboard < "$INSTALL_DIR/supabase_schema.sql" || true
fi

# 4. Installazione AI Locale (Ollama + Modello llama3.2:3b)
echo "🧠 [4/6] Configurazione Motore AI Locale (Ollama)..."
if ! command -v ollama &> /dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
  systemctl enable --now ollama || true
else
  echo "✅ Ollama già installato"
fi

nohup ollama pull llama3.2:3b >/var/log/ollama-pull.log 2>&1 &

# 5. Configurazione variabili ambiente (.env.local) e Build Dashboard
echo "⚙️  [5/6] Creazione file .env.local e installazione dipendenze npm..."
cat > "$INSTALL_DIR/.env.local" <<EOF
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=proxmox_user
DB_PASSWORD=proxmox_pass_2024
DB_NAME=proxmox_dashboard
ADMIN_PASSWORD=admin
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2:3b
EOF

npm install
npm run build

# 6. Creazione Servizio Systemd per avvio automatico al boot
echo "🔄 [6/6] Creazione servizio di avvio automatico (proxmox-dashboard.service)..."
cat > /etc/systemd/system/proxmox-dashboard.service <<EOF
[Unit]
Description=ProxmoxAI Dashboard (Ideato da Mattia Leoni)
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable proxmox-dashboard.service
systemctl restart proxmox-dashboard.service

echo ""
echo "=================================================================="
echo " ✅ INSTALLAZIONE COMPLETATA CON SUCCESSO!"
echo "=================================================================="
echo " 🌐 Dashboard attiva su:  http://$SERVER_IP:3000"
echo " 👑 Login Admin:          info@leonimattia.it  (Password: admin)"
echo " 🛡️  Login Supervisore:    supervisore@proxmox.local (Password: supervisore)"
echo " 🛠️  Login Tecnico:        tecnico@proxmox.local (Password: tecnico)"
echo " ⚙️  Nota: Vai nel menu 'Impostazioni & Info' per inserire il nome"
echo "     dell'azienda e del server su cui hai installato la dashboard."
echo "=================================================================="
