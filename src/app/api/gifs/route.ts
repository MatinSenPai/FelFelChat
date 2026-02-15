import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/gifs - Public endpoint for fetching all GIFs
export async function GET() {
  try {
    const gifs = await prisma.gif.findMany({
      select: {
        id: true,
        fileUrl: true,
        fileName: true,
        format: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    return NextResponse.json(
      { gifs, total: gifs.length },
      {
        headers: {
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      }
    );
  } catch (error) {
    console.error('Fetch gifs error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
