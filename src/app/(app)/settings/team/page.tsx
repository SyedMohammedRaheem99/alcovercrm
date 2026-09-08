import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db/connect';
import { User } from '@/lib/models';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/layout/PageHeader';
import { TeamClient } from './TeamClient';

export const metadata: Metadata = { title: 'Team' };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const user = await requireUser();
  if (!user.can('user:manage') || !user.organizationId) redirect('/dashboard');

  await connectDB();

  const members = await User.find({ organizationId: user.organizationId, isDeleted: false })
    .select('name email phone role isActive lastLoginAt avatarColor')
    .sort({ name: 1 })
    .lean();

  return (
    <>
      <PageHeader title="Team" description={`${members.length} members`} />
      <TeamClient
        members={members.map((m) => ({
          id: String(m._id),
          name: m.name,
          email: m.email,
          phone: m.phone,
          role: m.role,
          isActive: m.isActive,
          lastLoginAt: m.lastLoginAt ? m.lastLoginAt.toISOString() : undefined,
          avatarColor: m.avatarColor,
          isSelf: String(m._id) === user.id,
        }))}
      />
    </>
  );
}
