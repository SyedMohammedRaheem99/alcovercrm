'use client';

import { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select, ChipSelect, Input } from '@/components/ui/Input';
import {
  STAGE_OPTIONS,
  PRIORITY_OPTIONS,
  SOURCE_OPTIONS,
  MATERIAL_OPTIONS,
  FOLLOW_UP_BUCKETS,
  FOLLOW_UP_BUCKET_LABELS,
  type LeadStage,
  type Priority,
  type LeadSource,
  type Material,
  type FollowUpBucket,
} from '@/lib/constants/enums';

export interface LeadFilterState {
  q: string;
  stage: LeadStage[];
  priority: Priority[];
  source: LeadSource[];
  material: Material[];
  followUp: FollowUpBucket | '';
  assignedTo: string;
  city: string;
  from: string;
  to: string;
  sort: string;
  /** Set by the dashboard's speed-to-lead alert; mirrors that exact query. */
  slaBreached: boolean;
}

export const EMPTY_FILTERS: LeadFilterState = {
  q: '',
  stage: [],
  priority: [],
  source: [],
  material: [],
  followUp: '',
  assignedTo: '',
  city: '',
  from: '',
  to: '',
  sort: '-createdAt',
  slaBreached: false,
};

/** Chips shown above the list — the filters people actually reach for daily. */
const QUICK_FILTERS: Array<{ key: string; label: string; apply: Partial<LeadFilterState> }> = [
  { key: 'overdue', label: 'Overdue', apply: { followUp: 'OVERDUE' } },
  { key: 'today', label: 'Due today', apply: { followUp: 'TODAY' } },
  { key: 'mine', label: 'My leads', apply: { assignedTo: 'me' } },
  { key: 'unassigned', label: 'Unassigned', apply: { assignedTo: 'unassigned' } },
  { key: 'hot', label: 'Hot', apply: { priority: ['HOT'] } },
  { key: 'new', label: 'New', apply: { stage: ['NEW'] } },
];

export function countActiveFilters(f: LeadFilterState): number {
  let n = 0;
  if (f.stage.length) n++;
  if (f.priority.length) n++;
  if (f.source.length) n++;
  if (f.material.length) n++;
  if (f.followUp) n++;
  if (f.assignedTo) n++;
  if (f.city) n++;
  if (f.from || f.to) n++;
  if (f.slaBreached) n++;
  return n;
}

