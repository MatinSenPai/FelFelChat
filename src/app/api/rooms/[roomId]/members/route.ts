import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/rooms/:roomId/members - Fetch all members of a room
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await context.params;

    if (!roomId) {
      return NextResponse.json({ error: 'missingRoomId' }, { status: 400 });
    }

    // Fetch room with members
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                bio: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!room) {
      return NextResponse.json({ error: 'roomNotFound' }, { status: 404 });
    }

    return NextResponse.json({
      members: room.members,
      total: room.members.length,
    });
  } catch (error) {
    console.error('Fetch room members error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
