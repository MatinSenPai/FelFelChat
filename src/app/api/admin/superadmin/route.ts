import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

const prisma = new PrismaClient();

function getTokenUserId(request: NextRequest): string | null {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get('token')?.value;
    if (!token) return null;
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    const payload = jwt.verify(token, secret) as { userId: string };
    return payload.userId ?? null;
  } catch {
    return null;
  }
}

// GET /api/admin/superadmin — returns current superadmin info (masked)
export async function GET(request: NextRequest) {
  const userId = getTokenUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, isSuperAdmin: true },
  });

  if (!me?.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ user: me });
}

// PUT /api/admin/superadmin — change superadmin username/displayName/password
export async function PUT(request: NextRequest) {
  const userId = getTokenUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isSuperAdmin: true, password: true },
  });

  if (!me?.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalidBody' }, { status: 400 });
  }

  const { currentPassword, newPassword, newUsername, newDisplayName } = body as {
    currentPassword?: string;
    newPassword?: string;
    newUsername?: string;
    newDisplayName?: string;
  };

  // Require current password to make any change
  if (!currentPassword || typeof currentPassword !== 'string') {
    return NextResponse.json({ error: 'currentPasswordRequired' }, { status: 400 });
  }

  const passwordMatch = await bcrypt.compare(currentPassword, me.password);
  if (!passwordMatch) {
    return NextResponse.json({ error: 'wrongPassword' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};

  if (newPassword && typeof newPassword === 'string') {
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'passwordTooShort' }, { status: 400 });
    }
    updateData.password = await bcrypt.hash(newPassword, 12);
  }

  if (newUsername && typeof newUsername === 'string') {
    if (newUsername.length < 3 || !/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      return NextResponse.json({ error: 'invalidUsername' }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { username: newUsername } });
    if (existing && existing.id !== me.id) {
      return NextResponse.json({ error: 'usernameTaken' }, { status: 409 });
    }
    updateData.username = newUsername;
  }

  if (typeof newDisplayName === 'string') {
    updateData.displayName = newDisplayName || null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'nothingToUpdate' }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: me.id },
    data: updateData,
    select: { id: true, username: true, displayName: true, isSuperAdmin: true },
  });

  return NextResponse.json({ user: updated });
}
