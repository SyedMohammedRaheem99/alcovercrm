'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, Save, MessageSquare, Building2, Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Checkbox, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { apiFetch, ApiError } from '@/lib/hooks/useApi';

interface OrgSettings {
  leadResponseSlaMinutes: number;
  requireNextActionOnCall: boolean;
  salesSeeAllLeads: boolean;
  whatsappCountryCode: string;
  quotationValidityDays: number;
  leadCodePrefix: string;
}

interface Props {
  profile: { name: string; phone?: string; email?: string; gstin?: string };
  settings: OrgSettings;
  templates: Array<{ id: string; key: string; label: string; value: string }>;
}

export function SettingsClient({ profile: initialProfile, settings: initialSettings, templates }: Props) {
  const toast = useToast();

  const [profile, setProfile] = useState(initialProfile);
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          profile: {
            name: profile.name,
            phone: profile.phone || undefined,
            email: profile.email || undefined,
            gstin: profile.gstin || undefined,
          },
          settings: {
            leadResponseSlaMinutes: Number(settings.leadResponseSlaMinutes),
            requireNextActionOnCall: settings.requireNextActionOnCall,
            salesSeeAllLeads: settings.salesSeeAllLeads,
            whatsappCountryCode: settings.whatsappCountryCode,
            quotationValidityDays: Number(settings.quotationValidityDays),
            leadCodePrefix: settings.leadCodePrefix,
          },
        }),
      });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-24 sm:px-6">
      {/* ---------------- Business profile ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-slate-400" />
            Business details
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="Business name"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            hint="Shown in WhatsApp templates and on exported files"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Phone"
              type="tel"
              value={profile.phone ?? ''}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={profile.email ?? ''}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            />
          </div>
          <Input
            label="GSTIN"
            value={profile.gstin ?? ''}
            onChange={(e) => setProfile({ ...profile, gstin: e.target.value })}
          />
        </CardBody>
      </Card>

      {/* ---------------- Behaviour ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-slate-400" />
            How the CRM behaves
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="rounded-md border border-slate-200 p-3">
            <Checkbox
              label={
                <span>
                  <span className="font-medium text-slate-900">Require a next step after every call</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Strongly recommended. A call must end with either a follow-up date or a reason
                    for closing the lead — this is what stops leads being forgotten.
                  </span>
                </span>
              }
              checked={settings.requireNextActionOnCall}
              onChange={(e) => setSettings({ ...settings, requireNextActionOnCall: e.target.checked })}
            />
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <Checkbox
              label={
                <span>
                  <span className="font-medium text-slate-900">Sales staff can see all leads</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Off by default — each salesperson sees only the leads assigned to them. Turn on
                    for a small team where everyone works everything.
                  </span>
                </span>
              }
              checked={settings.salesSeeAllLeads}
              onChange={(e) => setSettings({ ...settings, salesSeeAllLeads: e.target.checked })}
            />
          </div>

          <Input
            label="Response time target (minutes)"
            type="number"
            inputMode="numeric"
            value={String(settings.leadResponseSlaMinutes)}
            onChange={(e) =>
              setSettings({ ...settings, leadResponseSlaMinutes: Number(e.target.value) })
            }
            hint="New leads not called within this time are flagged on the dashboard. 30 minutes is a good target."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Lead code prefix"
              value={settings.leadCodePrefix}
              onChange={(e) =>
                setSettings({ ...settings, leadCodePrefix: e.target.value.toUpperCase().slice(0, 6) })
              }
              hint="e.g. RYL gives RYL-000123"
            />
            <Input
              label="WhatsApp country code"
              value={settings.whatsappCountryCode}
              onChange={(e) =>
                setSettings({ ...settings, whatsappCountryCode: e.target.value.replace(/\D/g, '').slice(0, 4) })
              }
              hint="91 for India"
            />
          </div>

          <Input
            label="Quotation validity (days)"
            type="number"
            inputMode="numeric"
            value={String(settings.quotationValidityDays)}
            onChange={(e) =>
              setSettings({ ...settings, quotationValidityDays: Number(e.target.value) })
            }
          />
        </CardBody>
      </Card>

      {/* ---------------- WhatsApp templates ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-slate-400" />
            WhatsApp templates
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-slate-600">
            These appear when you tap WhatsApp on a lead. Placeholders like{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{'{{name}}'}</code> are filled
            in automatically.
          </p>
          {templates.map((t) => (
            <div key={t.id} className="rounded-md border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-900">{t.label}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{t.value}</p>
            </div>
          ))}
          <p className="text-xs text-slate-400">
            Template editing is coming in a later update — these defaults cover the common cases.
          </p>
        </CardBody>
      </Card>

      {/* ---------------- Team link ---------------- */}
      <Link href="/settings/team">
        <Card className="transition-shadow hover:shadow-md">
          <CardBody className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <Users className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">Team members</span>
              <span className="block text-xs text-slate-500">
                Add staff, set roles, reset passwords
              </span>
            </span>
          </CardBody>
        </Card>
      </Link>

      {/* Sticky save bar */}
      <div className="safe-bottom fixed inset-x-0 bottom-16 z-30 border-t border-slate-200 bg-white px-4 py-3 lg:bottom-0 lg:px-6">
        <div className="mx-auto max-w-2xl">
          <Button fullWidth onClick={save} loading={saving}>
            <Save className="h-4 w-4" />
            Save settings
          </Button>
        </div>
      </div>
    </div>
  );
}
