import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProfileClient } from './ProfileClient';
import { ROLE_LABELS } from '@/lib/constants/enums';

export const metadata: Metadata = { title: 'My profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader title="My profile" />
      <ProfileClient
        name={user.name}
        email={user.email}
        role={ROLE_LABELS[user.role]}
        orgName={user.orgName}
        avatarColor={user.avatarColor}
      />
    </>
  );
}
