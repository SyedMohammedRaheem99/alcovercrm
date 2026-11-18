import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertCircle,
  CalendarClock,
  Clock,
  IndianRupee,
  MapPin,
  Plus,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { connectDB } from '@/lib/db/connect';
import { Lead } from '@/lib/models';
import { requireUser } from '@/lib/auth/session';
import { scoped, withOwnership } from '@/lib/db/repository';
import {
  getDashboardSummary,
  getBreakdowns,
  getLeadTrend,
  type AnalyticsContext,
} from '@/lib/services/analytics';
import { LEAD_LIST_PROJECTION } from '@/lib/services/leadQuery';
import { StatCard, Card, CardHeader, CardTitle, CardBody, EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LeadCard } from '@/components/leads/LeadCard';
import { DashboardCharts } from './DashboardCharts';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

function formatMoney(value: number): string {
  // Indian readers parse lakhs/crores far faster than raw digits.
  if (value >= 10000000) return `${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(2)} L`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

export default async function DashboardPage() {
  const user = await requireUser();
  if (!user.organizationId) redirect('/login');

  await connectDB();

  const ctx: AnalyticsContext = {
    organizationId: user.organizationId,
    userId: user.id,
    seesAllLeads: user.seesAllLeads,
    timezone: user.orgTimezone,
    slaMinutes: user.orgSettings.leadResponseSlaMinutes ?? 30,
  };

  const now = new Date();

  const [summary, breakdowns, trend, overdueLeads, todayLeads] = await Promise.all([
    getDashboardSummary(ctx),
    getBreakdowns(ctx),
    getLeadTrend(ctx, 30),
    // The two lists the user actually acts on, fetched directly so the page is
    // useful without any client-side round trip.
    Lead.find(
      withOwnership(
        scoped(user.organizationId, { nextFollowUpAt: { $lt: now } }),
        user.id,
        user.seesAllLeads,
      ),
    )
      .select(LEAD_LIST_PROJECTION)
      .sort({ nextFollowUpAt: 1 })
      .limit(10)
      .lean(),
    Lead.find(
      withOwnership(
        scoped(user.organizationId, {
          nextFollowUpAt: { $gte: now, $lte: new Date(now.getTime() + 86400000) },
        }),
        user.id,
        user.seesAllLeads,
      ),
    )
      .select(LEAD_LIST_PROJECTION)
      .sort({ nextFollowUpAt: 1 })
      .limit(10)
      .lean(),
  ]);

  const wa = user.orgSettings.whatsappCountryCode ?? '91';
  const hasAlerts = summary.alerts.slaBreached > 0 || summary.alerts.unassigned > 0;

  return (
    <div className="px-4 py-4 sm:px-6">
      {/* ---------------- Greeting ---------------- */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-slate-900">
            Hello, {user.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500">{user.orgName}</p>
        </div>
        <Link href="/leads/new?quick=1" className="shrink-0">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Add lead
          </Button>
        </Link>
      </div>

      {/* ---------------- Alerts ----------------
          Deliberately above the metrics: the dashboard opens on ACTION, not
          on vanity numbers. */}
      {hasAlerts && (
        <div className="mb-4 space-y-2">
          {summary.alerts.slaBreached > 0 && (
            <Link
              href="/leads?slaBreached=true"
              className="flex items-center gap-2.5 rounded-lg border-l-[3px] border-danger-600 bg-danger-50 px-3 py-2.5"
            >
              <Zap className="h-4 w-4 shrink-0 text-danger-600" />
              <span className="min-w-0 flex-1 text-sm text-danger-700">
                <span className="tabular font-semibold">{summary.alerts.slaBreached}</span>{' '}
                {summary.alerts.slaBreached === 1 ? 'lead has' : 'leads have'} not been called yet
              </span>
            </Link>
          )}
          {summary.alerts.unassigned > 0 && user.can('lead:assign') && (
            <Link
              href="/leads?assignedTo=unassigned"
              className="flex items-center gap-2.5 rounded-lg border-l-[3px] border-warning-500 bg-warning-50 px-3 py-2.5"
            >
              <UserPlus className="h-4 w-4 shrink-0 text-warning-600" />
              <span className="min-w-0 flex-1 text-sm text-warning-700">
                <span className="tabular font-semibold">{summary.alerts.unassigned}</span> unassigned{' '}
                {summary.alerts.unassigned === 1 ? 'lead' : 'leads'}
              </span>
            </Link>
          )}
        </div>
      )}

      {/* ---------------- Follow-up counters ---------------- */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard
          label="Overdue"
          value={summary.followUps.overdue}
          icon={<AlertCircle className="h-4 w-4" />}
          tone={summary.followUps.overdue > 0 ? 'danger' : 'default'}
          href="/leads?followUp=OVERDUE"
        />
        <StatCard
          label="Due today"
          value={summary.followUps.today}
          icon={<Clock className="h-4 w-4" />}
          tone={summary.followUps.today > 0 ? 'warning' : 'default'}
          href="/leads?followUp=TODAY"
        />
        <StatCard
          label="Tomorrow"
          value={summary.followUps.tomorrow}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="info"
          href="/leads?followUp=TOMORROW"
        />
        <StatCard
          label="Site visits today"
          value={summary.siteVisitsToday}
          icon={<MapPin className="h-4 w-4" />}
          href="/site-visits"
        />
      </div>

      {/* ---------------- Overdue list ---------------- */}
      {overdueLeads.length > 0 && (
        <Card className="mb-4 border-danger-200">
          <CardHeader className="border-danger-100 bg-danger-50">
            <CardTitle className="flex items-center gap-1.5 text-danger-700">
              <AlertCircle className="h-4 w-4" />
              Overdue follow-ups
            </CardTitle>
            <Link href="/leads?followUp=OVERDUE" className="text-xs font-medium text-danger-700">
              View all
            </Link>
          </CardHeader>
          <CardBody className="space-y-2.5 bg-slate-50">
            {overdueLeads.map((lead) => (
              <LeadCard
                key={String(lead._id)}
                lead={JSON.parse(JSON.stringify(lead))}
                timezone={user.orgTimezone}
                whatsappCountryCode={wa}
              />
            ))}
          </CardBody>
        </Card>
      )}

      {/* ---------------- Today / tomorrow ---------------- */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-warning-600" />
            Coming up
          </CardTitle>
          <Link href="/leads?followUp=TODAY" className="text-xs font-medium text-brand-700">
            View all
          </Link>
        </CardHeader>
        <CardBody className="space-y-2.5 bg-slate-50">
          {todayLeads.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-5 w-5" />}
              title="Nothing scheduled"
              description="No follow-ups due in the next 24 hours."
            />
          ) : (
            todayLeads.map((lead) => (
              <LeadCard
                key={String(lead._id)}
                lead={JSON.parse(JSON.stringify(lead))}
                timezone={user.orgTimezone}
                whatsappCountryCode={wa}
              />
            ))
          )}
        </CardBody>
      </Card>

      {/* ---------------- Business metrics ---------------- */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard
          label="Total leads"
          value={summary.counts.total}
          sublabel={`${summary.counts.newThisMonth} this month`}
          icon={<Users className="h-4 w-4" />}
          href="/leads"
        />
        <StatCard
          label="In pipeline"
          value={summary.counts.open}
          sublabel={`₹${formatMoney(summary.value.pipelineValue)} potential`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="info"
        />
        <StatCard
          label="Won"
          value={summary.counts.won}
          sublabel={`₹${formatMoney(summary.value.wonValueTotal)} total`}
          icon={<IndianRupee className="h-4 w-4" />}
          tone="success"
          href="/leads?stage=WON"
        />
        <StatCard
          label="Conversion"
          value={`${summary.conversionRate}%`}
          sublabel={`${summary.counts.won} won / ${summary.counts.lost} lost`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      {summary.avgResponseMinutes !== null && (
        <Card className="mb-4">
          <CardBody className="flex items-center gap-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <Zap className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">
                Average response time:{' '}
                <span className="tabular">
                  {summary.avgResponseMinutes < 60
                    ? `${summary.avgResponseMinutes} min`
                    : `${(summary.avgResponseMinutes / 60).toFixed(1)} hrs`}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                Calling within {ctx.slaMinutes} minutes converts far better
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ---------------- Charts ---------------- */}
      <DashboardCharts trend={trend} breakdowns={breakdowns} />
    </div>
  );
}
