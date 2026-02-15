import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

// GET /api/admin/gifs - Fetch all GIFs
export async function GET() {
  try {
    const gifs = await prisma.gif.findMany({
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

    return NextResponse.json({ gifs, total: gifs.length });
  } catch (error) {
    console.error('Fetch gifs error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// POST /api/admin/gifs - Upload new GIF
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;

    if (!file) {
      return NextResponse.json({ error: 'noFile' }, { status: 400 });
    }

    // Validate file type (MP4 or GIF)
    const validTypes = ['video/mp4', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'invalidFileType' }, { status: 400 });
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'fileTooLarge' }, { status: 400 });
    }

    // Create uploads/gifs directory if it doesn't exist
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'gifs');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExt = file.type === 'video/mp4' ? '.mp4' : '.gif';
    const fileName = `${timestamp}${fileExt}`;
    const filePath = path.join(uploadDir, fileName);

    // Write file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Save GIF to database
    const gif = await prisma.gif.create({
      data: {
        fileUrl: `/uploads/gifs/${fileName}`,
        fileName: file.name,
        fileSize: file.size,
        format: file.type === 'video/mp4' ? 'mp4' : 'gif',
        uploadedBy: userId,
      },
    });

    return NextResponse.json({ gif });
  } catch (error) {
    console.error('Upload gif error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// DELETE /api/admin/gifs - Delete GIF
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'missingId' }, { status: 400 });
    }

    // Find gif
    const gif = await prisma.gif.findUnique({
      where: { id },
    });

    if (!gif) {
      return NextResponse.json({ error: 'notFound' }, { status: 404 });
    }

    // Delete file from disk
    const filePath = path.join(process.cwd(), 'public', gif.fileUrl);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }

    // Delete from database
    await prisma.gif.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete gif error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
