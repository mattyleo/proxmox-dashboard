import { supabaseAdmin as supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

export default async function CompaniesPage() {
  // Try to fetch companies, falling back to empty array if no url yet
  let companies: any[] = [];
  try {
    const { data } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
    if (data) companies = data;
  } catch (e) {
    // Fails silently if Supabase is not fully configured
  }

  async function addCompany(formData: FormData) {
    'use server';
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    
    if (name) {
      const { error } = await supabase.from('companies').insert([{ name, contact_email: email }]);
      if (error) {
        console.error("Errore creazione azienda:", error);
      }
      revalidatePath('/companies');
      revalidatePath('/');
    }
  }

  async function deleteCompany(formData: FormData) {
    'use server';
    const id = formData.get('id') as string;
    if (id) {
      const { error } = await supabase.from('companies').delete().eq('id', id);
      if (error) {
        console.error("Errore eliminazione azienda:", error);
      }
      revalidatePath('/companies');
      revalidatePath('/');
    }
  }

  return (
    <div className="p-10 w-full max-w-7xl mx-auto space-y-10 relative z-10">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Aziende Server</h2>
          <p className="text-muted-foreground">Gestisci i tuoi clienti e i loro server associati.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Form Aggiunta Azienda */}
        <div className="lg:col-span-1 glass-panel p-6 rounded-3xl h-fit">
          <h3 className="text-xl font-bold mb-6">Aggiungi Azienda</h3>
          <form action={addCompany} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Nome Azienda</label>
              <input 
                type="text" 
                name="name" 
                required 
                placeholder="es. Acme Corp s.r.l."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Email di Contatto (Opzionale)</label>
              <input 
                type="email" 
                name="email" 
                placeholder="es. admin@acme.com"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
            <button 
              type="submit" 
              className="w-full bg-primary hover:bg-orange-500 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-primary/25 mt-4"
            >
              Registra Azienda
            </button>
          </form>
        </div>

        {/* Lista Aziende */}
        <div className="lg:col-span-2 space-y-4">
          {companies.length === 0 ? (
            <div className="glass-panel p-10 rounded-3xl flex flex-col items-center justify-center text-center min-h-[300px]">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 text-2xl">
                🏢
              </div>
              <h4 className="text-lg font-bold mb-2">Nessuna azienda registrata</h4>
              <p className="text-sm text-muted-foreground max-w-sm">
                Aggiungi la tua prima azienda usando il pannello qui a fianco per generare automaticamente la sua API Key.
              </p>
            </div>
          ) : (
            companies.map((company) => (
              <div key={company.id} className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <Link href={`/companies/${company.id}`} className="hover:underline">
                    <h4 className="text-lg font-bold text-primary">{company.name}</h4>
                  </Link>
                  <p className="text-sm text-muted-foreground">{company.contact_email || 'Nessuna email'}</p>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  <div className="bg-black/50 p-3 rounded-lg border border-white/10 text-xs font-mono text-primary flex items-center gap-2">
                    <span className="text-white/50">API Key:</span> {company.api_key}
                  </div>
                  <form action={deleteCompany}>
                    <input type="hidden" name="id" value={company.id} />
                    <button 
                      type="submit" 
                      className="text-xs text-red-500 hover:text-red-400 hover:underline px-2 py-1 transition-colors"
                    >
                      Elimina Azienda
                    </button>
                  </form>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
