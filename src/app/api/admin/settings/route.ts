import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logAdminAction } from '@/lib/auditLog';
import { requireSuperAdmin } from '@/lib/routeAuth';

// GET /api/admin/settings - Get app settings (superAdmin only)
export async function GET(req: NextRequest) {
  try {
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

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
    const auth = requireSuperAdmin(req);
    if (!auth.ok) return auth.response;

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

    await logAdminAction(req, {
      adminUserId: auth.user.id,
      action: 'admin.settings.update',
      targetType: 'settings',
      targetId: 'default',
      details: { registrationEnabled },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('PUT /api/admin/settings error:', error);
    return NextResponse.json({ error: 'serverError' }, { status: 500 });
  }
}
