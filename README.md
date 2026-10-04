# 🖥️ ProxmoxAI Dashboard — GM-SYSTEM

Piattaforma centralizzata Multi-Tenant di monitoraggio, telemetria profonda e diagnostica con **AI Locale (Ollama)** per nodi **Proxmox VE**, **Proxmox Backup Server (PBS)** e Macchine Virtuali (**QEMU & LXC**).

---

## 👨‍💻 Ideatore e Crediti Ufficiali

- **Programma ideato e sviluppato da:** Mattia Leoni
- **Indirizzo:** Via Città di Pemba, 21 — Reggio Emilia (RE) 42123, Italy
- **Telefono:** `(377) 093-3621`
- **Email:** `info@leonimattia.it`
- **Istanza Predefinita:** `GM-SYSTEM` (`Server HP ProLiant 380`)

---

## ✨ Funzionalità Principali

1. **Grafici Interattivi in Home (Pizza + Mappa a Rettangoli per Azienda)**
   - Visualizza a colpo d'occhio la percentuale di **Funzionamento (`100% OK`)** o di **Problematiche (`≥10%`)** di ogni azienda.
   - Cliccando direttamente sullo spicchio o sul rettangolo di un'azienda si apre subito la sezione `#problematiche` con i difetti rilevati e le soluzioni.
2. **Telemetria Profonda VM (QEMU & LXC) + Rilevamento Automatico PBS**
   - Rileva Sistema Operativo esatto, Kernel, Indirizzo IP, Uptime, CPU, RAM in uso/libera, Hard Disk occupato/libero, stato QEMU Guest Agent, aggiornamenti di sistema in sospeso e stato backup su **Proxmox Backup Server (PBS)**.
3. **Sistema di Autenticazione a 3 Livelli (Email + Ruoli)**
   - **👑 Admin (`info@leonimattia.it` / `admin`)**: Accesso completo a tutto, gestione utenti e personalizzazione istanza (`GM-SYSTEM` / `leonimattia`).
   - **🛡️ Supervisore (`supervisore@gm-system.it` / `supervisore`)**: Inserisce le aziende e scarica/installa gli script `proxmox-agent.sh` generati al volo e già configurati con l'API Key dell'azienda.
   - **🛠️ Tecnico (`tecnico@gm-system.it` / `tecnico`)**: Sola visione della dashboard e consultazione delle guide/comandi per risolvere le problematiche.
4. **Motore AI Locale Integrato (Ollama)**
   - Utilizza **Ollama (`http://127.0.0.1:11434`, modello `llama3.2:3b`)** direttamente sul server locale HP ProLiant 380 senza costi cloud e in totale privacy aziendale, con fallback automatico sul motore diagnostico esperto integrato.

---

## 🚀 Installazione Automatica su Ubuntu Server (HP ProLiant 380)

Su una macchina virtuale **Ubuntu Server 22.04 / 24.04 LTS** dentro Proxmox, esegui questi 3 comandi:

```bash
git clone https://github.com/mattyleo/proxmox-dashboard.git
cd proxmox-dashboard
chmod +x install.sh && sudo ./install.sh
```

Lo script [`install.sh`](./install.sh) installa e configura da solo:
- Node.js 22 LTS
- MySQL Server locale + creazione automatica database e tabelle (`proxmox_dashboard`)
- **Ollama (AI Locale)** + modello `llama3.2:3b`
- Build di produzione della dashboard e servizio `systemd` (`proxmox-dashboard.service`) per l'avvio automatico all'accensione del server.

---

## 💻 Avvio Rapido su Windows (Test Locale)

1. Apri **Docker Desktop**.
2. Fai doppio click su [`install-windows.bat`](./install-windows.bat) (oppure esegui `npm run dev`).
3. Apri **http://localhost:3000**.
