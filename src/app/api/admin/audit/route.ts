import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { requireSuperAdmin } from '@/lib/routeAuth';

interface AuditLogItem {
  timestamp: string;
  adminUserId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  path: string;
  method: string;
  ip: string;
  userAgent: string;
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    const limitParam = parseInt(req.nextUrl.searchParams.get('limit') || '200', 10);
    const limit = Math.max(1, Math.min(limitParam, 1000));
    const logPath = path.resolve(process.cwd(), process.env.AUDIT_LOG_DIR || './logs', 'admin-audit.log');

    let content = '';
    try {
      content = await readFile(logPath, 'utf8');
    } catch {
      return NextResponse.json({ logs: [], total: 0 });
    }

    const lines = content.split('\n').filter(Boolean);
    const logs: AuditLogItem[] = [];

    for (let i = lines.length - 1; i >= 0 && logs.length < limit; i -= 1) {
      try {
        logs.push(JSON.parse(lines[i]) as AuditLogItem);
      } catch {
        // Skip malformed lines.
      }
    }

    return NextResponse.json({
      logs,
      total: lines.length,
    });
  } catch (error) {
    console.error('GET /api/admin/audit error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
