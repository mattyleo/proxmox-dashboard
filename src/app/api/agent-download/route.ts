import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKeyParam = searchParams.get('api_key');
    const companyIdParam = searchParams.get('company_id');

    let company: any = null;

    if (apiKeyParam) {
      company = await queryOne('SELECT * FROM companies WHERE api_key = ?', [apiKeyParam]);
      if (!company) {
        company = { name: searchParams.get('name') || 'azienda', api_key: apiKeyParam };
      }
    } else if (companyIdParam) {
      company = await queryOne('SELECT * FROM companies WHERE id = ?', [companyIdParam]);
    }

    if (!company || !company.api_key) {
      return new NextResponse('API Key o Azienda non trovata', { status: 404 });
    }

    // Determina l'URL base della dashboard (es. http://192.168.0.150:3000)
    const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const protoHeader = request.headers.get('x-forwarded-proto') || 'http';
    const ingestUrl = `${protoHeader}://${hostHeader}/api/ingest`;

    const templatePath = path.join(process.cwd(), 'agent', 'proxmox-agent.sh');
    let scriptContent = fs.readFileSync(templatePath, 'utf-8');

    // Sostituisce automaticamente API_URL e API_KEY con quelli reali dell'azienda
    scriptContent = scriptContent
      .replace(
        /API_URL="[^"]*"/,
        `API_URL="${ingestUrl}"`
      )
      .replace(
        /API_KEY="[^"]*"/,
        `API_KEY="${company.api_key}"`
      );

    // Aggiunge intestazione personalizzata con il nome dell'azienda e formato LF Unix (fondamentale per Linux/Proxmox)
    const headerBanner = `#!/bin/bash\n# ============================================================\n# AGENTE PRECONFIGURATO PER AZIENDA: ${company.name}\n# API KEY: ${company.api_key}\n# DASHBOARD: ${ingestUrl}\n# ============================================================\n`;
    scriptContent = scriptContent.replace(/^#!\/bin\/bash\r?\n/, headerBanner);
    scriptContent = scriptContent.replace(/\r\n/g, '\n');

    const safeSlug = String(company.name || 'azienda')
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
