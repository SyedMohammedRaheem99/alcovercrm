import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/jwt';
import { ok, handleApiError } from '@/lib/api/response';
import { writeAudit, auditContextFrom } from '@/lib/services/audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (user) {
      await writeAudit({ ...auditContextFrom(req.headers, user), action: 'LOGOUT' });
    }

    const response = ok({ loggedOut: true });
    // maxAge 0 expires the cookie immediately.
    response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0));
    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
