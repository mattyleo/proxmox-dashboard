'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('proxmox_theme') as 'dark' | 'light' | null;
    const initial = saved || 'dark';
    setTheme(initial);
    document.documentElement.classList.toggle('light', initial === 'light');
    document.documentElement.classList.toggle('dark', initial === 'dark');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('proxmox_theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="w-full glass-panel p-3 rounded-xl flex items-center justify-between text-xs font-semibold hover:border-primary/40 transition-all cursor-pointer"
      title="Cambia Tema Chiaro / Scuro"
    >
      <span className="flex items-center gap-2 text-muted-foreground">
        <span>{theme === 'dark' ? '🌙' : '☀️'}</span>
        <span>Tema {theme === 'dark' ? 'Scuro' : 'Chiaro'}</span>
      </span>
      <span className="bg-primary/20 text-primary px-2 py-0.5 rounded font-bold">
        Cambia
      </span>
    </button>
  );
}
