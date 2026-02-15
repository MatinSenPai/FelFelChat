import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { statSync, readdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getDirSize(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;
  let total = 0;
  try {
    const files = readdirSync(dirPath, { recursive: true, withFileTypes: true });
    for (const file of files) {
      if (file.isFile()) {
        try {
          const fullPath = path.join(file.parentPath || file.path || dirPath, file.name);
          total += statSync(fullPath).size;
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
  return total;
}

export async function GET() {
  try {
    const [totalUsers, totalMessages, totalRooms] = await Promise.all([
      prisma.user.count(),
      prisma.message.count(),
      prisma.room.count(),
    ]);

    // DB file size
    const dbPath = path.resolve(process.cwd(), 'prisma/dev.db');
    const dbSize = existsSync(dbPath) ? statSync(dbPath).size : 0;

    // Uploads size
    const uploadsDir = process.env.UPLOAD_DIR || './uploads';
    const uploadsSize = getDirSize(uploadsDir);

    // Free disk space
    let freeSpace = 0;
    try {
      const dfOutput = execSync('df -B1 . | tail -1').toString().trim();
      const parts = dfOutput.split(/\s+/);
      freeSpace = parseInt(parts[3] || '0');
    } catch {
      freeSpace = 0;
    }

    return NextResponse.json({
      totalUsers,
      totalMessages,
      totalRooms,
      onlineUsers: 0, // Will be updated via socket
      dbSize: formatBytes(dbSize),
      uploadsSize: formatBytes(uploadsSize),
      freeSpace: formatBytes(freeSpace),
      activeCall: null, // Will be updated via socket
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
