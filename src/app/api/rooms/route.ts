import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

// GET /api/rooms — list rooms for current user
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rooms = await prisma.room.findMany({
      where: {
        members: { some: { userId: user.id } },
      },
      include: {
        members: {
          include: { user: { select: { id: true, username: true, displayName: true, lastSeen: true } } },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { user: { select: { username: true } } },
        },
        _count: { select: { messages: true, members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ rooms });
  } catch (error) {
    console.error('GET /api/rooms error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// POST /api/rooms — create room
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name, type, memberIds } = await req.json();

    // GROUP and CHANNEL: superadmin only
    if ((type === 'GROUP' || type === 'CHANNEL') && !user.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // PRIVATE: between two users
    if (type === 'PRIVATE') {
      if (!memberIds || memberIds.length !== 1) {
        return NextResponse.json({ error: 'Private chat needs exactly one other user' }, { status: 400 });
      }

      // Check if private chat already exists between these two users
      const existingRoom = await prisma.room.findFirst({
        where: {
          type: 'PRIVATE',
          AND: [
            { members: { some: { userId: user.id } } },
            { members: { some: { userId: memberIds[0] } } },
          ],
        },
        include: {
          members: {
            include: { user: { select: { id: true, username: true, displayName: true } } },
          },
        },
      });

      if (existingRoom) {
        return NextResponse.json({ room: existingRoom });
      }
    }

    const room = await prisma.room.create({
      data: {
        name: name || 'Chat',
        type: type || 'GROUP',
        createdBy: user.id,
        members: {
          create: [
            { userId: user.id },
            ...(memberIds || []).map((id: string) => ({ userId: id })),
          ],
        },
      },
      include: {
        members: {
          include: { user: { select: { id: true, username: true, displayName: true } } },
        },
      },
    });

    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    console.error('POST /api/rooms error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
