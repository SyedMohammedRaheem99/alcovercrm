import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connectDB } from '@/lib/db/connect';
import { Lead, Activity, User, Master } from '@/lib/models';
import { requireUser } from '@/lib/auth/session';
import { scoped, toObjectId } from '@/lib/db/repository';
import { computeLeadScore } from '@/lib/services/leadScore';
import { LeadDetailClient } from './LeadDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser();
  const leadId = toObjectId(id);
  if (!leadId || !user.organizationId) return { title: 'Lead' };

  await connectDB();
  const lead = await Lead.findOne(scoped(user.organizationId, { _id: leadId }, { includeDeleted: true }))
    .select('name')
    .lean();

  return { title: lead?.name ?? 'Lead' };
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user.organizationId) redirect('/login');

  const leadId = toObjectId(id);
  if (!leadId) notFound();

  await connectDB();

  const lead = await Lead.findOne(
    scoped(user.organizationId, { _id: leadId }, { includeDeleted: true }),
  ).lean();
  if (!lead) notFound();

  // A SALES user may only open leads assigned to them.
  if (!user.seesAllLeads && String(lead.assignedTo ?? '') !== user.id) {
    redirect('/leads');
  }

  const [activities, members, templates] = await Promise.all([
    Activity.find(scoped(user.organizationId, { leadId })).sort({ createdAt: -1 }).limit(100).lean(),
    User.find({ organizationId: user.organizationId, isDeleted: false, isActive: true })
      .select('name')
      .sort({ name: 1 })
      .lean(),
    Master.find({
      organizationId: user.organizationId,
      type: 'WHATSAPP_TEMPLATE',
      isActive: true,
    })
      .sort({ sortOrder: 1 })
      .lean(),
  ]);

  const score = computeLeadScore(lead);

  // `lean()` returns ObjectIds and Dates; serialise for the client boundary.
  const serialized = JSON.parse(JSON.stringify(lead));

  return (
    <LeadDetailClient
      lead={serialized}
      activities={JSON.parse(JSON.stringify(activities))}
      scoreFactors={score.factors}
      team={members.map((m) => ({ id: String(m._id), name: m.name }))}
      orgName={user.orgName}
      timezone={user.orgTimezone}
      whatsappCountryCode={user.orgSettings.whatsappCountryCode ?? '91'}
      whatsappTemplates={templates.map((t) => ({
        key: t.key,
        label: t.label,
        value: t.value ?? '',
      }))}
      requireNextAction={user.orgSettings.requireNextActionOnCall ?? true}
      currentUserName={user.name}
      canEdit={user.can('lead:edit')}
      canDelete={user.can('lead:delete')}
      canAssign={user.can('lead:assign')}
    />
  );
}
