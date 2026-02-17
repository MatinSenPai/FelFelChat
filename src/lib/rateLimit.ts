import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  windowMs: number;
  max: number;
}

interface BucketState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketState>();

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ip = forwardedFor.split(',')[0]?.trim();
    if (ip) return ip;
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;

  return 'unknown';
}

function cleanupExpiredBuckets(now: number): void {
  if (buckets.size < 5000) return;
  for (const [key, state] of buckets.entries()) {
    if (now >= state.resetAt) {
      buckets.delete(key);
    }
  }
}

export function enforceRateLimit(
  req: NextRequest,
  scope: string,
  config: RateLimitConfig
): NextResponse | null {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const ip = getClientIp(req);
  const key = `${scope}:${ip}`;
  const current = buckets.get(key);

  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return null;
  }

  if (current.count >= config.max) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return NextResponse.json(
      { error: 'Too many requests', retryAfter },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      }
    );
  }

  current.count += 1;
  buckets.set(key, current);
  return null;
}
