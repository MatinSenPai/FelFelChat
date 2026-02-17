import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { enforceRateLimit } from '@/lib/rateLimit';
import { requireAuth } from '@/lib/routeAuth';
import { captureServerException } from '@/lib/monitoring';
import { logError } from '@/lib/logger';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE_MB || '5') * 1024 * 1024;
const UPLOAD_ROOT = path.resolve(process.cwd(), UPLOAD_DIR);
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'application/pdf',
  'text/plain',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
};

const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
};

function detectFileType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg';
  }
  if (buffer.length >= 6) {
    const sig = buffer.subarray(0, 6).toString('ascii');
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif';
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return 'video/mp4';
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF') {
    return 'application/pdf';
  }

  // Simple plain-text heuristic.
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  if (sample.length === 0) return 'text/plain';

  let suspicious = 0;
  for (const byte of sample) {
    const isPrintable = (byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13;
    if (!isPrintable) suspicious += 1;
  }
  if (suspicious / sample.length < 0.05) return 'text/plain';

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const rateLimited = enforceRateLimit(req, 'upload', {
      windowMs: 10 * 60 * 1000,
      max: 60,
    });
    if (rateLimited) return rateLimited;

    const auth = requireAuth(req);
    if (!auth.ok) return auth.response;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const originalExt = path.extname(file.name).toLowerCase();
    const expectedMime = EXT_TO_MIME[originalExt];
    if (!expectedMime || expectedMime !== file.type) {
      return NextResponse.json({ error: 'Invalid file extension or MIME type' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detectedType = detectFileType(buffer);
    if (!detectedType || detectedType !== file.type) {
      return NextResponse.json({ error: 'File content does not match declared type' }, { status: 400 });
    }

    // Ensure upload directory exists
    if (!existsSync(UPLOAD_ROOT)) {
      await mkdir(UPLOAD_ROOT, { recursive: true });
    }

    // Generate unique filename
    const filename = `${randomUUID()}${MIME_TO_EXT[file.type]}`;
    const filepath = path.join(UPLOAD_ROOT, filename);
    await writeFile(filepath, buffer);

    const fileUrl = `/uploads/${filename}`;

    return NextResponse.json({
      fileUrl,
      fileSize: file.size,
      fileName: file.name,
    });
  } catch (error) {
    logError('api.upload.error', { error: String(error) });
    captureServerException(error, { route: '/api/upload' });
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
