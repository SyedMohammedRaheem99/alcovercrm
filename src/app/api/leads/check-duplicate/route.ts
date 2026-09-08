import { NextRequest } from 'next/server';
import { connectDB } from '@/lib/db/connect';
import { requireOrgUser } from '@/lib/auth/session';
import { findDuplicateByPhone } from '@/lib/services/leadService';
import { ok, handleApiError } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/check-duplicate?phone=...
 *
 * Called while the user types a phone number, so the duplicate warning appears
 * before they fill in the rest of the form rather than after they press save.
 * This is what stops two salespeople calling the same customer.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireOrgUser();
    await connectDB();

    const phone = req.nextUrl.searchParams.get('phone') ?? '';
    const excludeId = req.nextUrl.searchParams.get('excludeId') ?? undefined;

    // Too short to be meaningful — avoid a query on every keystroke.
    if (phone.replace(/\D/g, '').length < 6) return ok({ duplicate: null });

    const duplicate = await findDuplicateByPhone(user.organizationId!, phone, excludeId);
    return ok({ duplicate });
  } catch (err) {
    return handleApiError(err);
  }
}
