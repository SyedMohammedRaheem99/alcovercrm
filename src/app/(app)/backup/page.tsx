import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Database, FileSpreadsheet, FileJson, ShieldCheck } from 'lucide-react';
import { connectDB } from '@/lib/db/connect';
import { Lead, Activity, Quotation, User } from '@/lib/models';
import { requireUser } from '@/lib/auth/session';
import { scoped } from '@/lib/db/repository';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Backup' };
export const dynamic = 'force-dynamic';

export default async function BackupPage() {
  const user = await requireUser();
  if (!user.can('backup:run') || !user.organizationId) redirect('/dashboard');

  await connectDB();

  const all = { includeDeleted: true };
  const [leads, activities, quotations, users] = await Promise.all([
    Lead.countDocuments(scoped(user.organizationId, {}, all)),
    Activity.countDocuments(scoped(user.organizationId, {}, all)),
    Quotation.countDocuments(scoped(user.organizationId, {}, all)),
    User.countDocuments({ organizationId: user.organizationId }),
  ]);

  return (
    <>
      <PageHeader title="Backup" description="Download a copy of all your data" />

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle>What is in your CRM</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Count label="Leads" value={leads} />
              <Count label="Activities" value={activities} />
              <Count label="Quotations" value={quotations} />
              <Count label="Team members" value={users} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Download a backup</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-600">
              Take a backup regularly — weekly or monthly — and keep the file somewhere safe.
              It contains every lead, every call and note, and your full history.
            </p>

            {/* Plain links rather than fetch(): the browser handles the download
                natively, which also works on mobile Safari. */}
            <a
              href="/api/backup?format=xlsx"
              className="flex items-center gap-3 rounded-lg border border-slate-200 p-3.5 transition-colors hover:border-brand-600 hover:bg-brand-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success-50 text-success-600">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">Excel workbook</span>
                <span className="block text-xs text-slate-500">
                  Readable in Excel or Google Sheets — leads, activities and team on separate sheets
                </span>
              </span>
            </a>

            <a
              href="/api/backup?format=json"
              className="flex items-center gap-3 rounded-lg border border-slate-200 p-3.5 transition-colors hover:border-brand-600 hover:bg-brand-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-info-50 text-info-600">
                <FileJson className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">Complete data file (JSON)</span>
                <span className="block text-xs text-slate-500">
                  The full, restorable copy — use this one if you ever need to move or recover data
                </span>
              </span>
            </a>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Export leads only</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-600">
              Just the lead list, in a spreadsheet you can filter and share.
            </p>
            <div className="flex gap-2">
              <a
                href="/api/leads/export?format=xlsx"
                className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </a>
              <a
                href="/api/leads/export?format=csv"
                className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Database className="h-4 w-4" />
                CSV
              </a>
            </div>
            <p className="text-xs text-slate-500">
              Tip: apply filters on the Leads page first, then export from there to get exactly
              that view.
            </p>
          </CardBody>
        </Card>

        <div className="flex items-start gap-2.5 rounded-lg bg-slate-100 p-3.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p className="text-xs text-slate-600">
            Backup files contain your customers&apos; personal details. Store them securely and do not
            share them outside your business. Passwords are never included in a backup.
          </p>
        </div>
      </div>
    </>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2.5">
      <p className="tabular text-xl font-semibold text-slate-900">{value.toLocaleString('en-IN')}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
