import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { connectDB } from '@/lib/db/connect';
import { Lead } from '@/lib/models';
import { requireUser } from '@/lib/auth/session';
import { scoped, withOwnership } from '@/lib/db/repository';
import { PageHeader } from '@/components/layout/PageHeader';
import { PIPELINE_STAGES, STAGE_LABELS, STAGE_COLORS } from '@/lib/constants/enums';
import { formatPhoneDisplay } from '@/lib/utils/phone';
import { formatFollowUpLabel, getFollowUpBucket } from '@/lib/utils/dates';

export const metadata: Metadata = { title: 'Pipeline' };
export const dynamic = 'force-dynamic';

/**
 * Kanban view of the pipeline.
 *
 * Columns scroll horizontally on mobile rather than collapsing — a salesperson
 * checking the board on a phone still wants the shape of the funnel, and a
 * stacked list would lose exactly that.
 */
export default async function PipelinePage() {
  const user = await requireUser();
  if (!user.organizationId) redirect('/login');

  await connectDB();

  const filter = withOwnership(
    scoped(user.organizationId, { stage: { $in: PIPELINE_STAGES } }),
    user.id,
    user.seesAllLeads,
  );

  const leads = await Lead.find(filter)
    .select('leadCode name phone stage priority nextFollowUpAt assignedToName dealValue budgetMin budgetMax')
    .sort({ updatedAt: -1 })
    .limit(600)
    .lean();

  const byStage = new Map<string, typeof leads>();
  for (const stage of PIPELINE_STAGES) byStage.set(stage, []);
  for (const lead of leads) byStage.get(lead.stage)?.push(lead);

  return (
    <>
      <PageHeader title="Pipeline" description={`${leads.length} open leads`} />

      <div className="scrollbar-thin overflow-x-auto px-4 py-4 sm:px-6">
        <div className="flex min-w-max gap-3 pb-2">
          {PIPELINE_STAGES.map((stage) => {
            const items = byStage.get(stage) ?? [];
            const color = STAGE_COLORS[stage];

            return (
              <section key={stage} className="w-[264px] shrink-0">
                <header
                  className="flex items-center justify-between rounded-t-lg border-t-[3px] bg-white px-3 py-2.5"
                  style={{ borderTopColor: color }}
                >
                  <h2 className="truncate text-sm font-semibold text-slate-900">
                    {STAGE_LABELS[stage]}
                  </h2>
                  <span className="tabular shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {items.length}
                  </span>
                </header>

                <div className="scrollbar-thin max-h-[calc(100vh-260px)] space-y-2 overflow-y-auto rounded-b-lg bg-slate-100 p-2">
                  {items.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">Empty</p>
                  ) : (
                    items.map((lead) => {
                      const bucket = getFollowUpBucket(lead.nextFollowUpAt, user.orgTimezone);
                      const value = lead.dealValue ?? lead.budgetMax ?? lead.budgetMin;

                      return (
                        <Link
                          key={String(lead._id)}
                          href={`/leads/${lead._id}`}
                          className="block rounded-md border border-slate-200 bg-white p-2.5 shadow-sm transition-shadow hover:shadow-md"
                        >
                          <p className="truncate text-sm font-medium text-slate-900">{lead.name}</p>
                          <p className="tabular mt-0.5 text-xs text-slate-500">
                            {formatPhoneDisplay(lead.phone)}
                          </p>

                          {value ? (
                            <p className="tabular mt-1.5 text-xs font-semibold text-success-700">
                              ₹{value.toLocaleString('en-IN')}
                            </p>
                          ) : null}

                          {lead.nextFollowUpAt && (
                            <p
                              className={`mt-1.5 truncate text-[11px] font-medium ${
                                bucket === 'OVERDUE' ? 'text-danger-600' : 'text-slate-500'
                              }`}
                            >
                              {bucket === 'OVERDUE' && '! '}
                              {formatFollowUpLabel(lead.nextFollowUpAt)}
                            </p>
                          )}

                          {lead.assignedToName && (
                            <p className="mt-1 truncate text-[11px] text-slate-400">
                              {lead.assignedToName}
                            </p>
                          )}
                        </Link>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
