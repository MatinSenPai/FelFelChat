import { createHash, createHmac } from 'crypto';
import { readFile, writeFile } from 'fs/promises';

export interface BackupSignature {
  version: 1;
  file: string;
  createdAt: string;
  sha256: string;
  hmacSha256: string;
}

function getSigningKey(): string {
  const key = process.env.BACKUP_SIGNING_KEY;
  if (!key) {
    throw new Error('BACKUP_SIGNING_KEY is required for backup signing');
  }
  return key;
}

function hashBufferSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function hmacSha256(input: string, key: string): string {
  return createHmac('sha256', key).update(input).digest('hex');
}

export async function createBackupSignature(filePath: string, fileName: string): Promise<BackupSignature> {
  const key = getSigningKey();
  const buffer = await readFile(filePath);
  const sha256 = hashBufferSha256(buffer);
  const hmac = hmacSha256(sha256, key);

  return {
    version: 1,
    file: fileName,
    createdAt: new Date().toISOString(),
    sha256,
    hmacSha256: hmac,
  };
}

export async function writeBackupSignature(metaPath: string, signature: BackupSignature): Promise<void> {
  await writeFile(metaPath, JSON.stringify(signature, null, 2), 'utf8');
}

export async function verifyBackupSignature(filePath: string, metaPath: string, fileName: string): Promise<void> {
  const key = getSigningKey();

  const [metaRaw, fileBuffer] = await Promise.all([readFile(metaPath, 'utf8'), readFile(filePath)]);
  const meta = JSON.parse(metaRaw) as BackupSignature;

  if (meta.version !== 1 || meta.file !== fileName || !meta.sha256 || !meta.hmacSha256) {
    throw new Error('Invalid backup signature metadata');
  }

  const actualHash = hashBufferSha256(fileBuffer);
  if (actualHash !== meta.sha256) {
    throw new Error('Backup hash mismatch');
  }

  const expectedHmac = hmacSha256(actualHash, key);
  if (expectedHmac !== meta.hmacSha256) {
    throw new Error('Backup HMAC signature mismatch');
  }
}
