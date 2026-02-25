import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/jwt';
import { enforceRateLimit } from '@/lib/rateLimit';
import { captureServerException } from '@/lib/monitoring';
import { logError } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const rateLimited = enforceRateLimit(req, 'auth-signup', {
      windowMs: 60 * 60 * 1000,
      max: 10,
    });
    if (rateLimited) return rateLimited;

    // Check if registration is enabled
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
    });

    if (settings && !settings.registrationEnabled) {
      return NextResponse.json({ error: 'registrationDisabled' }, { status: 403 });
    }

    const { username, password, displayName } = await req.json();

    if (!username || username.length < 3 || username.length > 20) {
      return NextResponse.json({ error: 'usernameMin' }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json({ error: 'invalidUsername' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'passwordMin' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: 'usernameTaken' }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        displayName: displayName || username,
        password: hashed,
        isSuperAdmin: false,
      },
    });

    const token = signToken({
      id: user.id,
      username: user.username,
      isSuperAdmin: user.isSuperAdmin,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        isSuperAdmin: user.isSuperAdmin,
      },
    });

    const isHttps = (process.env.APP_ORIGIN || '').startsWith('https');
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logError('api.auth.signup.error', { error: message, stack });
    captureServerException(error, { route: '/api/auth/signup' });
    const includeDebug = process.env.NODE_ENV !== 'production' || process.env.FELFEL_DEBUG_ERRORS === '1';
    let errorCode = 'serverError';
    if (message.includes('JWT_SECRET')) {
      errorCode = 'jwtSecretMissing';
    } else if (message.includes('Prisma') || message.includes('Mongo') || message.includes('P10')) {
      errorCode = 'databaseError';
    }
    return NextResponse.json(
      includeDebug ? { error: errorCode, debug: message } : { error: errorCode },
      { status: 500 }
    );
  }
}
