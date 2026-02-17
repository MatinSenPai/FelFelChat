import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest, context: any) {
  const { pathname } = request.nextUrl;

  // Allow static files, API routes, and uploads
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/uploads/')
  ) {
    return null; // Pass through
  }

  // Allow auth API routes
  if (pathname.startsWith('/api/auth')) {
    return null;
  }

  // Allow public sticker and GIF API routes
  if (pathname === '/api/stickers' || pathname === '/api/gifs') {
    return null;
  }

  const token = request.cookies.get('token')?.value;

  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  // No token - redirect to login unless already on auth page
  if (!token) {
    if (isAuthPage) return null;
    return Response.redirect(new URL('/login', request.url));
  }

  // With token - verify it
  try {
    const { verifyToken } = await import('@/lib/jwt');
    const user = verifyToken(token);

    if (!user) {
      // Invalid token - clear it and redirect to login
      const response = Response.redirect(new URL('/login', request.url));
      response.headers.append('Set-Cookie', 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
      return response;
    }

    // Redirect authenticated users away from auth pages
    if (isAuthPage) {
      return Response.redirect(new URL('/', request.url));
    }

    // Admin routes: superadmin only
    if (isAdminRoute && !user.isSuperAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return null; // Allow request
  } catch (error) {
    console.error('Proxy auth error:', error);
    // On error, clear token and redirect
    const response = Response.redirect(new URL('/login', request.url));
    response.headers.append('Set-Cookie', 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    return response;
  }
}

export const config = {
  matcher: '/:path*',
};
