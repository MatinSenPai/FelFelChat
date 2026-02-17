import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/routeAuth';
import { logAdminAction } from '@/lib/auditLog';

// GET /api/admin/rooms
export async function GET(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

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
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    const { action, roomId, name, type, userId, memberIds } = await req.json();

    switch (action) {
      case 'create': {
        const room = await prisma.room.create({
          data: {
            name,
            type: type || 'GROUP',
            createdBy: auth.user.id,
            members: {
              create: [
                { userId: auth.user.id },
                ...(memberIds || []).map((id: string) => ({ userId: id })),
              ],
            },
          },
        });
        await logAdminAction(req, {
          adminUserId: auth.user.id,
          action: 'admin.rooms.create',
          targetType: 'room',
          targetId: room.id,
          details: { type: room.type, memberCount: (memberIds || []).length + 1 },
        });
        return NextResponse.json({ room }, { status: 201 });
      }

      case 'delete':
        await prisma.message.deleteMany({ where: { roomId } });
        await prisma.roomMember.deleteMany({ where: { roomId } });
        await prisma.room.delete({ where: { id: roomId } });
        await logAdminAction(req, {
          adminUserId: auth.user.id,
          action: 'admin.rooms.delete',
          targetType: 'room',
          targetId: roomId,
        });
        break;

      case 'addMember':
        await prisma.roomMember.create({ data: { userId, roomId } });
        await logAdminAction(req, {
          adminUserId: auth.user.id,
          action: 'admin.rooms.addMember',
          targetType: 'room',
          targetId: roomId,
          details: { userId },
        });
        break;

      case 'removeMember':
        await prisma.roomMember.deleteMany({ where: { userId, roomId } });
        await logAdminAction(req, {
          adminUserId: auth.user.id,
          action: 'admin.rooms.removeMember',
          targetType: 'room',
          targetId: roomId,
          details: { userId },
        });
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
