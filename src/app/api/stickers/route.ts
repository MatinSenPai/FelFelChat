import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/stickers - Public endpoint for fetching all stickers
export async function GET() {
  try {
    const stickers = await prisma.sticker.findMany({
      select: {
        id: true,
        fileUrl: true,
        fileName: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    return NextResponse.json(
      { stickers, total: stickers.length },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      }
    );
  } catch (error) {
    console.error('Fetch stickers error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
