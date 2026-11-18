import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AlertCircle, CalendarClock, CheckCircle2, Clock } from 'lucide-react';
import { connectDB } from '@/lib/db/connect';
import { Lead } from '@/lib/models';
import { requireUser } from '@/lib/auth/session';
import { scoped, withOwnership } from '@/lib/db/repository';
import { LEAD_LIST_PROJECTION } from '@/lib/services/leadQuery';
import { CLOSED_STAGES } from '@/lib/constants/enums';
import { dayRange, weekRange } from '@/lib/utils/dates';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardBody, EmptyState } from '@/components/ui/Card';
import { LeadCard } from '@/components/leads/LeadCard';

export const metadata: Metadata = { title: 'Follow-ups' };
export const dynamic = 'force-dynamic';

/**
 * The follow-up workspace.
 *
 * A single screen answering "who do I call now?" in priority order. Overdue is
 * first and visually loudest, because an overdue follow-up is the one thing in
 * this product that actively loses money.
 */
export default async function FollowUpsPage() {
  const user = await requireUser();
  if (!user.organizationId) redirect('/login');

  await connectDB();

  const now = new Date();
  const today = dayRange(now, user.orgTimezone);
  const tomorrow = dayRange(new Date(now.getTime() + 86400000), user.orgTimezone);
  const thisWeek = weekRange(now, user.orgTimezone);

  const scope = (extra: Record<string, unknown>) =>
    withOwnership(scoped(user.organizationId!, extra), user.id, user.seesAllLeads);

  /**
   * Every bucket on this page is about work still to be done, so all of them
   * exclude closed leads — not just the "no next step" one. A won or lost deal
   * showing up under Overdue sends the team chasing a finished job.
   */
  const openScope = (extra: Record<string, unknown>) =>
    scope({ ...extra, stage: { $nin: CLOSED_STAGES } });

  const [overdue, dueToday, dueTomorrow, laterThisWeek, noFollowUp] = await Promise.all([
    Lead.find(openScope({ nextFollowUpAt: { $lt: now } }))
      .select(LEAD_LIST_PROJECTION)
      .sort({ nextFollowUpAt: 1 })
      .limit(50)
      .lean(),
    Lead.find(openScope({ nextFollowUpAt: { $gte: now, $lte: today.end } }))
      .select(LEAD_LIST_PROJECTION)
      .sort({ nextFollowUpAt: 1 })
      .limit(50)
      .lean(),
    Lead.find(openScope({ nextFollowUpAt: { $gte: tomorrow.start, $lte: tomorrow.end } }))
      .select(LEAD_LIST_PROJECTION)
      .sort({ nextFollowUpAt: 1 })
      .limit(50)
      .lean(),
    Lead.find(openScope({ nextFollowUpAt: { $gt: tomorrow.end, $lte: thisWeek.end } }))
      .select(LEAD_LIST_PROJECTION)
      .sort({ nextFollowUpAt: 1 })
      .limit(50)
      .lean(),
    // Open leads with no next step — the silent killer this CRM exists to stop.
    Lead.find(openScope({ nextFollowUpAt: { $exists: false } }))
      .select(LEAD_LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const wa = user.orgSettings.whatsappCountryCode ?? '91';
  const serialize = (docs: unknown[]) => JSON.parse(JSON.stringify(docs));

  const total = overdue.length + dueToday.length + dueTomorrow.length + laterThisWeek.length;

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description={total === 0 ? 'All caught up' : `${total} scheduled this week`}
      />

      <div className="space-y-4 px-4 py-4 sm:px-6">
        {total === 0 && noFollowUp.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6" />}
            title="Nothing pending"
            description="Every lead has a next step scheduled. Nice work."
          />
        ) : (
          <>
            <Bucket
              title="Overdue"
              icon={<AlertCircle className="h-4 w-4" />}
              tone="danger"
              leads={serialize(overdue)}
              timezone={user.orgTimezone}
              wa={wa}
              emptyText="No overdue follow-ups."
            />
            <Bucket
              title="Due today"
              icon={<Clock className="h-4 w-4" />}
              tone="warning"
              leads={serialize(dueToday)}
              timezone={user.orgTimezone}
              wa={wa}
              emptyText="Nothing left for today."
            />
            <Bucket
              title="Tomorrow"
              icon={<CalendarClock className="h-4 w-4" />}
              tone="info"
              leads={serialize(dueTomorrow)}
              timezone={user.orgTimezone}
              wa={wa}
              hideWhenEmpty
            />
            <Bucket
              title="Later this week"
              icon={<CalendarClock className="h-4 w-4" />}
              tone="default"
              leads={serialize(laterThisWeek)}
              timezone={user.orgTimezone}
              wa={wa}
              hideWhenEmpty
            />
            <Bucket
              title="No follow-up set"
              icon={<AlertCircle className="h-4 w-4" />}
              tone="danger"
              leads={serialize(noFollowUp)}
              timezone={user.orgTimezone}
              wa={wa}
              hideWhenEmpty
              description="These leads are open but have no next step. Schedule one so they are not forgotten."
            />
          </>
        )}
      </div>
    </>
  );
}

function Bucket({
  title,
  icon,
  tone,
  leads,
  timezone,
  wa,
  emptyText,
  hideWhenEmpty,
  description,
}: {
  title: string;
  icon: React.ReactNode;
  tone: 'danger' | 'warning' | 'info' | 'default';
  leads: Array<Record<string, unknown>>;
  timezone: string;
  wa: string;
  emptyText?: string;
  hideWhenEmpty?: boolean;
  description?: string;
}) {
  if (leads.length === 0 && hideWhenEmpty) return null;

  const TONES = {
    danger: 'border-danger-100 bg-danger-50 text-danger-700',
    warning: 'border-warning-100 bg-warning-50 text-warning-700',
    info: 'border-info-100 bg-info-50 text-info-700',
    default: '',
  } as const;

  return (
    <Card className={tone === 'danger' ? 'border-danger-200' : undefined}>
      <CardHeader className={TONES[tone]}>
        <CardTitle className="flex items-center gap-1.5">
          {icon}
          {title}
        </CardTitle>
        <span className="tabular text-xs font-semibold">{leads.length}</span>
      </CardHeader>
      <CardBody className="space-y-2.5 bg-slate-50">
        {description && <p className="pb-1 text-xs text-slate-500">{description}</p>}
        {leads.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">{emptyText}</p>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={String(lead._id)}
              lead={lead as never}
              timezone={timezone}
              whatsappCountryCode={wa}
            />
          ))
        )}
      </CardBody>
    </Card>
  );
}
