import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Navigation, Phone, CalendarDays } from 'lucide-react';
import { connectDB } from '@/lib/db/connect';
import { Activity, Lead } from '@/lib/models';
import { requireUser } from '@/lib/auth/session';
import { scoped, withOwnership } from '@/lib/db/repository';
import { dayRange } from '@/lib/utils/dates';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardBody, EmptyState } from '@/components/ui/Card';
import { formatDateTime } from '@/lib/utils/dates';
import { formatPhoneDisplay, toDialable } from '@/lib/utils/phone';
import { mapsHref } from '@/lib/utils/contact';

export const metadata: Metadata = { title: 'Site visits' };
export const dynamic = 'force-dynamic';

/**
 * Scheduled site visits.
 *
 * The site visit is the conversion gate in this industry — a measured site is
 * most of the way to an order — so it gets its own screen with directions and a
 * one-tap call to the customer.
 */
export default async function SiteVisitsPage() {
  const user = await requireUser();
  if (!user.organizationId) redirect('/login');

  await connectDB();

  const now = new Date();
  const today = dayRange(now, user.orgTimezone);

  const allVisits = await Activity.find(
    scoped(user.organizationId, {
      type: 'SITE_VISIT',
      status: 'PENDING',
      scheduledAt: { $exists: true },
    }),
  )
    .sort({ scheduledAt: 1 })
    .limit(200)
    .lean();

  // Fetch the related leads in ONE query rather than populating per visit.
  // Ownership is applied on the LEAD, not the activity: a SALES user must only
  // see visits for leads assigned to them, exactly as on every other screen.
  const leadIds = allVisits.map((v) => v.leadId);
  const leads = await Lead.find(
    withOwnership(
      scoped(user.organizationId, { _id: { $in: leadIds } }),
      user.id,
      user.seesAllLeads,
    ),
  )
    .select('name phone address googleMapsLink leadCode')
    .lean();

  const leadMap = new Map(leads.map((l) => [String(l._id), l]));

  // Drop visits whose lead is not visible to this user (or was deleted).
  const visits = allVisits.filter((v) => leadMap.has(String(v.leadId))).slice(0, 100);

  const todayVisits = visits.filter(
    (v) => v.scheduledAt && v.scheduledAt >= today.start && v.scheduledAt <= today.end,
  );
  const upcoming = visits.filter((v) => v.scheduledAt && v.scheduledAt > today.end);
  const overdue = visits.filter((v) => v.scheduledAt && v.scheduledAt < today.start);

  return (
    <>
      <PageHeader title="Site visits" description={`${visits.length} scheduled`} />

      <div className="space-y-4 px-4 py-4 sm:px-6">
        {visits.length === 0 ? (
          <EmptyState
            icon={<MapPin className="h-6 w-6" />}
            title="No site visits scheduled"
            description="Schedule a visit from a lead's activity log."
          />
        ) : (
          <>
            {overdue.length > 0 && (
              <VisitGroup
                title="Missed"
                tone="danger"
                visits={overdue}
                leadMap={leadMap}
              />
            )}
            <VisitGroup title="Today" tone="warning" visits={todayVisits} leadMap={leadMap} showEmpty />
            <VisitGroup title="Upcoming" tone="default" visits={upcoming} leadMap={leadMap} showEmpty />
          </>
        )}
      </div>
    </>
  );
}

interface VisitLead {
  _id: unknown;
  name: string;
  phone: string;
  leadCode: string;
  address?: { line1?: string; area?: string; city?: string; pincode?: string };
  googleMapsLink?: string;
}

function VisitGroup({
  title,
  tone,
  visits,
  leadMap,
  showEmpty,
}: {
  title: string;
  tone: 'danger' | 'warning' | 'default';
  visits: Array<{ _id: unknown; leadId: unknown; scheduledAt?: Date; body?: string; assignedToName?: string }>;
  leadMap: Map<string, VisitLead>;
  showEmpty?: boolean;
}) {
  if (visits.length === 0 && !showEmpty) return null;

  const TONES = {
    danger: 'border-danger-100 bg-danger-50 text-danger-700',
    warning: 'border-warning-100 bg-warning-50 text-warning-700',
    default: '',
  } as const;

  return (
    <Card>
      <CardHeader className={TONES[tone]}>
        <CardTitle className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4" />
          {title}
        </CardTitle>
        <span className="tabular text-xs font-semibold">{visits.length}</span>
      </CardHeader>
      <CardBody className="space-y-2.5 bg-slate-50">
        {visits.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">Nothing scheduled.</p>
        ) : (
          visits.map((visit) => {
            const lead = leadMap.get(String(visit.leadId));
            if (!lead) return null;

            const maps = mapsHref({ ...lead.address, googleMapsLink: lead.googleMapsLink });
            const address = [lead.address?.line1, lead.address?.area, lead.address?.city]
              .filter(Boolean)
              .join(', ');

            return (
              <div
                key={String(visit._id)}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/leads/${lead._id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{lead.name}</p>
                    <p className="tabular mt-0.5 text-xs text-slate-400">{lead.leadCode}</p>
                  </Link>
                  <span className="shrink-0 text-xs font-medium text-slate-600">
                    {visit.scheduledAt ? formatDateTime(visit.scheduledAt) : ''}
                  </span>
                </div>

                {address && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-600">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="min-w-0">{address}</span>
                  </p>
                )}

                {visit.body && <p className="mt-1.5 text-xs text-slate-500">{visit.body}</p>}

                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-2.5">
                  <a
                    href={`tel:${toDialable(lead.phone)}`}
                    className="flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-700 text-xs font-medium text-white"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {formatPhoneDisplay(lead.phone)}
                  </a>
                  {maps && (
                    <a
                      href={maps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      Directions
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardBody>
    </Card>
  );
}
