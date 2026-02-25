import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { execFileSync } from 'child_process';
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

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  return databaseUrl;
}

function runMongoTool(binary: string, args: string[]): void {
  try {
    execFileSync(binary, args, { stdio: 'pipe' });
  } catch (error) {
    throw new Error(`${binary} failed: ${String(error)}`);
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    const backupDir = process.env.BACKUP_DIR || './backups';

    if (!existsSync(backupDir)) {
      return NextResponse.json({ backups: [] });
    }

    const files = readdirSync(backupDir)
      .filter((f) => f.endsWith('.archive.gz') || f.endsWith('.tar.gz'))
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

export async function POST(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    const { action, filename, note } = await req.json();
    const backupDir = path.resolve(process.env.BACKUP_DIR || './backups');
    const databaseUrl = getDatabaseUrl();

    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    switch (action) {
      case 'create': {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFilename = `felfel-backup-${timestamp}.archive.gz`;
        const backupPath = path.join(backupDir, backupFilename);
        const metaPath = path.join(backupDir, getMetaFilename(backupFilename));

        runMongoTool('mongodump', [`--uri=${databaseUrl}`, `--archive=${backupPath}`, '--gzip']);

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

        const safetyName = `pre-restore-${Date.now()}.archive.gz`;
        try {
          runMongoTool('mongodump', [`--uri=${databaseUrl}`, `--archive=${path.join(backupDir, safetyName)}`, '--gzip']);
        } catch {}
        runMongoTool('mongorestore', [`--uri=${databaseUrl}`, `--archive=${restorePath}`, '--gzip', '--drop']);

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
