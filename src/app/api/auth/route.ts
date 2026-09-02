import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    
    // Controlla la password. Se non è settata nel file .env, il default è "admin"
    const correctPassword = process.env.ADMIN_PASSWORD || 'admin';

    if (password === correctPassword) {
      // Crea la risposta di successo
      const response = NextResponse.json({ success: true });
      
      // Imposta il cookie di autenticazione (valido per 7 giorni)
      response.cookies.set('auth_token', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7 // 1 settimana
      });
      
      return response;
    } else {
      return NextResponse.json({ error: 'Password non valida' }, { status: 401 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 });
  }
}
