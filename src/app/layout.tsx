import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import UserBadge from '@/components/UserBadge';
import { getAppSettings } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Proxmox AI Dashboard — GM-SYSTEM',
  description: 'Multi-Tenant Proxmox Monitoring and Troubleshooting — Ideato da Mattia Leoni',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [settings, user] = await Promise.all([getAppSettings(), getCurrentUser()]);

  return (
    <html lang="it" className="dark" suppressHydrationWarning>
      <body className="flex h-screen overflow-hidden bg-background text-foreground">
        {/* Sidebar */}
        <aside className="w-68 flex-shrink-0 border-r border-border bg-card/40 backdrop-blur-md flex flex-col justify-between py-6 gap-6">
          {/* Brand & Instance Header */}
          <div className="space-y-5">
            <div className="px-6 space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-warning shadow-lg flex items-center justify-center font-black text-white text-lg">
                  P
                </div>
                <div>
                  <h1 className="text-lg font-extrabold tracking-tight leading-none">
                    Proxmox<span className="text-primary font-black">AI</span>
                  </h1>
                  <span className="text-xs font-black text-primary tracking-wide block mt-0.5">
                    {settings.instance_name}
                  </span>
                </div>
              </div>
              <div
                className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-muted-foreground font-mono truncate"
                title={settings.hardware_host}
              >
                🖥️ {settings.hardware_host}
              </div>
            </div>

            <nav className="w-full px-4 flex flex-col gap-1.5">
              {[
                { name: 'Dashboard Generica', path: '/', icon: '◱' },
                { name: 'Aziende & Clienti', path: '/companies', icon: '🏢' },
                { name: 'Ticket & Allarmi', path: '/alerts', icon: '⚠️' },
                { name: 'Knowledge Base', path: '/kb', icon: '📚' },
                { name: 'Impostazioni & Info', path: '/settings', icon: '⚙️' },
              ].map((item) => (
                <Link
                  key={item.name}
                  href={item.path}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-muted-foreground hover:text-primary hover:bg-white/5 transition-all group"
                >
                  <span className="text-lg opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-transform">
                    {item.icon}
                  </span>
                  <span className="font-medium text-sm">{item.name}</span>
                </Link>
              ))}
            </nav>
          </div>

          {/* Footer Sidebar: Utente Loggato, Tema e Crediti Ideatore */}
          <div className="w-full px-5 space-y-2.5">
            <UserBadge user={user} />
            <ThemeToggle />

            <Link
              href="/settings"
              className="block bg-black/30 hover:bg-white/5 border border-white/10 rounded-xl p-3 text-[11px] text-muted-foreground transition-colors space-y-0.5"
            >
              <div className="font-bold text-white flex justify-between items-center">
                <span>Ideato da Mattia Leoni</span>
                <span className="text-primary">Info →</span>
              </div>
              <div className="truncate">Via Città di Pemba, 21 - Reggio Emilia</div>
              <div className="font-mono text-[10px] text-primary">
                (377)093-3621 • info@leonimattia.it
              </div>
            </Link>
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
