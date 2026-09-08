import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/jwt';

/**
 * Edge middleware — the first authentication gate.
 *
 * It only verifies the JWT signature and expiry; it deliberately does NOT hit
 * the database (the Edge runtime has no Mongo driver, and a database call on
 * every request would be slow). Deeper checks — deactivated user, suspended
 * organisation, stale password — happen in `getCurrentUser()` on the server.
 *
 * So: middleware is a cheap early filter, not the authorisation boundary.
 */

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/manifest.webmanifest', '/sw.js', '/offline'];

const PUBLIC_PREFIXES = ['/_next', '/icons', '/favicon', '/api/health'];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  // Signed-in users should not sit on the login page.
  if (session && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  if (isPublic(pathname)) return NextResponse.next();

  if (!session) {
    // API callers get a clean 401 rather than an HTML redirect.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'You need to sign in to continue' }, { status: 401 });
    }

    const loginUrl = new URL('/login', req.url);
    // Preserve where they were headed so login can send them back.
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // Super admins have no organisation, so tenant routes do not apply to them.
  if (pathname.startsWith('/admin') && session.role !== 'SUPER_ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Run on everything except static assets. Using a matcher rather than an
   * in-function check keeps the middleware off the hot path for images/fonts.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)'],
};
