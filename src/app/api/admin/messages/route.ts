import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/admin/messages — list recent messages
export async function GET(req: NextRequest) {
  try {
    const messages = await prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { username: true } },
        room: { select: { name: true } },
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Admin messages error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// POST /api/admin/messages — delete message(s)
export async function POST(req: NextRequest) {
  try {
    const { action, messageId, messageIds } = await req.json();

    switch (action) {
      case 'delete':
        if (messageId) {
          await prisma.message.delete({ where: { id: messageId } });
        }
        break;
      case 'deleteBulk':
        if (messageIds && Array.isArray(messageIds)) {
          await prisma.message.deleteMany({ where: { id: { in: messageIds } } });
        }
        break;
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin messages action error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
