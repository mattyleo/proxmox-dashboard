import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Proxmox GM Dashboard',
  description: 'Multi-Tenant Proxmox Monitoring and Troubleshooting',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="dark">
      <body className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 border-r border-border bg-card/40 backdrop-blur-md flex flex-col items-center py-8 gap-8">
          <div className="flex items-center gap-3 w-full px-6">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-primary to-warning shadow-lg flex items-center justify-center font-bold text-white">
              P
            </div>
            <h1 className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
              Proxmox<span className="text-primary font-black">GM</span>
            </h1>
          </div>

          <nav className="flex-1 w-full px-4 flex flex-col gap-2">
            {[
              { name: 'Dashboard Generica', path: '/', icon: '◱' },
              { name: 'Aziende & Clienti', path: '/companies', icon: '🏢' },
              { name: 'Ticket & Allarmi', path: '/alerts', icon: '⚠️' },
              { name: 'Knowledge Base', path: '/kb', icon: '📚' },
            ].map((item) => (
              <Link
                key={item.name}
                href={item.path}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:text-white hover:bg-white/5 transition-all group"
              >
                <span className="text-lg opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-transform">
                  {item.icon}
                </span>
                <span className="font-medium text-sm">{item.name}</span>
              </Link>
            ))}
          </nav>
          
          <div className="w-full px-6">
            <div className="glass-panel p-4 rounded-xl flex items-center gap-3">
               <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
               <span className="text-xs font-semibold text-muted-foreground">Sistema Attivo</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto relative">
          {/* Subtle background glow effect */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
          {children}
        </main>
      </body>
    </html>
  );
}
