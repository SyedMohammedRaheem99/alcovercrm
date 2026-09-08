import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Download } from 'lucide-react';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { LeadCardSkeleton } from '@/components/leads/LeadCard';
import { LeadsClient } from './LeadsClient';

export const metadata: Metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title="Leads"
        actions={
          <>
            {user.can('lead:export') && (
              <a href="/api/leads/export?format=xlsx" title="Export to Excel">
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </a>
            )}
            {user.can('lead:create') && (
              <Link href="/leads/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add lead</span>
                </Button>
              </Link>
            )}
          </>
        }
      />

      {/* useSearchParams requires a Suspense boundary in the App Router. */}
      <Suspense
        fallback={
          <div className="space-y-2.5 px-4 py-4 sm:px-6">
            {Array.from({ length: 5 }, (_, i) => (
              <LeadCardSkeleton key={i} />
            ))}
          </div>
        }
      >
        <LeadsClient
          timezone={user.orgTimezone}
          whatsappCountryCode={user.orgSettings.whatsappCountryCode ?? '91'}
          canBulkEdit={user.can('lead:bulk_edit')}
          canDelete={user.can('lead:delete')}
          canAssign={user.can('lead:assign')}
        />
      </Suspense>
    </>
  );
}
