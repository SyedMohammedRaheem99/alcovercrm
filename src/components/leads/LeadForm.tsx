'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select, ChipSelect, Checkbox } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { apiFetch, ApiError, useDebounced } from '@/lib/hooks/useApi';
import {
  SOURCE_OPTIONS,
  MATERIAL_OPTIONS,
  PRODUCT_TYPE_OPTIONS,
  GLASS_TYPE_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  CONSTRUCTION_STAGE_OPTIONS,
  TIMELINE_OPTIONS,
  DECISION_MAKER_OPTIONS,
  STAGE_OPTIONS,
  type Material,
  type ProductType,
  type GlassType,
} from '@/lib/constants/enums';

interface DuplicateInfo {
  id: string;
  leadCode: string;
  name: string;
  stage: string;
  assignedToName?: string;
}

export interface LeadFormValues {
  name: string;
  phone: string;
  altPhone: string;
  email: string;
  source: string;
  sourceDetail: string;
  stage: string;
  address: { line1: string; area: string; city: string; state: string; pincode: string; landmark: string };
  googleMapsLink: string;
  materials: Material[];
  productTypes: ProductType[];
  glassTypes: GlassType[];
  approxAreaSqft: string;
  unitCount: string;
  requirementNotes: string;
  propertyType: string;
  constructionStage: string;
  timeline: string;
  budgetMin: string;
  budgetMax: string;
  decisionMaker: string;
  assignedTo: string;
  nextFollowUpAt: string;
  nextFollowUpNote: string;
  notes: string;
}

export const emptyLead: LeadFormValues = {
  name: '',
  phone: '',
  altPhone: '',
  email: '',
  source: 'WEBSITE',
  sourceDetail: '',
  stage: 'NEW',
  address: { line1: '', area: '', city: '', state: '', pincode: '', landmark: '' },
  googleMapsLink: '',
  materials: [],
  productTypes: [],
  glassTypes: [],
  approxAreaSqft: '',
  unitCount: '',
  requirementNotes: '',
  propertyType: '',
  constructionStage: '',
  timeline: '',
  budgetMin: '',
  budgetMax: '',
  decisionMaker: '',
  assignedTo: '',
  nextFollowUpAt: '',
  nextFollowUpNote: '',
  notes: '',
};

/**
 * Add / edit lead.
 *
 * Two modes:
 *  - `quick`: name, phone, source only. Built for a salesperson standing at a
 *    site — everything else is collapsed behind "Add more details".
 *  - full: every qualification field, grouped into collapsible sections.
 */
