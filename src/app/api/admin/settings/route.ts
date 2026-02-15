import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';

// GET /api/admin/settings - Get app settings (superAdmin only)
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    
    if (!user || !user.isSuperAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get or create default settings
    let settings = await prisma.settings.findUnique({
      where: { id: 'default' },
    });

    if (!settings) {
      settings = await prisma.settings.create({
        data: { id: 'default', registrationEnabled: true },
      });
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('GET /api/admin/settings error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}

// PUT /api/admin/settings - Update app settings (superAdmin only)
export async function PUT(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value;
    const user = verifyToken(token || '');
    
    if (!user || !user.isSuperAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { registrationEnabled } = body;

    if (typeof registrationEnabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      update: { registrationEnabled },
      create: { id: 'default', registrationEnabled },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('PUT /api/admin/settings error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
