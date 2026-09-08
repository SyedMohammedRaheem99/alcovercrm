import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { Role } from '@/lib/constants/enums';

/**
 * JWT session tokens.
 *
 * Uses `jose` rather than `jsonwebtoken` because Next.js middleware runs on the
 * Edge runtime, where Node's `crypto` module is unavailable. `jose` uses the Web
 * Crypto API and therefore works in middleware, route handlers and server
 * components alike — one implementation everywhere.
 */

export const SESSION_COOKIE = 'fcrm_session';
const DEFAULT_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days
const REMEMBER_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface SessionPayload extends JWTPayload {
  sub: string; // user id
  orgId: string | null; // null only for SUPER_ADMIN
  role: Role;
  name: string;
  email: string;
  /**
   * Seconds-precision copy of `passwordChangedAt`. If the user changes their
   * password, every previously issued token becomes stale and is rejected —
   * which is what makes "log out everywhere" work without a session store.
   */
  pwd?: number;
}

let cachedKey: Uint8Array | null = null;

function getSecretKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or too short. Set a random string of at least 32 characters in your environment.',
    );
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export async function signSession(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
  rememberMe = false,
): Promise<{ token: string; maxAge: number }> {
  const maxAge = rememberMe ? REMEMBER_MAX_AGE_SECONDS : DEFAULT_MAX_AGE_SECONDS;

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .setIssuer('alcove-crm')
    .setAudience('alcove-crm')
    .sign(getSecretKey());

  return { token, maxAge };
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: 'alcove-crm',
      audience: 'alcove-crm',
      algorithms: ['HS256'],
    });

    // Shape check — a structurally valid but semantically wrong token is rejected.
    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') return null;

    return payload as SessionPayload;
  } catch {
    // Expired, tampered with, or signed by a different secret.
    return null;
  }
}

/** Cookie options shared by the login and logout paths so they cannot drift apart. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true, // unreadable from JavaScript, so XSS cannot steal the session
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const, // blocks cross-site POSTs while allowing normal navigation
    path: '/',
    maxAge,
  };
}
