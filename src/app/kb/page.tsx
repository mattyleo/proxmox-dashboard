import pool, { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export default async function KnowledgeBasePage() {
  let articles: any[] = [];
  try {
    articles = await query('SELECT * FROM knowledge_base ORDER BY created_at DESC');
  } catch (e) {
    console.error('Errore lettura KB:', e);
  }

  async function addArticle(formData: FormData) {
    'use server';
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const solution = formData.get('solution') as string;
    const tagsRaw = formData.get('tags') as string;

    if (title && solution) {
      const tags = tagsRaw
        ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
        : ['Proxmox'];
      await pool.execute(
        'INSERT INTO knowledge_base (id, title, description, solution, tags) VALUES (UUID(), ?, ?, ?, ?)',
        [title, description || '', solution, JSON.stringify(tags)]
      );
      revalidatePath('/kb');
    }
  }

  async function deleteArticle(formData: FormData) {
    'use server';
    const id = formData.get('id') as string;
    if (id) {
      await pool.execute('DELETE FROM knowledge_base WHERE id = ?', [id]);
      revalidatePath('/kb');
    }
  }

  return (
    <div className="p-10 w-full max-w-7xl mx-auto space-y-10 relative z-10">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Knowledge Base Tecnica</h2>
          <p className="text-muted-foreground">
            Archivio soluzioni, comandi di manutenzione e problemi risolti sull&apos;infrastruttura Proxmox.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form aggiunta rapida procedura */}
        <div className="lg:col-span-1 glass-panel p-6 rounded-3xl h-fit">
          <h3 className="text-xl font-bold mb-4">Nuova Procedura / Soluzione</h3>
          <form action={addArticle} className="space-y-4 text-sm">
            <div>
              <label className="block text-muted-foreground mb-1">Titolo Problema</label>
              <input
                type="text"
                name="title"
                required
                placeholder="es. Espansione disco LVM su VM Ubuntu"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white"
              />
            </div>
            <div>
              <label className="block text-muted-foreground mb-1">Sintomi / Descrizione</label>
              <input
                type="text"
                name="description"
                placeholder="es. Disco pieno al 95% su partizione root"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white"
              />
            </div>
            <div>
              <label className="block text-muted-foreground mb-1">Comandi e Soluzione</label>
              <textarea
                name="solution"
                rows={4}
                required
                placeholder="qm resize 101 scsi0 +20G..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-muted-foreground mb-1">Tag (separati da virgola)</label>
              <input
                type="text"
                name="tags"
                placeholder="Storage, QEMU, Linux"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-primary hover:bg-orange-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-primary/25"
            >
              Salva nella Knowledge Base
            </button>
          </form>
        </div>

        {/* Lista Articoli */}
        <div className="lg:col-span-2 space-y-4">
          {articles.length === 0 ? (
            <div className="glass-panel p-10 rounded-3xl flex flex-col items-center justify-center text-center min-h-[320px]">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-2xl">
                📚
              </div>
              <h4 className="text-lg font-bold mb-2">Nessun articolo in archivio</h4>
              <p className="text-sm text-muted-foreground max-w-sm">
                Puoi salvare con un click qualsiasi soluzione direttamente dalla pagina di una VM o dalla pagina Ticket & Allarmi.
              </p>
            </div>
          ) : (
            articles.map((article: any) => {
              let tags: string[] = [];
              try {
                if (typeof article.tags === 'string') {
                  tags = JSON.parse(article.tags);
                } else if (Array.isArray(article.tags)) {
                  tags = article.tags;
                }
              } catch {
                if (article.tags) tags = [String(article.tags)];
              }

              return (
                <div key={article.id} className="glass-panel p-6 rounded-3xl border border-white/10 space-y-3">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h3 className="font-bold text-lg text-primary">{article.title}</h3>
                      {article.description && (
                        <p className="text-sm text-muted-foreground mt-1">{article.description}</p>
                      )}
                    </div>
                    <form action={deleteArticle}>
                      <input type="hidden" name="id" value={article.id} />
                      <button
                        type="submit"
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        Elimina
                      </button>
                    </form>
                  </div>

                  <div className="bg-black/60 p-4 rounded-xl border border-white/5 text-xs font-mono text-gray-200 whitespace-pre-wrap">
                    {article.solution}
                  </div>

                  {tags.length > 0 && (
                    <div className="flex gap-2 flex-wrap pt-1">
                      {tags.map((tag: string, i: number) => (
                        <span
                          key={i}
                          className="text-xs bg-primary/20 text-primary px-2.5 py-0.5 rounded-md font-medium"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
