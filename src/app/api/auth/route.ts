import { NextResponse } from 'next/server';
import { findUserByEmail, hasAnyUser, upsertUser, saveAppSettings, getAppSettings } from '@/lib/db';
import { SessionUser } from '@/lib/auth';

export async function GET() {
  try {
    const anyUser = await hasAnyUser();
    return NextResponse.json({ needsSetup: !anyUser });
  } catch {
    return NextResponse.json({ needsSetup: true });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mode = body.mode || 'login';
    const emailRaw = (body.email || '').trim().toLowerCase();
    const passwordRaw = (body.password || '').trim();

    if (!emailRaw || !passwordRaw) {
      return NextResponse.json(
        { error: 'Inserisci sia l’email che la password.' },
        { status: 400 }
      );
    }

    // PRIMO AVVIO: creazione del primo account Amministratore scelto dall'azienda
    if (mode === 'setup') {
      const anyUser = await hasAnyUser();
      if (anyUser) {
        return NextResponse.json(
          { error: 'Il sistema ha già un amministratore configurato. Effettua il login.' },
          { status: 403 }
        );
      }

      const nameRaw = (body.name || 'Amministratore').trim();
      const instanceNameRaw = (body.instance_name || '').trim();
      const hardwareHostRaw = (body.hardware_host || '').trim();

      if (instanceNameRaw || hardwareHostRaw) {
        const currentSettings = await getAppSettings();
        await saveAppSettings({
          instance_name: instanceNameRaw || currentSettings.instance_name,
          hardware_host: hardwareHostRaw || currentSettings.hardware_host,
          environment_label: currentSettings.environment_label || 'Infrastruttura Proxmox VE',
        });
      }

      const created = await upsertUser({
        name: nameRaw,
        email: emailRaw,
        password: passwordRaw,
        role: 'admin',
      });

      const sessionUser: SessionUser = {
        id: created.id,
        name: created.name,
        email: created.email,
        role: 'admin',
      };

      const response = NextResponse.json({
        success: true,
        user: sessionUser,
      });

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      };

      response.cookies.set('auth_token', 'authenticated', cookieOptions);
      response.cookies.set(
        'auth_user',
        Buffer.from(JSON.stringify(sessionUser), 'utf-8').toString('base64'),
        cookieOptions
      );

      return response;
    }

    // LOGIN ORDINARIO
    const dbUser = await findUserByEmail(emailRaw);
    if (!dbUser || dbUser.password !== passwordRaw) {
      return NextResponse.json(
        { error: 'Credenziali non valide. Controlla email e password.' },
        { status: 401 }
      );
    }

    const matchedUser: SessionUser = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
    };

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
