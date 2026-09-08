'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Phone,
  MessageCircle,
  Pencil,
  UserPlus2,
  MapPin,
  Copy,
  Share2,
  Trash2,
  ChevronDown,
  IndianRupee,
  Building2,
  CalendarClock,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Select, Input } from '@/components/ui/Input';
import { StageBadge, PriorityBadge, SourceBadge, Chip } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { LeadTimeline, type TimelineActivity } from '@/components/leads/LeadTimeline';
import { LogActivityModal } from '@/components/leads/LogActivityModal';
import { apiFetch, ApiError } from '@/lib/hooks/useApi';
import { callHref, whatsappHref, mapsHref, downloadVCard, copyToClipboard, shareLead, renderTemplate } from '@/lib/utils/contact';
import { formatPhoneDisplay } from '@/lib/utils/phone';
import { formatDate, formatDateTime, formatFollowUpLabel, getFollowUpBucket } from '@/lib/utils/dates';
import {
  STAGE_OPTIONS,
  LOST_REASON_OPTIONS,
  MATERIAL_LABELS,
  PRODUCT_TYPE_LABELS,
  GLASS_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  CONSTRUCTION_STAGE_LABELS,
  TIMELINE_LABELS,
  DECISION_MAKER_LABELS,
  LOST_REASON_LABELS,
  type LeadStage,
} from '@/lib/constants/enums';

interface LeadDetail {
  _id: string;
  leadCode: string;
  name: string;
  phone: string;
  altPhone?: string;
  email?: string;
  address?: { line1?: string; area?: string; city?: string; state?: string; pincode?: string; landmark?: string };
  googleMapsLink?: string;
  materials?: string[];
  productTypes?: string[];
  glassTypes?: string[];
  approxAreaSqft?: number;
  unitCount?: number;
  requirementNotes?: string;
  propertyType?: string;
  constructionStage?: string;
  timeline?: string;
  budgetMin?: number;
  budgetMax?: number;
  decisionMaker?: string;
  stage: LeadStage;
  priority: 'HOT' | 'WARM' | 'COLD';
  score?: number;
  source: string;
  sourceDetail?: string;
  assignedTo?: string;
  assignedToName?: string;
  nextFollowUpAt?: string;
  nextFollowUpNote?: string;
  firstContactedAt?: string;
  lastContactedAt?: string;
  contactAttempts?: number;
  dealValue?: number;
  lostReason?: string;
  lostReasonDetail?: string;
  tags?: string[];
  notes?: string;
  createdAt: string;
  isDeleted?: boolean;
}

interface Props {
  lead: LeadDetail;
  activities: TimelineActivity[];
  scoreFactors: Array<{ label: string; points: number }>;
  team: Array<{ id: string; name: string }>;
  orgName: string;
  timezone: string;
  whatsappCountryCode: string;
  whatsappTemplates: Array<{ key: string; label: string; value: string }>;
  requireNextAction: boolean;
  currentUserName: string;
  canEdit: boolean;
  canDelete: boolean;
  canAssign: boolean;
}

