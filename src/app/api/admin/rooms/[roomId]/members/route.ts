import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

// GET /api/admin/rooms/[roomId]/members
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    if (!user?.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { roomId } = await params;

    const members = await prisma.roomMember.findMany({
      where: { roomId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            isBanned: true,
            lastSeen: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error('GET /api/admin/rooms/[roomId]/members error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// POST /api/admin/rooms/[roomId]/members - Add member
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    if (!user?.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { roomId } = await params;
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    // Check if room exists
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    // Check if user exists
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if already a member
    const existing = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });
    if (existing) {
      return NextResponse.json({ error: 'Already a member' }, { status: 400 });
    }

    // Add member
    await prisma.roomMember.create({
      data: { userId, roomId },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('POST /api/admin/rooms/[roomId]/members error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// DELETE /api/admin/rooms/[roomId]/members - Remove member
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    if (!user?.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { roomId } = await params;
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    // Check if member exists
    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });
    if (!member) {
      return NextResponse.json({ error: 'Not a member' }, { status: 404 });
    }

    // Cannot remove last member
    const memberCount = await prisma.roomMember.count({ where: { roomId } });
    if (memberCount <= 1) {
      return NextResponse.json({ error: 'Cannot remove last member' }, { status: 400 });
    }

    // Remove member
    await prisma.roomMember.delete({
      where: { userId_roomId: { userId, roomId } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/admin/rooms/[roomId]/members error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
