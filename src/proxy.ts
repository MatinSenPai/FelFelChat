import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/uploads/')
  ) {
    return null;
  }

  if (pathname.startsWith('/api/auth')) {
    return null;
  }

  if (
    pathname === '/api/stickers' ||
    pathname === '/api/gifs' ||
    pathname === '/api/settings/public' ||
    pathname === '/api/health' ||
    pathname === '/api/ready'
  ) {
    return null;
  }

  const token = request.cookies.get('token')?.value;

  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  if (!token) {
    if (isAuthPage) return null;
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const { verifyToken } = await import('@/lib/jwt');
    const user = verifyToken(token);

    if (!user) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('token');
      return response;
    }

    if (isAuthPage) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    if (isAdminRoute && !user.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return null;
  } catch (error) {
    console.error('Proxy auth error:', error);
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('token');
    return response;
  }
}

export const config = {
  matcher: '/:path*',
};
