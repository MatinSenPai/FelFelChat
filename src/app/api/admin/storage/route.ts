import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { unlinkSync, existsSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { requireSuperAdmin } from '@/lib/routeAuth';
import { logAdminAction } from '@/lib/auditLog';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function getMongoDbSizeBytes(): Promise<number> {
  try {
    const dbStatsRaw = await prisma.$runCommandRaw({ dbStats: 1 });
    const dbStats = dbStatsRaw as Record<string, unknown>;
    const dbSizeCandidate = dbStats.storageSize ?? dbStats.dataSize ?? dbStats.totalSize ?? 0;
    const dbSize = Number(typeof dbSizeCandidate === 'number' ? dbSizeCandidate : 0);
    return Number.isFinite(dbSize) ? dbSize : 0;
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    const uploadsDir = process.env.UPLOAD_DIR || './uploads';
    const backupsDir = process.env.BACKUP_DIR || './backups';
    const dbSize = await getMongoDbSizeBytes();

    let uploadsSize = 0;
    let uploadsCount = 0;
    if (existsSync(uploadsDir)) {
      const files = readdirSync(uploadsDir);
      for (const f of files) {
        try {
          const s = statSync(path.join(uploadsDir, f));
          if (s.isFile()) { uploadsSize += s.size; uploadsCount++; }
        } catch {}
      }
    }

    let backupsSize = 0;
    if (existsSync(backupsDir)) {
      const files = readdirSync(backupsDir);
      for (const f of files) {
        try {
          backupsSize += statSync(path.join(backupsDir, f)).size;
        } catch {}
      }
    }

    let totalDisk = 0, usedDisk = 0, freeDisk = 0;
    try {
      const dfOutput = execSync('df -B1 . | tail -1').toString().trim();
      const parts = dfOutput.split(/\s+/);
      totalDisk = parseInt(parts[1] || '0');
      usedDisk = parseInt(parts[2] || '0');
      freeDisk = parseInt(parts[3] || '0');
    } catch {}

    const roomStats = await prisma.room.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json({
      totalDisk: formatBytes(totalDisk),
      usedDisk: formatBytes(usedDisk),
      freeDisk: formatBytes(freeDisk),
      freeDiskBytes: freeDisk,
      dbSize: formatBytes(dbSize),
      uploadsSize: formatBytes(uploadsSize),
      uploadsCount,
      backupsSize: formatBytes(backupsSize),
      rooms: roomStats,
    });
  } catch (error) {
    console.error('Storage stats error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    const { action, params } = await req.json();

    switch (action) {
      case 'delete-old-messages': {
        const days = params?.days || 30;
        const cutoff = new Date(Date.now() - days * 86400000);

        const oldMessages = await prisma.message.findMany({
          where: { createdAt: { lt: cutoff }, fileUrl: { not: null } },
          select: { fileUrl: true },
        });
        for (const msg of oldMessages) {
          if (msg.fileUrl) {
            const filePath = path.join(process.cwd(), msg.fileUrl);
            if (existsSync(filePath)) try { unlinkSync(filePath); } catch {}
          }
        }

        const result = await prisma.message.deleteMany({ where: { createdAt: { lt: cutoff } } });
        await logAdminAction(req, {
          adminUserId: auth.user.id,
          action: 'admin.storage.delete-old-messages',
          targetType: 'message',
          details: { days, deleted: result.count },
        });
        return NextResponse.json({ deleted: result.count });
      }

      case 'delete-room-content': {
        const roomId = params?.roomId;
        if (!roomId) return NextResponse.json({ error: 'roomId required' }, { status: 400 });

        const filesInRoom = await prisma.message.findMany({
          where: { roomId, fileUrl: { not: null } },
          select: { fileUrl: true },
        });
        for (const msg of filesInRoom) {
          if (msg.fileUrl) {
            const filePath = path.join(process.cwd(), msg.fileUrl);
            if (existsSync(filePath)) try { unlinkSync(filePath); } catch {}
          }
        }

        const result = await prisma.message.deleteMany({ where: { roomId } });
        await logAdminAction(req, {
          adminUserId: auth.user.id,
          action: 'admin.storage.delete-room-content',
          targetType: 'room',
          targetId: roomId,
          details: { deleted: result.count },
        });
        return NextResponse.json({ deleted: result.count });
      }

      case 'vacuum': {
        const collections = ['User', 'Room', 'VoiceCall', 'Settings', 'Sticker', 'Gif', 'RoomMember', 'Message', 'CallLog', 'BackupLog'];
        let compactedCollections = 0;
        for (const collection of collections) {
          try {
            await prisma.$runCommandRaw({ compact: collection });
            compactedCollections += 1;
          } catch {}
        }
        await prisma.$runCommandRaw({ dbStats: 1 });
        await logAdminAction(req, {
          adminUserId: auth.user.id,
          action: 'admin.storage.vacuum',
          targetType: 'database',
          targetId: 'main',
          details: { compactedCollections },
        });
        return NextResponse.json({ success: true, compactedCollections });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Storage cleanup error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
