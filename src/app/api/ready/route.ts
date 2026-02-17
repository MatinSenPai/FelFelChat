import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {
    env: { ok: true },
    database: { ok: true },
    uploadsDir: { ok: true },
    backupDir: { ok: true },
  };

  const requiredEnvs = ['JWT_SECRET', 'APP_ORIGIN', 'BACKUP_SIGNING_KEY'];
  const missing = requiredEnvs.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    checks.env = { ok: false, detail: `Missing env vars: ${missing.join(', ')}` };
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    checks.database = { ok: false, detail: String(error) };
  }

  const uploadsDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
  const backupDir = path.resolve(process.cwd(), process.env.BACKUP_DIR || './backups');

  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.access(uploadsDir, fs.constants.W_OK);
  } catch (error) {
    checks.uploadsDir = { ok: false, detail: String(error) };
  }

  try {
    await fs.mkdir(backupDir, { recursive: true });
    await fs.access(backupDir, fs.constants.W_OK);
  } catch (error) {
    checks.backupDir = { ok: false, detail: String(error) };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    {
      status: allOk ? 'ready' : 'not-ready',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
