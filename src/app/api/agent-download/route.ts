import { NextResponse } from 'next/server';
import pool, { queryOne, ensureSchema, getAppSettings } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import os from 'os';

export function getLocalLanIp(): string {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
          return net.address;
        }
      }
    }
  } catch {
    // Fallback
  }
  return 'localhost';
}

function isIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function resolveDashboardBaseUrl(
  request: Request,
  originParam?: string | null,
  configuredPublicUrl?: string
): string {
  // 0. Se l'Admin ha impostato l'URL / IP della Centrale nelle Impostazioni, usa sempre quello!
  if (configuredPublicUrl && configuredPublicUrl.trim()) {
    const raw = configuredPublicUrl.trim().replace(/\/$/, '');
    if (/^https?:\/\//i.test(raw)) {
      return raw.replace(/\/api\/ingest$/i, '');
    }
    return `http://${raw.replace(/\/api\/ingest$/i, '')}`;
  }

  const lanIp = getLocalLanIp();

  // 1. Se passato esplicitamente dal client (window.location.origin)
  if (originParam && /^https?:\/\//i.test(originParam)) {
    try {
      const u = new URL(originParam);
      if (isIpAddress(u.hostname)) {
        return `${u.protocol}//${u.host}`;
      }
    } catch {
      // Continua
    }
  }

  // 2. Dal Referer o Origin del browser
  const refHeader = request.headers.get('origin') || request.headers.get('referer');
  if (refHeader) {
    try {
      const u = new URL(refHeader);
      if (isIpAddress(u.hostname)) {
        return `${u.protocol}//${u.host}`;
      }
    } catch {
      // Continua
    }
  }

  // 3. Usa direttamente l'IPv4 reale della scheda di rete del server Ubuntu
  const isHttps =
    (originParam && originParam.startsWith('https://')) ||
    (refHeader && refHeader.startsWith('https://')) ||
    request.headers.get('x-forwarded-proto') === 'https';

  if (lanIp && lanIp !== 'localhost') {
    return isHttps ? `https://${lanIp}` : `http://${lanIp}:3000`;
  }

  const hostHeader =
    request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
  const protoHeader = request.headers.get('x-forwarded-proto') || 'http';
  return `${protoHeader}://${hostHeader}`;
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const settings = await getAppSettings();
    const { searchParams } = new URL(request.url);
    const apiKeyParam = searchParams.get('api_key')?.trim();
    const companyIdParam = searchParams.get('company_id')?.trim();
    const nameParam = (searchParams.get('name') || 'Azienda').trim();
    const emailParam = (searchParams.get('email') || '').trim();
    const originParam = searchParams.get('origin');

    let company: any = null;

    if (apiKeyParam) {
      company = await queryOne('SELECT * FROM companies WHERE api_key = ?', [apiKeyParam]);
      if (!company) {
        try {
          await pool.execute(
            'INSERT IGNORE INTO companies (id, name, contact_email, api_key) VALUES (UUID(), ?, ?, ?)',
            [nameParam || 'Azienda', emailParam || null, apiKeyParam]
          );
          company = await queryOne('SELECT * FROM companies WHERE api_key = ?', [apiKeyParam]);
        } catch {
          // Fallback oggetto in memoria
        }
        if (!company) {
          company = { name: nameParam || 'Azienda', api_key: apiKeyParam };
        }
      }
    } else if (companyIdParam) {
      company = await queryOne('SELECT * FROM companies WHERE id = ?', [companyIdParam]);
    }

    if (!company || !company.api_key) {
      return new NextResponse('API Key o Azienda non trovata', { status: 404 });
    }

    const baseUrl = resolveDashboardBaseUrl(request, originParam, settings.public_url);
    const ingestUrl = `${baseUrl.replace(/\/$/, '')}/api/ingest`;

    const templatePath = path.join(process.cwd(), 'agent', 'proxmox-agent.sh');
    let scriptContent = fs.readFileSync(templatePath, 'utf-8');

    const safeCompanyName = String(company.name || nameParam || 'Azienda').replace(/"/g, '');

    // Sostituisce automaticamente API_URL, API_KEY e COMPANY_NAME
    scriptContent = scriptContent
      .replace(/API_URL="[^"]*"/, `API_URL="${ingestUrl}"`)
      .replace(/API_KEY="[^"]*"/, `API_KEY="${company.api_key}"`)
      .replace(/COMPANY_NAME="[^"]*"/, `COMPANY_NAME="${safeCompanyName}"`);

    const headerBanner = `#!/bin/bash\n# ============================================================\n# ML-ProxVision — AGENTE PRECONFIGURATO PER: ${safeCompanyName}\n# API KEY: ${company.api_key}\n# DASHBOARD URL: ${ingestUrl}\n# ============================================================\n`;
    scriptContent = scriptContent.replace(/^#!\/bin\/bash\r?\n/, headerBanner);
    scriptContent = scriptContent.replace(/\r\n/g, '\n');

    const safeSlug =
      safeCompanyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'proxmox';

    return new NextResponse(scriptContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/x-shellscript; charset=utf-8',
        'Content-Disposition': `attachment; filename="proxmox-agent-${safeSlug}.sh"`,
      },
    });
  } catch (err: any) {
    console.error('Errore generazione agent:', err);
    return new NextResponse('Errore generazione file agent', { status: 500 });
  }
}
