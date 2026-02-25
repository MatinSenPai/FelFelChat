import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { getSocketServer } from '@/lib/socketServer';

// GET /api/messages/[roomId] — paginated messages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { roomId } = await params;

    // Check user is member of room
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const cursor = req.nextUrl.searchParams.get('cursor');
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 100);

    const messages = await prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        replyTo: {
          select: {
            id: true,
            text: true,
            fileUrl: true,
            fileName: true,
            mimeType: true,
            userId: true,
            replyToId: true,
            createdAt: true,
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    return NextResponse.json({
      messages: messages.reverse(),
      nextCursor: hasMore ? messages[0]?.id : null,
    });
  } catch (error) {
    console.error('GET /api/messages error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// POST /api/messages/[roomId] — send message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { roomId } = await params;

    // Check membership
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId: user.id, roomId } },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    // Check if CHANNEL — only superadmin can post
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    if (room.type === 'CHANNEL' && !user.isSuperAdmin) {
      return NextResponse.json({ error: 'Only superadmin can post in channels' }, { status: 403 });
    }

    const body = await req.json() as {
      text?: string | null;
      fileUrl?: string | null;
      fileName?: string | null;
      fileSize?: number | null;
      mimeType?: string | null;
      messageType?: string | null;
      replyToId?: string | null;
    };
    const { text, fileUrl, fileName, fileSize, mimeType, messageType, replyToId } = body;

    // Validate message based on type
    const validMessageTypes = ['text', 'file', 'sticker', 'gif'];
    const msgType = messageType || 'text';
    
    if (!validMessageTypes.includes(msgType)) {
      return NextResponse.json({ error: 'Invalid message type' }, { status: 400 });
    }
    
    if (msgType === 'sticker' || msgType === 'gif') {
      if (!fileUrl) {
        return NextResponse.json({ error: 'Sticker/GIF requires fileUrl' }, { status: 400 });
      }
    } else if (!text && !fileUrl) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    const isEncryptedEnvelope = typeof text === 'string' && text.startsWith('hush:v1:');
    const maxTextLength = isEncryptedEnvelope ? 12000 : 2000;
    if (text && text.length > maxTextLength) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 });
    }

    // Validate replyToId if provided
    if (replyToId) {
      const replyToMessage = await prisma.message.findUnique({
        where: { id: replyToId },
      });
      if (!replyToMessage || replyToMessage.roomId !== roomId) {
        return NextResponse.json({ error: 'Invalid reply target' }, { status: 400 });
      }
    }

    const message = await prisma.message.create({
      data: {
        text: text || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
        messageType: msgType,
        userId: user.id,
        roomId,
        replyToId: replyToId || null,
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        replyTo: {
          select: {
            id: true,
            text: true,
            fileUrl: true,
            fileName: true,
            mimeType: true,
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    try {
      const io = getSocketServer();
      if (io) {
        const roomMembers = await prisma.roomMember.findMany({
          where: { roomId },
          select: { userId: true },
        });
        for (const member of roomMembers) {
          io.to(`user:${member.userId}`).emit('message:new', { roomId, message });
        }
      }
    } catch (socketError) {
      console.error('POST /api/messages socket emit error:', socketError);
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error('POST /api/messages error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
