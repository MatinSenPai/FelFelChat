import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

// GET /api/profile - Get own profile
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
        lastSeen: true,
      },
    });

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('GET /api/profile error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// PUT /api/profile - Update own profile
export async function PUT(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { displayName, avatarUrl, bio } = await req.json();

    // Validate bio length
    if (bio && bio.length > 200) {
      return NextResponse.json({ error: 'Bio must be 200 characters or less' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        displayName: displayName || null,
        avatarUrl: avatarUrl || null,
        bio: bio || null,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
      },
    });

    return NextResponse.json({ profile: updated });
  } catch (error) {
    console.error('PUT /api/profile error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
