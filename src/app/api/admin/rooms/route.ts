import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

// GET /api/admin/rooms
export async function GET() {
  try {
    const rooms = await prisma.room.findMany({
      include: {
        members: {
          include: { user: { select: { id: true, username: true, displayName: true } } },
        },
        _count: { select: { messages: true, members: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ rooms });
  } catch (error) {
    console.error('Admin rooms error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// POST /api/admin/rooms — create/delete room, add/remove member
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    if (!user?.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { action, roomId, name, type, userId, memberIds } = await req.json();

    switch (action) {
      case 'create': {
        const room = await prisma.room.create({
          data: {
            name,
            type: type || 'GROUP',
            createdBy: user.id,
            members: {
              create: [
                { userId: user.id },
                ...(memberIds || []).map((id: string) => ({ userId: id })),
              ],
            },
          },
        });
        return NextResponse.json({ room }, { status: 201 });
      }

      case 'delete':
        await prisma.message.deleteMany({ where: { roomId } });
        await prisma.roomMember.deleteMany({ where: { roomId } });
        await prisma.room.delete({ where: { id: roomId } });
        break;

      case 'addMember':
        await prisma.roomMember.create({ data: { userId, roomId } });
        break;

      case 'removeMember':
        await prisma.roomMember.deleteMany({ where: { userId, roomId } });
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin rooms action error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
