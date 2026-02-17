import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/logger';
import { captureServerException } from '@/lib/monitoring';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        isSuperAdmin: true,
        isBanned: true,
      },
    });

    if (!user || user.isBanned) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    logError('api.auth.me.error', { error: String(error) });
    captureServerException(error, { route: '/api/auth/me' });
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
