import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db/connect';
import { requireUser } from '@/lib/auth/session';
import {
  getSourcePerformance,
  getTeamPerformance,
  getBreakdowns,
  getDashboardSummary,
  type AnalyticsContext,
} from '@/lib/services/analytics';
import { parseDateRangeParam } from '@/lib/utils/dates';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { SOURCE_LABELS, PRODUCT_TYPE_LABELS, LOST_REASON_LABELS } from '@/lib/constants/enums';
import { ReportFilters } from './ReportFilters';

export const metadata: Metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

function money(v: number): string {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requireUser();
  if (!user.organizationId) redirect('/login');
  if (!user.can('report:view_all')) redirect('/dashboard');

  const { from, to } = await searchParams;

  await connectDB();

  const ctx: AnalyticsContext = {
    organizationId: user.organizationId,
    userId: user.id,
    seesAllLeads: user.seesAllLeads,
    timezone: user.orgTimezone,
    slaMinutes: user.orgSettings.leadResponseSlaMinutes ?? 30,
  };

  const range = parseDateRangeParam(from, to, user.orgTimezone);

  const [sources, team, breakdowns, summary] = await Promise.all([
    getSourcePerformance(ctx, range),
    getTeamPerformance(ctx, range),
    getBreakdowns(ctx, range),
    getDashboardSummary(ctx),
  ]);

  return (
    <>
      <PageHeader title="Reports" description="Where your leads and revenue come from" />

      <div className="space-y-4 px-4 py-4 sm:px-6">
        <ReportFilters from={from ?? ''} to={to ?? ''} />

        {/* ---------------- Source ROI ----------------
            The single most valuable table in the product: it tells the owner
            which ad channel to spend more on and which to switch off. */}
        <Card>
          <CardHeader>
            <CardTitle>Lead source performance</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {sources.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No leads in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5 font-medium">Source</th>
                      <th className="px-3 py-2.5 text-right font-medium">Leads</th>
                      <th className="px-3 py-2.5 text-right font-medium">Contacted</th>
                      <th className="px-3 py-2.5 text-right font-medium">Qualified</th>
                      <th className="px-3 py-2.5 text-right font-medium">Won</th>
                      <th className="px-3 py-2.5 text-right font-medium">Conv.</th>
                      <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s) => (
                      <tr key={s.source} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {SOURCE_LABELS[s.source as keyof typeof SOURCE_LABELS] ?? s.source}
                        </td>
                        <td className="tabular px-3 py-2.5 text-right">{s.total}</td>
                        <td className="tabular px-3 py-2.5 text-right text-slate-600">{s.contacted}</td>
                        <td className="tabular px-3 py-2.5 text-right text-slate-600">{s.qualified}</td>
                        <td className="tabular px-3 py-2.5 text-right font-semibold text-success-700">
                          {s.won}
                        </td>
                        <td className="tabular px-3 py-2.5 text-right">
                          <span
                            className={
                              s.conversionRate >= 40
                                ? 'font-semibold text-success-700'
                                : s.conversionRate > 0
                                  ? 'text-slate-700'
                                  : 'text-slate-400'
                            }
                          >
                            {s.conversionRate}%
                          </span>
                        </td>
                        <td className="tabular px-4 py-2.5 text-right font-medium">
                          {s.wonValue > 0 ? money(s.wonValue) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        {/* ---------------- Team ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Team performance</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {team.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No assigned leads yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5 font-medium">Member</th>
                      <th className="px-3 py-2.5 text-right font-medium">Assigned</th>
                      <th className="px-3 py-2.5 text-right font-medium">Contacted</th>
                      <th className="px-3 py-2.5 text-right font-medium">Activities</th>
                      <th className="px-3 py-2.5 text-right font-medium">Won</th>
                      <th className="px-3 py-2.5 text-right font-medium">Overdue</th>
                      <th className="px-4 py-2.5 text-right font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((t) => (
                      <tr key={t.userId} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{t.name}</td>
                        <td className="tabular px-3 py-2.5 text-right">{t.assigned}</td>
                        <td className="tabular px-3 py-2.5 text-right text-slate-600">{t.contacted}</td>
                        <td className="tabular px-3 py-2.5 text-right text-slate-600">{t.activities}</td>
                        <td className="tabular px-3 py-2.5 text-right font-semibold text-success-700">
                          {t.won}
                        </td>
                        <td className="tabular px-3 py-2.5 text-right">
                          {t.overdue > 0 ? (
                            <span className="font-semibold text-danger-600">{t.overdue}</span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right font-medium">
                          {t.wonValue > 0 ? money(t.wonValue) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        {/* ---------------- Product & loss analysis ---------------- */}
        <div className="grid gap-4 lg:grid-cols-2">
          <RankTable
            title="Most requested products"
            rows={breakdowns.byProduct.map((b) => ({
              label: PRODUCT_TYPE_LABELS[b.key as keyof typeof PRODUCT_TYPE_LABELS] ?? b.key,
              value: b.count,
            }))}
          />
          <RankTable
            title="Why leads are lost"
            rows={breakdowns.lostReasons.map((b) => ({
              label: LOST_REASON_LABELS[b.key as keyof typeof LOST_REASON_LABELS] ?? b.key,
              value: b.count,
            }))}
          />
          <RankTable
            title="Top cities"
            rows={breakdowns.byCity.map((b) => ({ label: b.key, value: b.count }))}
          />
          <RankTable
            title="Top areas"
            rows={breakdowns.byArea.map((b) => ({ label: b.key, value: b.count }))}
          />
        </div>

        <p className="pb-2 text-center text-xs text-slate-400">
          Overall conversion {summary.conversionRate}% · {summary.counts.won} won ·{' '}
          {summary.counts.lost} lost
        </p>
      </div>
    </>
  );
}

function RankTable({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No data yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.label}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-slate-700">{r.label}</span>
                  <span className="tabular shrink-0 font-semibold text-slate-900">{r.value}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{ width: `${(r.value / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
