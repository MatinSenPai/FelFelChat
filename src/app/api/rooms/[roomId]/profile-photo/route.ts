import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { requireSuperAdmin } from '@/lib/routeAuth';
import { logAdminAction } from '@/lib/auditLog';

// POST /api/rooms/:roomId/profile-photo - Upload room profile photo (superAdmin only)
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await context.params;

    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    // Check room exists and is not PRIVATE
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      return NextResponse.json({ error: 'roomNotFound' }, { status: 404 });
    }

    if (room.type === 'PRIVATE') {
      return NextResponse.json({ error: 'cannotSetPrivateRoomPhoto' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'noFile' }, { status: 400 });
    }

    // Validate file type (images only)
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'invalidFileType' }, { status: 400 });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'fileTooLarge' }, { status: 400 });
    }

    // Create uploads/rooms directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'rooms');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate unique filename
    const timestamp = Date.now();
    const fileExt = path.extname(file.name) || '.jpg';
    const fileName = `${roomId}_${timestamp}${fileExt}`;
    const filePath = path.join(uploadDir, fileName);

    // Write file to disk
    await writeFile(filePath, buffer);

    // Delete old profile photo if exists
    if (room.profilePhotoUrl) {
      const oldPhotoPath = path.join(process.cwd(), 'public', room.profilePhotoUrl);
      if (existsSync(oldPhotoPath)) {
        await unlink(oldPhotoPath);
      }
    }

    // Update room in database
    const updatedRoom = await prisma.room.update({
      where: { id: roomId },
      data: {
        profilePhotoUrl: `/uploads/rooms/${fileName}`,
      },
    });

    await logAdminAction(req, {
      adminUserId: auth.user.id,
      action: 'admin.rooms.profile-photo.upload',
      targetType: 'room',
      targetId: roomId,
    });

    return NextResponse.json({ room: updatedRoom });
  } catch (error) {
    console.error('Upload room profile photo error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// DELETE /api/rooms/:roomId/profile-photo - Remove room profile photo (superAdmin only)
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await context.params;

    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    // Check room exists
    const room = await prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      return NextResponse.json({ error: 'roomNotFound' }, { status: 404 });
    }

    if (!room.profilePhotoUrl) {
      return NextResponse.json({ error: 'noPhotoToDelete' }, { status: 400 });
    }

    // Delete file from disk
    const filePath = path.join(process.cwd(), 'public', room.profilePhotoUrl);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }

    // Update room in database
    const updatedRoom = await prisma.room.update({
      where: { id: roomId },
      data: {
        profilePhotoUrl: null,
      },
    });

    await logAdminAction(req, {
      adminUserId: auth.user.id,
      action: 'admin.rooms.profile-photo.delete',
      targetType: 'room',
      targetId: roomId,
    });

    return NextResponse.json({ success: true, room: updatedRoom });
  } catch (error) {
    console.error('Delete room profile photo error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
