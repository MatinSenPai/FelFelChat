import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { requireSuperAdmin } from '@/lib/routeAuth';
import { logAdminAction } from '@/lib/auditLog';

// GET /api/admin/stickers - Fetch all stickers
export async function GET(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    const stickers = await prisma.sticker.findMany({
      orderBy: { uploadedAt: 'desc' },
      include: {
        uploader: {
          select: {
            username: true,
            displayName: true,
          },
        },
      },
    });

    return NextResponse.json({ stickers, total: stickers.length });
  } catch (error) {
    console.error('Fetch stickers error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// POST /api/admin/stickers - Upload new sticker
export async function POST(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'noFile' }, { status: 400 });
    }

    // Validate file type (PNG only)
    if (!file.type.startsWith('image/png')) {
      return NextResponse.json({ error: 'invalidFileType' }, { status: 400 });
    }

    // Validate file size (max 500KB)
    const maxSize = 500 * 1024; // 500KB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'fileTooLarge' }, { status: 400 });
    }

    // Create uploads/stickers directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'stickers');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExt = '.png';
    const fileName = `${timestamp}${fileExt}`;
    const filePath = path.join(uploadDir, fileName);

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Save sticker to database
    const sticker = await prisma.sticker.create({
      data: {
        fileUrl: `/uploads/stickers/${fileName}`,
        fileName: file.name,
        fileSize: file.size,
        uploadedBy: auth.user.id,
      },
    });

    await logAdminAction(req, {
      adminUserId: auth.user.id,
      action: 'admin.stickers.upload',
      targetType: 'sticker',
      targetId: sticker.id,
      details: { fileName: file.name, fileSize: file.size },
    });

    return NextResponse.json({ sticker });
  } catch (error) {
    console.error('Upload sticker error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// DELETE /api/admin/stickers - Delete sticker
export async function DELETE(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'missingId' }, { status: 400 });
    }

    // Find sticker
    const sticker = await prisma.sticker.findUnique({
      where: { id },
    });

    if (!sticker) {
      return NextResponse.json({ error: 'notFound' }, { status: 404 });
    }

    // Delete file from disk
    const filePath = path.join(process.cwd(), 'public', sticker.fileUrl);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }

    // Delete from database
    await prisma.sticker.delete({
      where: { id },
    });

    await logAdminAction(req, {
      adminUserId: auth.user.id,
      action: 'admin.stickers.delete',
      targetType: 'sticker',
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete sticker error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
