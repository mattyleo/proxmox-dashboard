import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Percorsi pubblici: pagina di login, API di ingestione dati (per l'agente), API di auth e risorse statiche
  const isPublicPath = path === '/login' || path.startsWith('/api/auth') || path.startsWith('/api/ingest') || path.startsWith('/_next') || path === '/favicon.ico';

  const token = request.cookies.get('auth_token')?.value || '';

  // Se non è autenticato e cerca di accedere a una rotta protetta, reindirizza al login
  if (!isPublicPath && !token) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }

  // Se è già autenticato e cerca di andare al login, mandalo alla dashboard
  if (path === '/login' && token) {
    return NextResponse.redirect(new URL('/', request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
