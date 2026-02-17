import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/routeAuth';
import { logAdminAction } from '@/lib/auditLog';

// GET /api/admin/users — list all users
export async function GET(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        isSuperAdmin: true,
        isBanned: true,
        createdAt: true,
        lastSeen: true,
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ users });
  } catch (error) {
    console.error('Admin users error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// POST /api/admin/users — ban/unban/delete user
export async function POST(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    const { action, userId } = await req.json();

    switch (action) {
      case 'ban':
        await prisma.user.update({ where: { id: userId }, data: { isBanned: true } });
        break;
      case 'unban':
        await prisma.user.update({ where: { id: userId }, data: { isBanned: false } });
        break;
      case 'delete':
        await prisma.user.delete({ where: { id: userId } });
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await logAdminAction(req, {
      adminUserId: auth.user.id,
      action: `admin.users.${action}`,
      targetType: 'user',
      targetId: userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin user action error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
