import { supabaseAdmin as supabase } from '@/lib/supabase';

export default async function KnowledgeBasePage() {
  // Fetch knowledge base articles from database (if they exist)
  let articles: any[] = [];
  try {
    const { data } = await supabase.from('knowledge_base').select('*').order('created_at', { ascending: false });
    if (data) articles = data;
  } catch (e) {
    // Fails silently if Supabase is not fully configured
  }

  return (
    <div className="p-10 w-full max-w-7xl mx-auto space-y-10 relative z-10">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Knowledge Base</h2>
          <p className="text-muted-foreground">Soluzioni e problemi noti per l'infrastruttura Proxmox.</p>
        </div>
      </header>

      <div className="glass-panel p-10 rounded-3xl min-h-[400px]">
        {articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center h-full pt-10">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 text-2xl">
              📚
            </div>
            <h4 className="text-lg font-bold mb-2">Nessun articolo trovato</h4>
            <p className="text-sm text-muted-foreground max-w-sm">
              La knowledge base è attualmente vuota. Qui verranno salvate le soluzioni proposte dall'IA per gli allarmi risolti.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {articles.map((article) => (
              <div key={article.id} className="p-6 border border-white/10 bg-white/5 rounded-2xl">
                <h3 className="font-bold text-lg text-primary mb-2">{article.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{article.description}</p>
                <div className="bg-black/50 p-4 rounded-xl text-sm font-mono text-white/80">
                  {article.solution}
                </div>
                {article.tags && article.tags.length > 0 && (
                  <div className="flex gap-2 mt-4">
                    {article.tags.map((tag: string) => (
                      <span key={tag} className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-md">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
