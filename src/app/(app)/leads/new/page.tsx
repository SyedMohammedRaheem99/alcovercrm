import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db/connect';
import { User } from '@/lib/models';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/layout/PageHeader';
import { LeadForm } from '@/components/leads/LeadForm';

export const metadata: Metadata = { title: 'Add lead' };
export const dynamic = 'force-dynamic';

export default async function NewLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ quick?: string }>;
}) {
  const user = await requireUser();
  if (!user.can('lead:create')) redirect('/leads');

  const { quick } = await searchParams;

  await connectDB();
  const members = await User.find({
    organizationId: user.organizationId,
    isDeleted: false,
    isActive: true,
  })
    .select('name')
    .sort({ name: 1 })
    .lean();

  const team = members.map((m) => ({ id: String(m._id), name: m.name }));

  return (
    <>
      <PageHeader
        title="Add lead"
        description={quick === '1' ? 'Capture the essentials now, fill in details later' : undefined}
      />
      <LeadForm
        mode={quick === '1' ? 'quick' : 'full'}
        team={team}
        initial={{ assignedTo: user.id }}
      />
    </>
  );
}
