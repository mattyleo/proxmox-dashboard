import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

/**
 * Funzione per generare una soluzione suggerita dall'AI per un allarme Proxmox
 */
export async function suggestProxmoxSolution(
  alertTitle: string, 
  alertDescription: string, 
  serverContext?: string
) {
  try {
    const prompt = `
      Sei un ingegnere specializzato nell'amministrazione di server Proxmox VE.
      Un server di un nostro cliente ha attivato il seguente allarme:
      
      TITOLO ALLARME: ${alertTitle}
      DESCRIZIONE: ${alertDescription}
      ${serverContext ? `CONTESTO SERVER: ${serverContext}` : ''}

      Il tuo compito è scrivere una "Soluzione Proposta" breve e pratica per i nostri tecnici.
      Struttura la tua risposta in Markdown:
      1. **Diagnosi Probabile**: cosa potrebbe aver causato il problema.
      2. **Step per la Risoluzione**: 3-4 comandi o azioni da compiere sul nodo Proxmox via shell o interfaccia web (GUI) per mitigare o risolvere.
      3. **Attenzione**: Avvertenze rapide (es. impatto sui clienti, rischio di perdita dati).
      
      Sii diretto, tecnico ma molto chiaro. Non fare premesse, rispondi solo con la soluzione.
    `;

    const { text } = await generateText({
      model: openai('gpt-4o'), // O un altro modello openai, richiede OPENAI_API_KEY nell'env
      prompt: prompt,
    });

    return text;
  } catch (error) {
    console.error('Errore durante la generazione della soluzione AI:', error);
    return 'Al momento l\'intelligenza artificiale non è in grado di suggerire una soluzione (verifica la chiave API OpenAI).';
  }
}
