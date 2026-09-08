import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db/connect';
import { User } from '@/lib/models';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/layout/PageHeader';
import { ImportClient } from './ImportClient';

export const metadata: Metadata = { title: 'Import leads' };
export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const user = await requireUser();
  if (!user.can('lead:import')) redirect('/leads');

  await connectDB();
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
      <PageHeader
        title="Import leads"
        description="Upload a CSV or Excel file from Meta, Google, JustDial or your own sheet"
      />
      <ImportClient team={members.map((m) => ({ id: String(m._id), name: m.name }))} />
    </>
  );
}
