import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import path from 'path';
import { requireSuperAdmin } from '@/lib/routeAuth';
import { logAdminAction } from '@/lib/auditLog';
import {
  createBackupSignature,
  verifyBackupSignature,
  writeBackupSignature,
} from '@/lib/backupIntegrity';
import { logError } from '@/lib/logger';
import { captureServerException } from '@/lib/monitoring';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function isSafeBackupFilename(filename: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(filename);
}

function getMetaFilename(filename: string): string {
  return `${filename}.meta.json`;
}

// GET — list backups
export async function GET(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    const backupDir = process.env.BACKUP_DIR || './backups';

    if (!existsSync(backupDir)) {
      return NextResponse.json({ backups: [] });
    }

    const files = readdirSync(backupDir)
      .filter((f) => f.endsWith('.tar.gz') || f.endsWith('.sqlite'))
      .map((filename) => {
        const filePath = path.join(backupDir, filename);
        const metaPath = path.join(backupDir, getMetaFilename(filename));
        const stat = statSync(filePath);
        return {
          filename,
          size: formatBytes(stat.size),
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
          signed: existsSync(metaPath),
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
    logError('api.admin.backup.list.error', { error: String(error) });
    captureServerException(error, { route: '/api/admin/backup', action: 'list' });
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// POST — create/restore/delete backup
export async function POST(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

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
        const metaPath = path.join(backupDir, getMetaFilename(backupFilename));

        // VACUUM INTO creates a clean copy
        await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPath}'`);

        const stat = statSync(backupPath);
        const signature = await createBackupSignature(backupPath, backupFilename);
        await writeBackupSignature(metaPath, signature);

        await prisma.backupLog.create({
          data: {
            filename: backupFilename,
            size: stat.size,
            note: note || null,
          },
        });

        await logAdminAction(req, {
          adminUserId: auth.user.id,
          action: 'admin.backup.create',
          targetType: 'backup',
          targetId: backupFilename,
        });

        return NextResponse.json({
          success: true,
          backup: {
            filename: backupFilename,
            size: formatBytes(stat.size),
            createdAt: new Date().toISOString(),
            signed: true,
          },
        });
      }

      case 'restore': {
        if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });
        if (!isSafeBackupFilename(filename)) {
          return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
        }

        const restorePath = path.join(backupDir, filename);
        const restoreMetaPath = path.join(backupDir, getMetaFilename(filename));
        if (!existsSync(restorePath)) {
          return NextResponse.json({ error: 'Backup file not found' }, { status: 404 });
        }
        if (!existsSync(restoreMetaPath)) {
          return NextResponse.json({ error: 'Backup signature metadata not found' }, { status: 400 });
        }

        await verifyBackupSignature(restorePath, restoreMetaPath, filename);

        // Safety: create a backup before restore
        const safetyName = `pre-restore-${Date.now()}.sqlite`;
        try {
          await prisma.$executeRawUnsafe(`VACUUM INTO '${path.join(backupDir, safetyName)}'`);
        } catch { /* skip safety backup if fails */ }

        // Disconnect Prisma
        await prisma.$disconnect();

        // Copy backup over current DB
        execSync(`cp "${restorePath}" "${dbPath}"`);

        await logAdminAction(req, {
          adminUserId: auth.user.id,
          action: 'admin.backup.restore',
          targetType: 'backup',
          targetId: filename,
        });

        return NextResponse.json({ success: true, message: 'Restored. Restart server to apply.' });
      }

      case 'delete': {
        if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });
        if (!isSafeBackupFilename(filename)) {
          return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
        }

        const deletePath = path.join(backupDir, filename);
        const deleteMetaPath = path.join(backupDir, getMetaFilename(filename));
        if (existsSync(deletePath)) {
          unlinkSync(deletePath);
        }
        if (existsSync(deleteMetaPath)) {
          unlinkSync(deleteMetaPath);
        }

        // Remove from BackupLog
        await prisma.backupLog.deleteMany({ where: { filename } });

        await logAdminAction(req, {
          adminUserId: auth.user.id,
          action: 'admin.backup.delete',
          targetType: 'backup',
          targetId: filename,
        });

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    logError('api.admin.backup.action.error', { error: String(error) });
    captureServerException(error, { route: '/api/admin/backup', action: 'mutate' });
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
