import { NextRequest } from 'next/server';
import { mkdir, appendFile } from 'fs/promises';
import path from 'path';

interface AdminAuditEntry {
  adminUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ip = forwardedFor.split(',')[0]?.trim();
    if (ip) return ip;
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function logAdminAction(req: NextRequest, entry: AdminAuditEntry): Promise<void> {
  try {
    const logDir = path.resolve(process.cwd(), process.env.AUDIT_LOG_DIR || './logs');
    await mkdir(logDir, { recursive: true });
    const logPath = path.join(logDir, 'admin-audit.log');

    const payload = {
      timestamp: new Date().toISOString(),
      ...entry,
      path: req.nextUrl.pathname,
      method: req.method,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent') || 'unknown',
    };

    await appendFile(logPath, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch (error) {
    console.error('Failed to write admin audit log:', error);
  }
}
