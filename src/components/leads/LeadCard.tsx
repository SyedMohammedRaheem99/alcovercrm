'use client';

import Link from 'next/link';
import { Phone, MessageCircle, MapPin, Clock, User2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { StageBadge, PriorityBadge, Chip } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Input';
import { callHref, whatsappHref } from '@/lib/utils/contact';
import { formatPhoneDisplay } from '@/lib/utils/phone';
import { formatFollowUpLabel, getFollowUpBucket } from '@/lib/utils/dates';
import { MATERIAL_LABELS, type LeadStage, type Priority, type Material } from '@/lib/constants/enums';

export interface LeadListItem {
  _id: string;
  leadCode: string;
  name: string;
  phone: string;
  email?: string;
  address?: { area?: string; city?: string };
  materials?: Material[];
  stage: LeadStage;
  priority: Priority;
  score?: number;
  assignedToName?: string;
  nextFollowUpAt?: string;
  nextFollowUpNote?: string;
  firstContactedAt?: string;
  contactAttempts?: number;
  dealValue?: number;
  tags?: string[];
  createdAt: string;
  isDeleted?: boolean;
}

interface LeadCardProps {
  lead: LeadListItem;
  timezone?: string;
  whatsappCountryCode?: string;
  whatsappMessage?: string;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onCallLogged?: (lead: LeadListItem) => void;
}

/**
 * A lead as a card.
 *
 * Used on mobile in place of a table (a 12-column table is unusable on a
 * phone) and on desktop for the follow-up queues. Call and WhatsApp are
 * always one tap away, because that is the action the user came to perform.
 */
export function LeadCard({
  lead,
  timezone,
  whatsappCountryCode = '91',
  whatsappMessage,
  selectable,
  selected,
  onSelect,
  onCallLogged,
}: LeadCardProps) {
  const bucket = getFollowUpBucket(lead.nextFollowUpAt, timezone);
  const isOverdue = bucket === 'OVERDUE';
  const isDueToday = bucket === 'TODAY';
  const isUncontacted = !lead.firstContactedAt && lead.stage === 'NEW';

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md',
        isOverdue ? 'border-l-[3px] border-l-danger-600 border-slate-200' : 'border-slate-200',
        lead.isDeleted && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        {selectable && (
          <Checkbox
            checked={selected}
            onChange={(e) => onSelect?.(lead._id, e.target.checked)}
            className="pt-0.5"
            aria-label={`Select ${lead.name}`}
          />
        )}

        <div className="min-w-0 flex-1">
          {/* Name + code */}
          <div className="flex items-start justify-between gap-2">
            <Link href={`/leads/${lead._id}`} className="min-w-0 flex-1 group">
              <h3 className="truncate text-[15px] font-semibold text-slate-900 group-hover:text-brand-700">
                {lead.name}
              </h3>
              <p className="tabular mt-0.5 text-xs text-slate-400">{lead.leadCode}</p>
            </Link>
            <PriorityBadge priority={lead.priority} size="sm" />
          </div>

          {/* Phone + location */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="tabular font-medium">{formatPhoneDisplay(lead.phone)}</span>
            {(lead.address?.area || lead.address?.city) && (
              <span className="flex min-w-0 items-center gap-1 text-xs text-slate-500">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {[lead.address.area, lead.address.city].filter(Boolean).join(', ')}
                </span>
              </span>
            )}
          </div>

          {/* Stage + materials */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <StageBadge stage={lead.stage} size="sm" />
            {lead.materials?.slice(0, 2).map((m) => (
              <Chip key={m} className="text-[11px]">
                {MATERIAL_LABELS[m]}
              </Chip>
            ))}
            {(lead.materials?.length ?? 0) > 2 && (
              <span className="text-[11px] text-slate-400">+{lead.materials!.length - 2}</span>
            )}
          </div>

          {/* Follow-up / alert line */}
          {lead.nextFollowUpAt ? (
            <div
              className={cn(
                'mt-2.5 flex items-start gap-1.5 rounded-md px-2 py-1.5 text-xs',
                isOverdue
                  ? 'bg-danger-50 font-semibold text-danger-700'
                  : isDueToday
                    ? 'bg-warning-50 font-medium text-warning-700'
                    : 'bg-slate-50 text-slate-600',
              )}
            >
              {isOverdue ? (
                <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
              ) : (
                <Clock className="mt-px h-3.5 w-3.5 shrink-0" />
              )}
              <span className="min-w-0">
                {isOverdue && 'Overdue · '}
                {formatFollowUpLabel(lead.nextFollowUpAt)}
                {lead.nextFollowUpNote && (
                  <span className="font-normal opacity-80"> · {lead.nextFollowUpNote}</span>
                )}
              </span>
            </div>
          ) : isUncontacted ? (
            <div className="mt-2.5 flex items-center gap-1.5 rounded-md bg-danger-50 px-2 py-1.5 text-xs font-semibold text-danger-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Not contacted yet
            </div>
          ) : null}

          {/* Assignee */}
          {lead.assignedToName && (
            <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
              <User2 className="h-3 w-3" />
              {lead.assignedToName}
            </p>
          )}
        </div>
      </div>

      {/* Contact actions.
          Full width on mobile for one-handed use; on desktop they stop growing
          (sm:flex-none + a fixed basis) so they read as buttons rather than
          stretching across a wide card. */}
      <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
        <a
          href={callHref(lead.phone, whatsappCountryCode)}
          onClick={() => onCallLogged?.(lead)}
          className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-700 px-3 text-sm font-medium text-white active:bg-brand-800 sm:flex-none sm:basis-32"
        >
          <Phone className="h-4 w-4" />
          Call
        </a>
        <a
          href={whatsappHref(lead.phone, whatsappMessage, whatsappCountryCode)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-md bg-[#25D366] px-3 text-sm font-medium text-white active:brightness-95 sm:flex-none sm:basis-36"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </a>
        <Link
          href={`/leads/${lead._id}`}
          className="flex min-h-[40px] items-center justify-center rounded-md border border-slate-300 px-3.5 text-sm font-medium text-slate-700 active:bg-slate-100 sm:ml-auto"
        >
          Open
        </Link>
      </div>
    </div>
  );
}

export function LeadCardSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5">
      <div className="skeleton h-4 w-1/3 rounded" />
      <div className="skeleton mt-2 h-3 w-1/4 rounded" />
      <div className="skeleton mt-3 h-3 w-1/2 rounded" />
      <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
        <div className="skeleton h-10 flex-1 rounded-md" />
        <div className="skeleton h-10 flex-1 rounded-md" />
      </div>
    </div>
  );
}