export function LeadDetailClient({
  lead,
  activities,
  scoreFactors,
  team,
  orgName,
  timezone,
  whatsappCountryCode,
  whatsappTemplates,
  requireNextAction,
  currentUserName,
  canEdit,
  canDelete,
  canAssign,
}: Props) {
  const router = useRouter();
  const toast = useToast();

  const [logOpen, setLogOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showScore, setShowScore] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const bucket = getFollowUpBucket(lead.nextFollowUpAt, timezone);
  const isOverdue = bucket === 'OVERDUE';
  const maps = mapsHref({ ...lead.address, googleMapsLink: lead.googleMapsLink });

  const refresh = () => router.refresh();

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiFetch(`/api/leads/${lead._id}`, { method: 'DELETE' });
      toast.success('Lead deleted');
      router.push('/leads');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete the lead');
      setDeleting(false);
    }
  }

  async function copyPhone() {
    const done = await copyToClipboard(lead.phone);
    done ? toast.success('Phone number copied') : toast.error('Could not copy');
  }

  return (
    <div className="pb-28">
      {/* ---------------- Header ---------------- */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-slate-900">{lead.name}</h1>
            <p className="tabular mt-0.5 text-sm text-slate-400">{lead.leadCode}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            {canEdit && (
              <Link href={`/leads/${lead._id}/edit`}>
                <Button variant="outline" size="icon" aria-label="Edit lead">
                  <Pencil className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label="Share"
              onClick={() => shareLead(lead).then((ok) => ok && toast.success('Shared'))}
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <StageBadge stage={lead.stage} />
          <PriorityBadge priority={lead.priority} />
          <SourceBadge source={lead.source as never} />
          {lead.score !== undefined && (
            <button
              onClick={() => setShowScore((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
            >
              <Sparkles className="h-3 w-3" />
              Score {lead.score}
              <ChevronDown className={cn('h-3 w-3 transition-transform', showScore && 'rotate-180')} />
            </button>
          )}
        </div>

        {showScore && scoreFactors.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-md bg-slate-50 p-3 text-xs">
            {scoreFactors.map((f) => (
              <li key={f.label} className="flex justify-between gap-3">
                <span className="text-slate-600">{f.label}</span>
                <span className={cn('tabular font-semibold', f.points > 0 ? 'text-success-600' : 'text-danger-600')}>
                  {f.points > 0 ? '+' : ''}
                  {f.points}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Follow-up banner — the most important line on the page */}
        {lead.nextFollowUpAt && (
          <div
            className={cn(
              'mt-3 flex items-start gap-2 rounded-md px-3 py-2.5 text-sm',
              isOverdue ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-700',
            )}
          >
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">
                {isOverdue ? 'Overdue follow-up' : 'Next follow-up'} · {formatFollowUpLabel(lead.nextFollowUpAt)}
              </p>
              {lead.nextFollowUpNote && <p className="mt-0.5 text-xs">{lead.nextFollowUpNote}</p>}
            </div>
          </div>
        )}

        {lead.stage === 'LOST' && lead.lostReason && (
          <p className="mt-3 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
            Lost: {LOST_REASON_LABELS[lead.lostReason as never]}
            {lead.lostReasonDetail && ` — ${lead.lostReasonDetail}`}
          </p>
        )}
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-6">
        {/* ---------------- Contact ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
            <button onClick={copyPhone} className="text-slate-400 hover:text-slate-700" aria-label="Copy phone">
              <Copy className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardBody className="space-y-2.5 text-sm">
            <Row label="Phone" value={formatPhoneDisplay(lead.phone)} />
            {lead.altPhone && <Row label="Alternate" value={formatPhoneDisplay(lead.altPhone)} />}
            {lead.email && <Row label="Email" value={lead.email} />}
            {(lead.address?.area || lead.address?.city) && (
              <Row
                label="Location"
                value={
                  <span className="flex items-center gap-1.5">
                    {[lead.address.line1, lead.address.area, lead.address.city, lead.address.pincode]
                      .filter(Boolean)
                      .join(', ')}
                    {maps && (
                      <a href={maps} target="_blank" rel="noopener noreferrer" className="text-brand-700">
                        <MapPin className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </span>
                }
              />
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadVCard({
                    name: lead.name,
                    phone: lead.phone,
                    altPhone: lead.altPhone,
                    email: lead.email,
                    leadCode: lead.leadCode,
                    address: lead.address,
                    requirementNotes: lead.requirementNotes,
                    orgName,
                  })
                }
              >
                Save to contacts
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* ---------------- Requirement ---------------- */}
        {(lead.materials?.length || lead.productTypes?.length || lead.requirementNotes) && (
          <Card>
            <CardHeader>
              <CardTitle>Requirement</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3 text-sm">
              {lead.materials?.length ? (
                <ChipRow label="Material" items={lead.materials.map((m) => MATERIAL_LABELS[m as never])} />
              ) : null}
              {lead.productTypes?.length ? (
                <ChipRow label="Products" items={lead.productTypes.map((p) => PRODUCT_TYPE_LABELS[p as never])} />
              ) : null}
              {lead.glassTypes?.length ? (
                <ChipRow label="Glass" items={lead.glassTypes.map((g) => GLASS_TYPE_LABELS[g as never])} />
              ) : null}
              {(lead.approxAreaSqft || lead.unitCount) && (
                <Row
                  label="Size"
                  value={[
                    lead.approxAreaSqft ? `${lead.approxAreaSqft} sq.ft` : null,
                    lead.unitCount ? `${lead.unitCount} units` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              )}
              {lead.requirementNotes && (
                <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-slate-600">
                  {lead.requirementNotes}
                </p>
              )}
            </CardBody>
          </Card>
        )}

        {/* ---------------- Qualification ---------------- */}
        {(lead.propertyType || lead.constructionStage || lead.timeline || lead.budgetMin) && (
          <Card>
            <CardHeader>
              <CardTitle>Qualification</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2.5 text-sm">
              {lead.propertyType && (
                <Row label="Property" value={PROPERTY_TYPE_LABELS[lead.propertyType as never]} />
              )}
              {lead.constructionStage && (
                <Row label="Stage of build" value={CONSTRUCTION_STAGE_LABELS[lead.constructionStage as never]} />
              )}
              {lead.timeline && <Row label="Timeline" value={TIMELINE_LABELS[lead.timeline as never]} />}
              {(lead.budgetMin || lead.budgetMax) && (
                <Row
                  label="Budget"
                  value={`₹${(lead.budgetMin ?? 0).toLocaleString('en-IN')} – ₹${(lead.budgetMax ?? 0).toLocaleString('en-IN')}`}
                />
              )}
              {lead.decisionMaker && (
                <Row label="Decision maker" value={DECISION_MAKER_LABELS[lead.decisionMaker as never]} />
              )}
              {lead.dealValue !== undefined && (
                <Row
                  label="Order value"
                  value={
                    <span className="tabular flex items-center gap-0.5 font-semibold text-success-600">
                      <IndianRupee className="h-3.5 w-3.5" />
                      {lead.dealValue.toLocaleString('en-IN')}
                    </span>
                  }
                />
              )}
            </CardBody>
          </Card>
        )}

        {/* ---------------- Meta ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            {canAssign && (
              <button
                onClick={() => setAssignOpen(true)}
                className="flex items-center gap-1 text-xs font-medium text-brand-700"
              >
                <UserPlus2 className="h-3.5 w-3.5" />
                Reassign
              </button>
            )}
          </CardHeader>
          <CardBody className="space-y-2.5 text-sm">
            <Row label="Assigned to" value={lead.assignedToName ?? 'Unassigned'} />
            <Row label="Added" value={formatDate(lead.createdAt)} />
            {lead.firstContactedAt && (
              <Row label="First contacted" value={formatDateTime(lead.firstContactedAt)} />
            )}
            <Row label="Contact attempts" value={String(lead.contactAttempts ?? 0)} />
            {lead.sourceDetail && <Row label="Campaign" value={lead.sourceDetail} />}
            {lead.notes && (
              <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-slate-600">{lead.notes}</p>
            )}
          </CardBody>
        </Card>

        {/* ---------------- Timeline ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Activity ({activities.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
              Log activity
            </Button>
          </CardHeader>
          <CardBody>
            <LeadTimeline activities={activities} />
          </CardBody>
        </Card>

        {canDelete && !lead.isDeleted && (
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 py-3 text-sm font-medium text-danger-600 hover:text-danger-700"
          >
            <Trash2 className="h-4 w-4" />
            Delete lead
          </button>
        )}
      </div>

      {/* ---------------- Sticky action bar ---------------- */}
      <div className="safe-bottom fixed inset-x-0 bottom-16 z-30 border-t border-slate-200 bg-white px-4 py-2.5 lg:bottom-0 lg:px-6">
        <div className="mx-auto flex max-w-3xl gap-2 lg:max-w-md">
          <a
            href={callHref(lead.phone, whatsappCountryCode)}
            onClick={() => window.setTimeout(() => setLogOpen(true), 800)}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-700 px-4 text-sm font-semibold text-white active:bg-brand-800"
          >
            <Phone className="h-4 w-4" />
            Call
          </a>
          <button
            onClick={() => setWaOpen(true)}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-4 text-sm font-semibold text-white active:brightness-95"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </button>
          <Button variant="outline" onClick={() => setStageOpen(true)} className="shrink-0">
            Stage
          </Button>
        </div>
      </div>

      {/* ---------------- Modals ---------------- */}
      <LogActivityModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        leadId={lead._id}
        leadName={lead.name}
        requireNextAction={requireNextAction}
        onLogged={() => {
          toast.success('Activity logged');
          refresh();
        }}
      />

      <StageModal
        open={stageOpen}
        onClose={() => setStageOpen(false)}
        leadId={lead._id}
        current={lead.stage}
        onDone={() => {
          toast.success('Stage updated');
          refresh();
        }}
        onError={(m) => toast.error(m)}
      />

      <AssignModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        leadId={lead._id}
        team={team}
        current={lead.assignedTo}
        onDone={() => {
          toast.success('Lead reassigned');
          refresh();
        }}
        onError={(m) => toast.error(m)}
      />

      <WhatsAppModal
        open={waOpen}
        onClose={() => setWaOpen(false)}
        lead={lead}
        orgName={orgName}
        userName={currentUserName}
        templates={whatsappTemplates}
        countryCode={whatsappCountryCode}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete this lead?"
        message="The lead is moved to deleted and hidden from lists. Its history is preserved and an admin can restore it."
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <span className="text-slate-500">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <Chip key={i}>{i}</Chip>
        ))}
      </div>
    </div>
  );
}

function StageModal({
  open,
  onClose,
  leadId,
  current,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  current: LeadStage;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [stage, setStage] = useState<LeadStage>(current);
  const [lostReason, setLostReason] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const closing = stage === 'WON' || stage === 'LOST';

  async function submit() {
    setSubmitting(true);
    try {
      await apiFetch(`/api/leads/${leadId}/stage`, {
        method: 'POST',
        body: JSON.stringify({
          stage,
          ...(stage === 'LOST' ? { lostReason } : {}),
          ...(stage === 'WON' && dealValue ? { dealValue: Number(dealValue) } : {}),
          ...(!closing && followUpAt ? { nextFollowUpAt: followUpAt } : {}),
        }),
      });
      onClose();
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not update the stage');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change stage"
      size="sm"
      footer={
        <>
          <Button variant="outline" fullWidth onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            fullWidth
            onClick={submit}
            loading={submitting}
            disabled={stage === 'LOST' && !lostReason}
          >
            Update
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-1">
        <Select
          label="Stage"
          value={stage}
          onChange={(e) => setStage(e.target.value as LeadStage)}
          options={STAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        {stage === 'LOST' && (
          <Select
            label="Reason"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            placeholder="Why was this lead lost?"
            options={LOST_REASON_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        )}
        {stage === 'WON' && (
          <Input
            label="Order value (₹)"
            type="number"
            inputMode="numeric"
            value={dealValue}
            onChange={(e) => setDealValue(e.target.value)}
          />
        )}
        {!closing && (
          <Input
            label="Next follow-up"
            type="datetime-local"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
          />
        )}
      </div>
    </Modal>
  );
}

function AssignModal({
  open,
  onClose,
  leadId,
  team,
  current,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  team: Array<{ id: string; name: string }>;
  current?: string;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [assignedTo, setAssignedTo] = useState(current ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await apiFetch(`/api/leads/${leadId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assignedTo: assignedTo || null }),
      });
      onClose();
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not reassign');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign lead"
      size="sm"
      footer={
        <>
          <Button variant="outline" fullWidth onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button fullWidth onClick={submit} loading={submitting}>
            Assign
          </Button>
        </>
      }
    >
      <Select
        label="Team member"
        value={assignedTo}
        onChange={(e) => setAssignedTo(e.target.value)}
        placeholder="Unassigned"
        options={team.map((m) => ({ value: m.id, label: m.name }))}
      />
    </Modal>
  );
}

function WhatsAppModal({
  open,
  onClose,
  lead,
  orgName,
  userName,
  templates,
  countryCode,
}: {
  open: boolean;
  onClose: () => void;
  lead: LeadDetail;
  orgName: string;
  userName: string;
  templates: Array<{ key: string; label: string; value: string }>;
  countryCode: string;
}) {
  const [message, setMessage] = useState('');

  const vars = {
    name: lead.name,
    company: orgName,
    user: userName,
    product: lead.materials?.[0] ? MATERIAL_LABELS[lead.materials[0] as never] : 'doors and windows',
    date: '',
    validity: '15',
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send WhatsApp"
      description={lead.name}
      footer={
        <>
          <Button variant="outline" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <a
            href={whatsappHref(lead.phone, message || undefined, countryCode)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-md bg-[#25D366] px-4 text-sm font-semibold text-white"
          >
            Open WhatsApp
          </a>
        </>
      }
    >
      <div className="space-y-3 py-1">
        <p className="text-xs text-slate-500">Pick a template or write your own message.</p>
        <div className="flex flex-wrap gap-1.5">
          {templates.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMessage(renderTemplate(t.value, vars))}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-600 hover:text-brand-700"
            >
              {t.label}
            </button>
          ))}
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="Type your message..."
          className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
      </div>
    </Modal>
  );
}
