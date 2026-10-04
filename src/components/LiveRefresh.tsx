'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LiveRefresh({ intervalSeconds = 10 }: { intervalSeconds?: number }) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(intervalSeconds);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          router.refresh();
          return intervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefresh, intervalSeconds, router]);

  return (
    <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-3 py-1.5 rounded-xl text-xs">
      <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-success animate-ping' : 'bg-muted'}`} />
      <span className="text-muted-foreground font-mono">
        {autoRefresh ? `Live sync (${countdown}s)` : 'Live in pausa'}
      </span>
      <button
        type="button"
        onClick={() => setAutoRefresh(!autoRefresh)}
        className="text-primary hover:underline font-bold ml-1"
      >
        {autoRefresh ? 'Pausa' : 'Attiva'}
      </button>
      <button
        type="button"
        onClick={() => {
          router.refresh();
          setCountdown(intervalSeconds);
        }}
        className="bg-white/10 hover:bg-white/20 text-white px-2 py-0.5 rounded font-semibold transition-colors"
      >
        ↻ Aggiorna ora
      </button>
    </div>
  );
}
