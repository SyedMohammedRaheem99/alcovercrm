import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connectDB } from '@/lib/db/connect';
import { Organization, Master } from '@/lib/models';
import { requireUser } from '@/lib/auth/session';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingsClient } from './SettingsClient';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requireUser();
  if (!user.can('settings:manage') || !user.organizationId) redirect('/dashboard');

  await connectDB();

  const [org, templates] = await Promise.all([
    Organization.findById(user.organizationId).lean(),
    Master.find({
      organizationId: user.organizationId,
      type: 'WHATSAPP_TEMPLATE',
      isActive: true,
    })
      .sort({ sortOrder: 1 })
      .lean(),
  ]);

  if (!org) redirect('/dashboard');

  return (
    <>
      <PageHeader title="Settings" description={org.name} />
      <SettingsClient
        profile={{
          name: org.name,
          phone: org.phone,
          email: org.email,
          gstin: org.gstin,
        }}
        settings={{
          leadResponseSlaMinutes: org.settings.leadResponseSlaMinutes,
          requireNextActionOnCall: org.settings.requireNextActionOnCall,
          salesSeeAllLeads: org.settings.salesSeeAllLeads,
          whatsappCountryCode: org.settings.whatsappCountryCode,
          quotationValidityDays: org.settings.quotationValidityDays,
          leadCodePrefix: org.settings.leadCodePrefix,
        }}
        templates={templates.map((t) => ({
          id: String(t._id),
          key: t.key,
          label: t.label,
          value: t.value ?? '',
        }))}
      />
    </>
  );
}