export function LeadForm({
  mode = 'full',
  leadId,
  initial,
  team,
}: {
  mode?: 'quick' | 'full';
  leadId?: string;
  initial?: Partial<LeadFormValues>;
  team: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const toast = useToast();

  const [values, setValues] = useState<LeadFormValues>({ ...emptyLead, ...initial });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(mode === 'full');

  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const debouncedPhone = useDebounced(values.phone, 500);

  const set = useCallback(<K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => (e[key as string] ? { ...e, [key as string]: [] } : e));
  }, []);

  /**
   * Duplicate check runs while typing, so the warning appears before the user
   * fills in the rest of the form — not after they hit save.
   */
  useEffect(() => {
    const digits = debouncedPhone.replace(/\D/g, '');
    if (digits.length < 6) {
      setDuplicate(null);
      return;
    }

    let cancelled = false;
    setCheckingDuplicate(true);

    apiFetch<{ duplicate: DuplicateInfo | null }>(
      `/api/leads/check-duplicate?phone=${encodeURIComponent(debouncedPhone)}${leadId ? `&excludeId=${leadId}` : ''}`,
    )
      .then((res) => {
        if (!cancelled) setDuplicate(res.data.duplicate);
      })
      .catch(() => {
        if (!cancelled) setDuplicate(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingDuplicate(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedPhone, leadId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);

    // Blank strings must become `undefined` — an empty enum value would fail
    // validation, and an empty date would be stored as an invalid date.
    const clean = <T,>(v: T | '' | undefined): T | undefined => (v === '' || v === undefined ? undefined : (v as T));
    const num = (v: string) => (v === '' ? undefined : Number(v));

    const payload: Record<string, unknown> = {
      name: values.name,
      phone: values.phone,
      altPhone: clean(values.altPhone),
      email: clean(values.email),
      source: values.source,
      sourceDetail: clean(values.sourceDetail),
      stage: values.stage,
      address: {
        line1: clean(values.address.line1),
        area: clean(values.address.area),
        city: clean(values.address.city),
        state: clean(values.address.state),
        pincode: clean(values.address.pincode),
        landmark: clean(values.address.landmark),
      },
      googleMapsLink: clean(values.googleMapsLink),
      materials: values.materials,
      productTypes: values.productTypes,
      glassTypes: values.glassTypes,
      approxAreaSqft: num(values.approxAreaSqft),
      unitCount: num(values.unitCount),
      requirementNotes: clean(values.requirementNotes),
      propertyType: clean(values.propertyType),
      constructionStage: clean(values.constructionStage),
      timeline: clean(values.timeline),
      budgetMin: num(values.budgetMin),
      budgetMax: num(values.budgetMax),
      decisionMaker: clean(values.decisionMaker),
      assignedTo: clean(values.assignedTo),
      nextFollowUpAt: clean(values.nextFollowUpAt),
      nextFollowUpNote: clean(values.nextFollowUpNote),
      notes: clean(values.notes),
      whatsappSameAsPhone: true,
    };

    try {
      if (leadId) {
        await apiFetch(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast.success('Lead updated');
        router.push(`/leads/${leadId}`);
      } else {
        const res = await apiFetch<{ _id: string }>('/api/leads', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('Lead added');
        router.push(`/leads/${res.data._id}`);
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.fieldErrors) setFieldErrors(err.fieldErrors);
      } else {
        setFormError('Could not save the lead. Please try again.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  const err = (key: string) => fieldErrors[key]?.[0];

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl px-4 py-4 pb-28 sm:px-6" noValidate>
      {formError && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* ---- Essentials ---- */}
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <Input
          label="Customer name"
          required
          autoFocus
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          error={err('name')}
          placeholder="e.g. Ramesh Kumar"
          autoCapitalize="words"
        />

        <div>
          <Input
            label="Phone number"
            required
            type="tel"
            inputMode="tel"
            value={values.phone}
            onChange={(e) => set('phone', e.target.value)}
            error={err('phone')}
            placeholder="98765 43210"
            rightSlot={
              checkingDuplicate ? (
                <span className="pr-2">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                </span>
              ) : undefined
            }
          />

          {duplicate && (
            <div className="mt-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2.5">
              <p className="flex items-start gap-2 text-sm font-medium text-warning-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                This number already exists
              </p>
              <p className="mt-1 pl-6 text-xs text-warning-700">
                {duplicate.name} ({duplicate.leadCode})
                {duplicate.assignedToName && ` · assigned to ${duplicate.assignedToName}`}
              </p>
              <Link
                href={`/leads/${duplicate.id}`}
                className="mt-1.5 inline-block pl-6 text-xs font-semibold text-brand-700 underline"
              >
                Open the existing lead
              </Link>
            </div>
          )}
        </div>

        <Select
          label="Where did this lead come from?"
          required
          value={values.source}
          onChange={(e) => set('source', e.target.value)}
          error={err('source')}
          options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Area / locality"
            value={values.address.area}
            onChange={(e) => set('address', { ...values.address, area: e.target.value })}
            placeholder="e.g. Gachibowli"
          />
          <Input
            label="City"
            value={values.address.city}
            onChange={(e) => set('address', { ...values.address, city: e.target.value })}
            placeholder="e.g. Hyderabad"
          />
        </div>

        {team.length > 0 && (
          <Select
            label="Assign to"
            value={values.assignedTo}
            onChange={(e) => set('assignedTo', e.target.value)}
            placeholder="Unassigned"
            options={team.map((m) => ({ value: m.id, label: m.name }))}
          />
        )}
      </section>

      {/* ---- Expandable detail ---- */}
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white py-3 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900"
        >
          Add more details
          <ChevronDown className="h-4 w-4" />
        </button>
      ) : (
        <>
          <Section title="Requirement">
            <ChipSelect
              label="Material"
              options={MATERIAL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={values.materials}
              onChange={(v) => set('materials', v)}
            />
            <ChipSelect
              label="Products needed"
              options={PRODUCT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={values.productTypes}
              onChange={(v) => set('productTypes', v)}
            />
            <ChipSelect
              label="Glass type"
              options={GLASS_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={values.glassTypes}
              onChange={(v) => set('glassTypes', v)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Approx. area (sq.ft)"
                type="number"
                inputMode="numeric"
                value={values.approxAreaSqft}
                onChange={(e) => set('approxAreaSqft', e.target.value)}
                placeholder="e.g. 450"
              />
              <Input
                label="No. of units"
                type="number"
                inputMode="numeric"
                value={values.unitCount}
                onChange={(e) => set('unitCount', e.target.value)}
                placeholder="e.g. 12"
              />
            </div>
            <Textarea
              label="Requirement notes"
              value={values.requirementNotes}
              onChange={(e) => set('requirementNotes', e.target.value)}
              placeholder="What exactly does the customer need?"
              rows={3}
            />
          </Section>

          <Section title="Qualification">
            <Select
              label="Property type"
              value={values.propertyType}
              onChange={(e) => set('propertyType', e.target.value)}
              placeholder="Not specified"
              options={PROPERTY_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <Select
              label="Construction stage"
              hint="The strongest signal of how soon they will buy"
              value={values.constructionStage}
              onChange={(e) => set('constructionStage', e.target.value)}
              placeholder="Not specified"
              options={CONSTRUCTION_STAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <Select
              label="Buying timeline"
              value={values.timeline}
              onChange={(e) => set('timeline', e.target.value)}
              placeholder="Not specified"
              options={TIMELINE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Budget from (₹)"
                type="number"
                inputMode="numeric"
                value={values.budgetMin}
                onChange={(e) => set('budgetMin', e.target.value)}
              />
              <Input
                label="Budget to (₹)"
                type="number"
                inputMode="numeric"
                value={values.budgetMax}
                onChange={(e) => set('budgetMax', e.target.value)}
                error={err('budgetMax')}
              />
            </div>
            <Select
              label="Who decides?"
              value={values.decisionMaker}
              onChange={(e) => set('decisionMaker', e.target.value)}
              placeholder="Not specified"
              options={DECISION_MAKER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </Section>

          <Section title="Contact details">
            <Input
              label="Alternate phone"
              type="tel"
              inputMode="tel"
              value={values.altPhone}
              onChange={(e) => set('altPhone', e.target.value)}
              error={err('altPhone')}
            />
            <Input
              label="Email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
              error={err('email')}
            />
            <Input
              label="Address"
              value={values.address.line1}
              onChange={(e) => set('address', { ...values.address, line1: e.target.value })}
              placeholder="House / plot / street"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Landmark"
                value={values.address.landmark}
                onChange={(e) => set('address', { ...values.address, landmark: e.target.value })}
              />
              <Input
                label="Pincode"
                inputMode="numeric"
                value={values.address.pincode}
                onChange={(e) => set('address', { ...values.address, pincode: e.target.value })}
              />
            </div>
            <Input
              label="Google Maps link"
              hint="Paste a location link for accurate site-visit directions"
              value={values.googleMapsLink}
              onChange={(e) => set('googleMapsLink', e.target.value)}
              placeholder="https://maps.app.goo.gl/..."
            />
          </Section>

          <Section title="Follow-up & status">
            <Select
              label="Stage"
              value={values.stage}
              onChange={(e) => set('stage', e.target.value)}
              options={STAGE_OPTIONS.filter((o) => o.value !== 'LOST').map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
            <Input
              label="Next follow-up"
              type="datetime-local"
              value={values.nextFollowUpAt}
              onChange={(e) => set('nextFollowUpAt', e.target.value)}
            />
            <Input
              label="Follow-up note"
              value={values.nextFollowUpNote}
              onChange={(e) => set('nextFollowUpNote', e.target.value)}
              placeholder="e.g. Send revised quotation"
            />
            <Textarea
              label="Internal notes"
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
            />
          </Section>
        </>
      )}

      {/* Sticky save bar — always reachable without scrolling on a long form */}
      <div className="safe-bottom fixed inset-x-0 bottom-16 z-30 border-t border-slate-200 bg-white px-4 py-3 lg:bottom-0 lg:px-6">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" fullWidth loading={submitting}>
            {leadId ? 'Save changes' : 'Add lead'}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 rounded-lg border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-900">
        {title}
      </h2>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}
