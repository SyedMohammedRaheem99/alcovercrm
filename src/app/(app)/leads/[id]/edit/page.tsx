import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connectDB } from '@/lib/db/connect';
import { Lead, User } from '@/lib/models';
import { requireUser } from '@/lib/auth/session';
import { scoped, toObjectId } from '@/lib/db/repository';
import { PageHeader } from '@/components/layout/PageHeader';
import { LeadForm, emptyLead } from '@/components/leads/LeadForm';

export const metadata: Metadata = { title: 'Edit lead' };
export const dynamic = 'force-dynamic';

/** datetime-local needs `YYYY-MM-DDTHH:mm` in local time, not an ISO string. */
function toLocalInput(date?: Date | string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user.can('lead:edit') || !user.organizationId) redirect('/leads');

  const leadId = toObjectId(id);
  if (!leadId) notFound();

  await connectDB();

  const lead = await Lead.findOne(scoped(user.organizationId, { _id: leadId })).lean();
  if (!lead) notFound();

  if (!user.seesAllLeads && String(lead.assignedTo ?? '') !== user.id) redirect('/leads');

  const members = await User.find({
    organizationId: user.organizationId,
    isDeleted: false,
    isActive: true,
  })
    .select('name')
    .sort({ name: 1 })
    .lean();

  return (
    <>
      <PageHeader title="Edit lead" description={lead.leadCode} />
      <LeadForm
        leadId={id}
        team={members.map((m) => ({ id: String(m._id), name: m.name }))}
        initial={{
          ...emptyLead,
          name: lead.name,
          phone: lead.phone,
          altPhone: lead.altPhone ?? '',
          email: lead.email ?? '',
          source: lead.source,
          sourceDetail: lead.sourceDetail ?? '',
          stage: lead.stage,
          address: {
            line1: lead.address?.line1 ?? '',
            area: lead.address?.area ?? '',
            city: lead.address?.city ?? '',
            state: lead.address?.state ?? '',
            pincode: lead.address?.pincode ?? '',
            landmark: lead.address?.landmark ?? '',
          },
          googleMapsLink: lead.googleMapsLink ?? '',
          materials: lead.materials ?? [],
          productTypes: lead.productTypes ?? [],
          glassTypes: lead.glassTypes ?? [],
          approxAreaSqft: lead.approxAreaSqft?.toString() ?? '',
          unitCount: lead.unitCount?.toString() ?? '',
          requirementNotes: lead.requirementNotes ?? '',
          propertyType: lead.propertyType ?? '',
          constructionStage: lead.constructionStage ?? '',
          timeline: lead.timeline ?? '',
          budgetMin: lead.budgetMin?.toString() ?? '',
          budgetMax: lead.budgetMax?.toString() ?? '',
          decisionMaker: lead.decisionMaker ?? '',
          assignedTo: lead.assignedTo ? String(lead.assignedTo) : '',
          nextFollowUpAt: toLocalInput(lead.nextFollowUpAt),
          nextFollowUpNote: lead.nextFollowUpNote ?? '',
          notes: lead.notes ?? '',
        }}
      />
    </>
  );
}
