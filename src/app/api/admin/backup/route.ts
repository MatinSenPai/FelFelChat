import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import path from 'path';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// GET — list backups
export async function GET() {
  try {
    const backupDir = process.env.BACKUP_DIR || './backups';

    if (!existsSync(backupDir)) {
      return NextResponse.json({ backups: [] });
    }

    const files = readdirSync(backupDir)
      .filter((f) => f.endsWith('.tar.gz') || f.endsWith('.sqlite'))
      .map((filename) => {
        const filePath = path.join(backupDir, filename);
        const stat = statSync(filePath);
        return {
          filename,
          size: formatBytes(stat.size),
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Also get BackupLog entries
    const logs = await prisma.backupLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ backups: files, logs });
  } catch (error) {
    console.error('Backup list error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// POST — create/restore/delete backup
export async function POST(req: NextRequest) {
  try {
    const { action, filename, note } = await req.json();
    const backupDir = path.resolve(process.env.BACKUP_DIR || './backups');
    const dbPath = path.resolve(process.cwd(), 'prisma/dev.db');

    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    switch (action) {
      case 'create': {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFilename = `felfel-backup-${timestamp}.sqlite`;
        const backupPath = path.join(backupDir, backupFilename);

        // VACUUM INTO creates a clean copy
        await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPath}'`);

        const stat = statSync(backupPath);

        await prisma.backupLog.create({
          data: {
            filename: backupFilename,
            size: stat.size,
            note: note || null,
          },
        });

        return NextResponse.json({
          success: true,
          backup: {
            filename: backupFilename,
            size: formatBytes(stat.size),
            createdAt: new Date().toISOString(),
          },
        });
      }

      case 'restore': {
        if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });

        const restorePath = path.join(backupDir, filename);
        if (!existsSync(restorePath)) {
          return NextResponse.json({ error: 'Backup file not found' }, { status: 404 });
        }

        // Safety: create a backup before restore
        const safetyName = `pre-restore-${Date.now()}.sqlite`;
        try {
          await prisma.$executeRawUnsafe(`VACUUM INTO '${path.join(backupDir, safetyName)}'`);
        } catch { /* skip safety backup if fails */ }

        // Disconnect Prisma
        await prisma.$disconnect();

        // Copy backup over current DB
        execSync(`cp "${restorePath}" "${dbPath}"`);

        return NextResponse.json({ success: true, message: 'Restored. Restart server to apply.' });
      }

      case 'delete': {
        if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });

        const deletePath = path.join(backupDir, filename);
        if (existsSync(deletePath)) {
          unlinkSync(deletePath);
        }

        // Remove from BackupLog
        await prisma.backupLog.deleteMany({ where: { filename } });

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Backup action error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
