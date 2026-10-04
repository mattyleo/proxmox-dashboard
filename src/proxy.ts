import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Percorsi pubblici: pagina di login, API di ingestione dati, download agent con api_key, API di auth e risorse statiche
  const isPublicPath =
    path === '/login' ||
    path.startsWith('/api/auth') ||
    path.startsWith('/api/ingest') ||
    path.startsWith('/api/agent-download') ||
    path.startsWith('/_next') ||
    path === '/favicon.ico';

  const token = request.cookies.get('auth_token')?.value || '';

  if (!isPublicPath && !token) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  if (path === '/login' && token) {
    return NextResponse.redirect(new URL('/', request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
