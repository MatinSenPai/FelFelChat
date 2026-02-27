import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/jwt';
import { enforceRateLimit } from '@/lib/rateLimit';
import { logError, logInfo } from '@/lib/logger';
import { captureServerException } from '@/lib/monitoring';

export async function POST(req: NextRequest) {
  try {
    const rateLimited = enforceRateLimit(req, 'auth-login', {
      windowMs: 15 * 60 * 1000,
      max: 20,
    });
    if (rateLimited) return rateLimited;

    let username: string | null = null;
    let password: string | null = null;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      // Handle JSON payload (from fetch)
      const body = await req.json();
      username = body.username;
      password = body.password;
    } else {
      // Handle form-encoded payload (from HTML form)
      const formData = await req.formData();
      username = formData.get('username') as string | null;
      password = formData.get('password') as string | null;
    }

    if (!username || !password) {
      return NextResponse.json({ error: 'invalidCredentials' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return NextResponse.json({ error: 'invalidCredentials' }, { status: 401 });
    }

    if (user.isBanned) {
      return NextResponse.json({ error: 'banned' }, { status: 403 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: 'invalidCredentials' }, { status: 401 });
    }

    // Update lastSeen
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date() },
    });

    const token = signToken({
      id: user.id,
      username: user.username,
      isSuperAdmin: user.isSuperAdmin,
    });

    logInfo('api.auth.login.success', { username: user.username });

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
    logError('api.auth.login.error', { error: message, stack });
    captureServerException(error, { route: '/api/auth/login' });
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
