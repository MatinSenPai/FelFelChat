import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/jwt';

export async function POST(req: NextRequest) {
  try {
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

    console.log('[/api/auth/login] NODE_ENV:', process.env.NODE_ENV);

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        isSuperAdmin: user.isSuperAdmin,
      },
    });

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: false, // Force false for debugging
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    console.log('[/api/auth/login] Cookie set for user:', user.username);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