export function LeadFilters({
  filters,
  onChange,
  team,
}: {
  filters: LeadFilterState;
  onChange: (next: LeadFilterState) => void;
  team: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  // Edited in a local copy so closing the sheet without applying discards changes.
  const [draft, setDraft] = useState<LeadFilterState>(filters);

  const activeCount = countActiveFilters(filters);

  const openSheet = () => {
    setDraft(filters);
    setOpen(true);
  };

  const isQuickActive = (apply: Partial<LeadFilterState>) =>
    Object.entries(apply).every(([key, value]) => {
      const current = filters[key as keyof LeadFilterState];
      return Array.isArray(value) ? JSON.stringify(current) === JSON.stringify(value) : current === value;
    });

  const toggleQuick = (apply: Partial<LeadFilterState>) => {
    if (isQuickActive(apply)) {
      // Turning a chip off resets just the keys it set.
      const cleared = Object.keys(apply).reduce<Partial<LeadFilterState>>((acc, key) => {
        const k = key as keyof LeadFilterState;
        return { ...acc, [k]: EMPTY_FILTERS[k] };
      }, {});
      onChange({ ...filters, ...cleared });
    } else {
      onChange({ ...filters, ...apply });
    }
  };

  return (
    <>
      <div className="space-y-2.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              inputMode="search"
              value={filters.q}
              onChange={(e) => onChange({ ...filters, q: e.target.value })}
              placeholder="Search name, phone or code"
              className="h-11 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-base placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              aria-label="Search leads"
            />
          </div>
          <button
            type="button"
            onClick={openSheet}
            className={cn(
              'relative flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium',
              activeCount > 0
                ? 'border-brand-700 bg-brand-50 text-brand-700'
                : 'border-slate-300 bg-white text-slate-700',
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {activeCount > 0 && (
              <span className="tabular ml-0.5 rounded-full bg-brand-700 px-1.5 text-[11px] font-semibold text-white">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {/* Horizontally scrollable chips — no wrapping on narrow phones */}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {QUICK_FILTERS.map((qf) => {
            const active = isQuickActive(qf.apply);
            return (
              <button
                key={qf.key}
                type="button"
                onClick={() => toggleQuick(qf.apply)}
                className={cn(
                  // min-h-[36px] keeps these thumb-friendly without making the
                  // chip row bulky; they sit in a horizontal scroller.
                  'min-h-[36px] shrink-0 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors',
                  active
                    ? 'border-brand-700 bg-brand-700 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {qf.label}
              </button>
            );
          })}
          {filters.slaBreached && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, slaBreached: false })}
              className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-full border border-danger-600 bg-danger-600 px-3.5 py-2 text-xs font-medium text-white"
            >
              Not called yet
              <X className="h-3 w-3" />
            </button>
          )}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...EMPTY_FILTERS, q: filters.q, sort: filters.sort })}
              className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-xs font-medium text-slate-500 hover:text-danger-600"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Filter leads"
        footer={
          <>
            <Button
              variant="outline"
              fullWidth
              onClick={() => setDraft({ ...EMPTY_FILTERS, q: draft.q, sort: draft.sort })}
            >
              Reset
            </Button>
            <Button
              fullWidth
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        <div className="space-y-5 py-1">
          <Select
            label="Follow-up"
            value={draft.followUp}
            onChange={(e) => setDraft({ ...draft, followUp: e.target.value as FollowUpBucket | '' })}
            placeholder="Any"
            options={FOLLOW_UP_BUCKETS.map((b) => ({ value: b, label: FOLLOW_UP_BUCKET_LABELS[b] }))}
          />

          <Select
            label="Assigned to"
            value={draft.assignedTo}
            onChange={(e) => setDraft({ ...draft, assignedTo: e.target.value })}
            placeholder="Anyone"
            options={[
              { value: 'me', label: 'Me' },
              { value: 'unassigned', label: 'Unassigned' },
              ...team.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />

          <ChipSelect
            label="Stage"
            options={STAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={draft.stage}
            onChange={(stage) => setDraft({ ...draft, stage })}
          />

          <ChipSelect
            label="Priority"
            options={PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={draft.priority}
            onChange={(priority) => setDraft({ ...draft, priority })}
          />

          <ChipSelect
            label="Material"
            options={MATERIAL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={draft.material}
            onChange={(material) => setDraft({ ...draft, material })}
          />

          <ChipSelect
            label="Source"
            options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={draft.source}
            onChange={(source) => setDraft({ ...draft, source })}
          />

          <Input
            label="City or area"
            value={draft.city}
            onChange={(e) => setDraft({ ...draft, city: e.target.value })}
            placeholder="e.g. Gachibowli"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              type="date"
              label="Created from"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
            <Input
              type="date"
              label="Created to"
              value={draft.to}
              onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            />
          </div>

          <Select
            label="Sort by"
            value={draft.sort}
            onChange={(e) => setDraft({ ...draft, sort: e.target.value })}
            options={[
              { value: '-createdAt', label: 'Newest first' },
              { value: 'createdAt', label: 'Oldest first' },
              { value: 'nextFollowUpAt', label: 'Follow-up soonest' },
              { value: '-score', label: 'Highest score' },
              { value: '-updatedAt', label: 'Recently updated' },
              { value: 'name', label: 'Name (A-Z)' },
            ]}
          />
        </div>
      </Modal>
    </>
  );
}
