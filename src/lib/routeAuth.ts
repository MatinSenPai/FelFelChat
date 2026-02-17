import { NextRequest, NextResponse } from 'next/server';
import { JwtPayload, verifyToken } from '@/lib/jwt';
import { enforceRateLimit } from '@/lib/rateLimit';

type AuthResult =
  | { ok: true; user: JwtPayload }
  | { ok: false; response: NextResponse };

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function enforceSameOrigin(req: NextRequest): NextResponse | null {
  if (!UNSAFE_METHODS.has(req.method.toUpperCase())) return null;

  const allowedOrigin = process.env.APP_ORIGIN || req.nextUrl.origin;
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const fetchSite = req.headers.get('sec-fetch-site');

  if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
    return NextResponse.json({ error: 'Forbidden (CSRF)' }, { status: 403 });
  }

  if (origin) {
    if (origin !== allowedOrigin) {
      return NextResponse.json({ error: 'Forbidden (CSRF)' }, { status: 403 });
    }
    return null;
  }

  if (referer) {
    if (!referer.startsWith(`${allowedOrigin}/`) && referer !== allowedOrigin) {
      return NextResponse.json({ error: 'Forbidden (CSRF)' }, { status: 403 });
    }
    return null;
  }

  // In production, require at least one origin signal for unsafe requests.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Forbidden (CSRF)' }, { status: 403 });
  }

  return null;
}

export function requireAuth(req: NextRequest): AuthResult {
  const csrfBlocked = enforceSameOrigin(req);
  if (csrfBlocked) {
    return { ok: false, response: csrfBlocked };
  }

  const token = req.cookies.get('token')?.value;
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const user = verifyToken(token);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { ok: true, user };
}

export function requireSuperAdmin(req: NextRequest): AuthResult {
  const rateLimited = enforceRateLimit(req, 'admin-api', {
    windowMs: 60 * 1000,
    max: 120,
  });
  if (rateLimited) {
    return { ok: false, response: rateLimited };
  }

  const auth = requireAuth(req);
  if (!auth.ok) return auth;

  if (!auth.user.isSuperAdmin) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}
