import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!isAdmin(user)) {
      return NextResponse.json({ error: 'Accesso riservato all’amministratore' }, { status: 403 });
    }

    let localCommit = 'unknown';
    let localBranch = 'main';

    try {
      const { stdout: lc } = await execAsync('git rev-parse --short HEAD', { timeout: 5000 });
      localCommit = lc.trim();
      const { stdout: lb } = await execAsync('git rev-parse --abbrev-ref HEAD', { timeout: 5000 });
      localBranch = lb.trim();
    } catch {
      // Fallback
    }

    let remoteCommit = '';
    let commitsBehind = 0;
    let changelog: string[] = [];
    let fetchError: string | null = null;

    try {
      await execAsync('git fetch origin main', { timeout: 15000 });
      const { stdout: rc } = await execAsync('git rev-parse --short origin/main', { timeout: 5000 });
      remoteCommit = rc.trim();

      const { stdout: cnt } = await execAsync('git rev-list --count HEAD..origin/main', { timeout: 5000 });
      commitsBehind = parseInt(cnt.trim(), 10) || 0;

      if (commitsBehind > 0) {
        const { stdout: logs } = await execAsync('git log HEAD..origin/main --oneline -n 8', { timeout: 5000 });
        changelog = logs.trim().split('\n').filter(Boolean);
      }
    } catch (e: any) {
      fetchError = e.message || 'Impossibile contattare GitHub';
    }

    return NextResponse.json({
      current_commit: localCommit,
      remote_commit: remoteCommit || localCommit,
      branch: localBranch,
      updates_available: commitsBehind > 0,
      commits_behind: commitsBehind,
      changelog,
      fetch_error: fetchError,
      last_check: new Date().toLocaleTimeString('it-IT')
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!isAdmin(user)) {
      return NextResponse.json({ error: 'Accesso riservato all’amministratore' }, { status: 403 });
    }

    // 1. Scarica i file aggiornati da GitHub
    const { stdout: pullOut } = await execAsync('git pull origin main', { timeout: 30000 });

    // 2. Lancia in background la compilazione e il riavvio del servizio systemd
    // per permettere alla risposta HTTP di tornare subito al browser
    setTimeout(async () => {
      try {
        console.log('[AUTO-UPDATE] Avvio build di produzione (npm run build)...');
        await execAsync('npm run build', { timeout: 180000 });
        console.log('[AUTO-UPDATE] Build completata. Riavvio servizio proxmox-dashboard...');
        // Tenta il riavvio del servizio systemd (o pm2)
        await execAsync('sudo systemctl restart proxmox-dashboard.service 2>/dev/null || systemctl restart proxmox-dashboard.service 2>/dev/null || pm2 restart proxmox-dashboard 2>/dev/null || true');
      } catch (err) {
        console.error('[AUTO-UPDATE] Errore ricompilazione/riavvio:', err);
      }
    }, 800);

    return NextResponse.json({
      success: true,
      message: 'Codice aggiornato con successo da GitHub! Ricompilazione e riavvio del servizio avviati in background (~25s).',
      pull_output: pullOut.trim()
    });
  } catch (err: any) {
    return NextResponse.json({ error: `Errore durante il git pull: ${err.message}` }, { status: 500 });
  }
}
