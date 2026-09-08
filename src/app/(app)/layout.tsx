import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { permissionsFor } from '@/lib/auth/permissions';
import { AppShell } from '@/components/layout/AppShell';

/**
 * Authenticated shell.
 *
 * Middleware already rejected requests without a valid token, but this is the
 * real authorisation boundary: it re-reads the user from the database, so a
 * deactivated account or suspended organisation is caught even while their
 * signed token is still within its expiry window.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) redirect('/login');

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarColor: user.avatarColor,
        orgName: user.orgName,
        permissions: permissionsFor(user.role),
      }}
    >
      {children}
    </AppShell>
  );
}
