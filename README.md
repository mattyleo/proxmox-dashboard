# 🖥️ ProxmoxAI Dashboard

Piattaforma centralizzata Multi-Tenant di monitoraggio, telemetria profonda e diagnostica con **AI Locale (Ollama)** per nodi **Proxmox VE**, **Proxmox Backup Server (PBS)** e Macchine Virtuali (**QEMU & LXC**).

---

## 👨‍💻 Ideatore e Crediti Ufficiali

- **Programma ideato e sviluppato da:** Mattia Leoni
- **Indirizzo:** Via Città di Pemba, 21 — Reggio Emilia (RE) 42123, Italy
- **Telefono:** `(377) 093-3621`
- **Email:** `info@leonimattia.it`

---

## ✨ Funzionalità Principali

1. **Grafici Interattivi in Home (Pizza + Mappa a Rettangoli per Azienda)**
   - Visualizza a colpo d'occhio la percentuale di **Funzionamento (`100% OK`)** o di **Problematiche (`≥10%`)** di ogni azienda.
   - Cliccando direttamente sullo spicchio o sul rettangolo di un'azienda si apre subito la sezione `#problematiche` con i difetti rilevati e le soluzioni.
2. **Telemetria Profonda VM (QEMU & LXC) + Rilevamento Automatico Cluster e PBS**
   - Rileva Sistema Operativo esatto, Kernel, Indirizzo IP, Uptime, CPU, RAM in uso/libera, Hard Disk occupato/libero, stato QEMU Guest Agent, aggiornamenti di sistema in sospeso e stato backup su **Proxmox Backup Server (PBS)**.
   - Se i nodi Proxmox di un'azienda sono in **Cluster**, basta installare l'agent su **un solo nodo** per rilevare automaticamente tutti i nodi del cluster.
3. **Sistema di Autenticazione a 3 Livelli (Email + Ruoli)**
   - **👑 Admin (`info@leonimattia.it` / `admin`)**: Accesso completo a tutto, gestione utenti e personalizzazione del nome dell'azienda che monta la dashboard nella tab **⚙️ Impostazioni**.
   - **🛡️ Supervisore (`supervisore@proxmox.local` / `supervisore`)**: Inserisce le aziende e scarica/installa gli script `proxmox-agent.sh` generati al volo e già configurati con l'API Key dell'azienda.
   - **🛠️ Tecnico (`tecnico@proxmox.local` / `tecnico`)**: Sola visione della dashboard e consultazione delle guide/comandi per risolvere le problematiche.
4. **Motore AI Locale Integrato (Ollama)**
   - Utilizza **Ollama (`http://127.0.0.1:11434`, modello `llama3.2:3b`)** direttamente sul server locale senza costi cloud e in totale privacy aziendale, con fallback automatico sul motore diagnostico esperto integrato.

---

## 🚀 Installazione Automatica su Ubuntu Server

Su una macchina virtuale **Ubuntu Server 22.04 / 24.04 LTS**, esegui questi 3 comandi:

```bash
git clone https://github.com/mattyleo/proxmox-dashboard.git
cd proxmox-dashboard
chmod +x install.sh && sudo ./install.sh
```

Lo script [`install.sh`](./install.sh) installa e configura da solo:
- Node.js 22 LTS
- MySQL Server locale con database `proxmox_dashboard` **completamente pulito e vuoto**
- **Ollama (AI Locale)** + modello `llama3.2:3b`
- Build di produzione della dashboard e servizio `systemd` (`proxmox-dashboard.service`) per l'avvio automatico all'accensione del server.

Dopo il primo accesso, vai su **⚙️ Impostazioni & Info** per impostare il nome dell'azienda/server che ospita la dashboard.
