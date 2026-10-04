import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { DEFAULT_USERS, SessionUser } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const emailRaw = (body.email || '').trim().toLowerCase();
    const passwordRaw = (body.password || '').trim();

    if (!emailRaw || !passwordRaw) {
      return NextResponse.json(
        { error: 'Inserisci sia l’email che la password.' },
        { status: 400 }
      );
    }

    let matchedUser: SessionUser | null = null;

    // 1. Cerca prima nel database MySQL (se attivo)
    try {
      const dbUser = await queryOne<any>(
        'SELECT id, name, email, password, role FROM users WHERE LOWER(email) = ?',
        [emailRaw]
      );
      if (dbUser && dbUser.password === passwordRaw) {
        matchedUser = {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role,
        };
      }
    } catch {
      // Se il database non è ancora acceso, usa i profili predefiniti
    }

    // 2. Fallback sui profili predefiniti (così il login funziona sempre anche a DB spento)
    if (!matchedUser) {
      const fallback = DEFAULT_USERS.find(
        (u) => u.email.toLowerCase() === emailRaw && u.password === passwordRaw
      );
      if (fallback) {
        matchedUser = {
          id: fallback.id,
          name: fallback.name,
          email: fallback.email,
          role: fallback.role,
        };
      }
    }

    if (!matchedUser) {
      return NextResponse.json(
        { error: 'Credenziali non valide. Controlla email e password.' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      user: matchedUser,
    });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 60 * 60 * 24 * 7, // 7 giorni
      path: '/',
    };

    response.cookies.set('auth_token', 'authenticated', cookieOptions);
    response.cookies.set(
      'auth_user',
      Buffer.from(JSON.stringify(matchedUser), 'utf-8').toString('base64'),
      cookieOptions
    );

    return response;
  } catch {
    return NextResponse.json({ error: 'Errore interno durante il login' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('auth_token');
  response.cookies.delete('auth_user');
  return response;
}
