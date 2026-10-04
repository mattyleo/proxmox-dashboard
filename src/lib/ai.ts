import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

/**
 * Motore AI Ibrido per ML-ProxVision:
 * 1. PRIORITÀ 1: AI Locale (Ollama in esecuzione sul server locale - http://127.0.0.1:11434)
 *    Zero costi, 100% privacy aziendale, funziona anche senza internet.
 * 2. PRIORITÀ 2: OpenAI Cloud (se OPENAI_API_KEY è presente)
 * 3. PRIORITÀ 3: Motore Diagnostico Esperto Locale integrato (fallback istantaneo)
 */
export async function suggestProxmoxSolution(
  alertTitle: string,
  alertDescription: string,
  serverContext?: string
): Promise<string> {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2:3b';

  const systemPrompt = `Sei l'Intelligenza Artificiale locale del sistema di monitoraggio ML-ProxVision (ideato da Mattia Leoni), specializzata in Proxmox VE, Proxmox Backup Server (PBS), Linux e Windows Server.
Analizza l'anomalia rilevata e rispondi in italiano in modo chiaro, tecnico e strutturato:
TITOLO PROBLEMA: ${alertTitle}
DATI RILEVATI: ${alertDescription}
CONTESTO: ${serverContext || 'Infrastruttura Proxmox VE'}

Fornisci:
1. **Diagnosi della Causa**: perché si verifica questa anomalia e quali rischi comporta.
2. **Procedura e Comandi di Risoluzione**: i comandi esatti da eseguire sul nodo Proxmox (qm, pct, pvesh, vzdump, zfs, lvm) o dentro la VM per correggere il difetto.
3. **Prevenzione**: come evitare che accada di nuovo.`;

  // 1. Tenta prima con l'AI Locale (Ollama)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: systemPrompt,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.response) {
        return `🧠 [AI Locale Ollama - Modello: ${ollamaModel}]\n\n${String(data.response).trim()}`;
      }
    }
  } catch {
    // Se Ollama non è ancora avviato sulla macchina, passa silenziosamente al metodo successivo
  }

  // 2. Se configurata, usa OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const { text } = await generateText({
        model: openai('gpt-4o'),
        prompt: systemPrompt,
      });
      return `☁️ [AI Cloud OpenAI]\n\n${text}`;
    } catch (error) {
      console.error('Errore OpenAI:', error);
    }
  }

  // 3. Motore Esperto Integrato (funziona sempre all'istante)
  return `🛠️ [Motore Diagnostico Esperto Locale - ProxmoxAI]

1. **Diagnosi Tecnica Automatica**:
   È stata rilevata l'anomalia **"${alertTitle}"** (${alertDescription}) su ${serverContext || 'nodo Proxmox'}.
   Se non corretta, questa condizione può causare rallentamenti I/O, blocco dei servizi applicativi o fallimento dei job di backup notturni verso PBS.

2. **Comandi Consigliati per la Risoluzione Immediata**:
   - **Controllo e pulizia spazio disco / log nella VM**:
     \`sudo journalctl --vacuum-time=7d && sudo apt-get clean && df -h\`
   - **Espansione disco a caldo dal nodo Proxmox (senza spegnere la VM)**:
     \`qm resize <VMID> scsi0 +20G\`
   - **Verifica processi con maggior consumo di RAM/CPU**:
     \`ps aux --sort=-%mem | head -n 10\`
   - **Verifica stato Backup e PBS**:
     \`pvesm status && vzdump <VMID> --mode snapshot --compress zstd\`
   - **Installazione aggiornamenti di sicurezza in sospeso**:
     \`sudo apt update && sudo apt upgrade -y\`

3. **Nota AI Locale**:
   Per attivare il modello neurale locale completo sul server, avvia Ollama (\`ollama run ${ollamaModel}\`).`;
}
