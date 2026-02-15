import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

// GET /api/users — list all users (for starting new chats)
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const search = req.nextUrl.searchParams.get('search') || '';

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: user.id } },
          { isBanned: false },
          ...(search
            ? [{
                OR: [
                  { username: { contains: search } },
                  { displayName: { contains: search } },
                ],
              }]
            : []),
        ],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        lastSeen: true,
      },
      orderBy: { username: 'asc' },
      take: 50,
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('GET /api/users error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
