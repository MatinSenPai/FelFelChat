import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { registrationEnabled: true },
    });

    return NextResponse.json({
      registrationEnabled: settings?.registrationEnabled ?? true,
    });
  } catch (error) {
    console.error('GET /api/settings/public error:', error);
    return NextResponse.json({ registrationEnabled: true });
  }
}
