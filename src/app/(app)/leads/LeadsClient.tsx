'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Users, ChevronLeft, ChevronRight, CheckSquare, Trash2, UserPlus, Tag } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { LeadCard, LeadCardSkeleton, type LeadListItem } from '@/components/leads/LeadCard';
import { LeadFilters, EMPTY_FILTERS, type LeadFilterState } from '@/components/leads/LeadFilters';
import { useFetch, useDebounced, apiFetch } from '@/lib/hooks/useApi';
import { STAGE_OPTIONS, LOST_REASON_OPTIONS, type LeadStage } from '@/lib/constants/enums';

interface Props {
  timezone: string;
  whatsappCountryCode: string;
  canBulkEdit: boolean;
  canDelete: boolean;
  canAssign: boolean;
}

/** Read filter state out of the URL so a filtered view is shareable and survives reload. */
function filtersFromParams(params: URLSearchParams): LeadFilterState {
  const list = (key: string) => (params.get(key) ? params.get(key)!.split(',').filter(Boolean) : []);
  return {
    q: params.get('q') ?? '',
    stage: list('stage') as LeadFilterState['stage'],
    priority: list('priority') as LeadFilterState['priority'],
    source: list('source') as LeadFilterState['source'],
    material: list('material') as LeadFilterState['material'],
    followUp: (params.get('followUp') ?? '') as LeadFilterState['followUp'],
    assignedTo: params.get('assignedTo') ?? '',
    city: params.get('city') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    sort: params.get('sort') ?? '-createdAt',
    slaBreached: params.get('slaBreached') === 'true',
  };
}

function buildQueryString(f: LeadFilterState, page: number): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.stage.length) p.set('stage', f.stage.join(','));
  if (f.priority.length) p.set('priority', f.priority.join(','));
  if (f.source.length) p.set('source', f.source.join(','));
  if (f.material.length) p.set('material', f.material.join(','));
  if (f.followUp) p.set('followUp', f.followUp);
  if (f.assignedTo) p.set('assignedTo', f.assignedTo);
  if (f.city) p.set('city', f.city);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.sort && f.sort !== '-createdAt') p.set('sort', f.sort);
  if (f.slaBreached) p.set('slaBreached', 'true');
  if (page > 1) p.set('page', String(page));
  return p.toString();
}

export function LeadsClient({ timezone, whatsappCountryCode, canBulkEdit, canDelete, canAssign }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [filters, setFilters] = useState<LeadFilterState>(() => filtersFromParams(searchParams));
  const [page, setPage] = useState(() => Number(searchParams.get('page') ?? 1));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Debounced so typing in the search box does not fire a request per keystroke.
  const debouncedQ = useDebounced(filters.q, 400);
  const effectiveFilters = useMemo(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);

  const queryString = buildQueryString(effectiveFilters, page);
  const { data, meta, loading, error, refetch } = useFetch<LeadListItem[]>(
    `/api/leads?${queryString}&limit=25`,
  );

  const { data: team } = useFetch<Array<{ id: string; name: string }>>('/api/team');

  // Mirror filter state into the URL without adding history entries per keystroke.
  useEffect(() => {
    const qs = buildQueryString(effectiveFilters, page);
    router.replace(qs ? `/leads?${qs}` : '/leads', { scroll: false });
  }, [effectiveFilters, page, router]);

  const updateFilters = useCallback((next: LeadFilterState) => {
    setFilters(next);
    setPage(1); // a changed filter invalidates the current page number
  }, []);

  const total = (meta?.total as number) ?? 0;
  const pages = (meta?.pages as number) ?? 1;

  const toggleSelect = (id: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllOnPage = () => {
    if (!data) return;
    setSelected((prev) =>
      prev.size === data.length ? new Set() : new Set(data.map((l) => l._id)),
    );
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  return (
    <div className="px-4 py-4 sm:px-6">
      <LeadFilters filters={filters} onChange={updateFilters} team={team ?? []} />

      {/* Result count + bulk toggle */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {loading ? 'Loading…' : <><span className="tabular font-medium text-slate-900">{total}</span> {total === 1 ? 'lead' : 'leads'}</>}
        </p>

        {canBulkEdit && (data?.length ?? 0) > 0 && (
          selectMode ? (
            <div className="flex items-center gap-2">
              <button onClick={selectAllOnPage} className="-my-2 py-2 text-sm font-medium text-brand-700">
                {selected.size === data?.length ? 'Clear' : 'Select all'}
              </button>
              <button onClick={exitSelectMode} className="-my-2 py-2 text-sm text-slate-500">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              className="-my-2 flex items-center gap-1.5 py-2 text-sm font-medium text-slate-600 hover:text-brand-700"
            >
              <CheckSquare className="h-4 w-4" />
              Select
            </button>
          )
        )}
      </div>

      {/* List */}
      <div className="mt-3 space-y-2.5">
        {loading && !data ? (
          Array.from({ length: 5 }, (_, i) => <LeadCardSkeleton key={i} />)
        ) : error ? (
          <EmptyState
            title="Could not load leads"
            description={error}
            action={<Button onClick={refetch}>Try again</Button>}
          />
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No leads found"
            description={
              filters.q || filters.stage.length
                ? 'Try changing or clearing your filters.'
                : 'Add your first lead to get started.'
            }
            action={
              <Link href="/leads/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Add lead
                </Button>
              </Link>
            }
          />
        ) : (
          data!.map((lead) => (
            <LeadCard
              key={lead._id}
              lead={lead}
              timezone={timezone}
              whatsappCountryCode={whatsappCountryCode}
              selectable={selectMode}
              selected={selected.has(lead._id)}
              onSelect={toggleSelect}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="mt-5 flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              setPage((p) => p - 1);
              window.scrollTo({ top: 0 });
            }}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="tabular text-sm text-slate-500">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => {
              setPage((p) => p + 1);
              window.scrollTo({ top: 0 });
            }}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Bulk action bar — appears only when rows are selected */}
      {selectMode && selected.size > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-16 z-40 mx-4 flex items-center justify-between gap-3 rounded-lg bg-slate-900 px-4 py-3 shadow-lg lg:bottom-4 lg:mx-auto lg:max-w-lg">
          <span className="tabular text-sm font-medium text-white">{selected.size} selected</span>
          <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>
            Actions
          </Button>
        </div>
      )}

      <BulkActionModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        count={selected.size}
        leadIds={Array.from(selected)}
        team={team ?? []}
        canDelete={canDelete}
        canAssign={canAssign}
        onDone={() => {
          setBulkOpen(false);
          exitSelectMode();
          refetch();
          toast.success('Leads updated');
        }}
        onError={(m) => toast.error(m)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BulkActionModal({
  open,
  onClose,
  count,
  leadIds,
  team,
  canDelete,
  canAssign,
  onDone,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  leadIds: string[];
  team: Array<{ id: string; name: string }>;
  canDelete: boolean;
  canAssign: boolean;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [action, setAction] = useState<'ASSIGN' | 'STAGE' | 'DELETE'>('ASSIGN');
  const [assignedTo, setAssignedTo] = useState('');
  const [stage, setStage] = useState<LeadStage>('CONTACTED');
  const [lostReason, setLostReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await apiFetch('/api/leads/bulk', {
        method: 'POST',
        body: JSON.stringify({
          leadIds,
          action,
          ...(action === 'ASSIGN' ? { assignedTo } : {}),
          ...(action === 'STAGE' ? { stage, ...(stage === 'LOST' ? { lostReason } : {}) } : {}),
        }),
      });
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not update the leads');
    } finally {
      setSubmitting(false);
    }
  }

  const actionOptions = [
    ...(canAssign ? [{ value: 'ASSIGN', label: 'Assign to team member' }] : []),
    { value: 'STAGE', label: 'Change stage' },
    ...(canDelete ? [{ value: 'DELETE', label: 'Delete' }] : []),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Update ${count} ${count === 1 ? 'lead' : 'leads'}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" fullWidth onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            fullWidth
            variant={action === 'DELETE' ? 'danger' : 'primary'}
            onClick={submit}
            loading={submitting}
            disabled={action === 'ASSIGN' && !assignedTo}
          >
            {action === 'DELETE' ? 'Delete' : 'Apply'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-1">
        <Select
          label="Action"
          value={action}
          onChange={(e) => setAction(e.target.value as typeof action)}
          options={actionOptions}
        />

        {action === 'ASSIGN' && (
          <Select
            label="Assign to"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="Choose a team member"
            options={team.map((m) => ({ value: m.id, label: m.name }))}
          />
        )}

        {action === 'STAGE' && (
          <>
            <Select
              label="New stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as LeadStage)}
              options={STAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            {stage === 'LOST' && (
              <Select
                label="Reason for losing"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder="Select a reason"
                options={LOST_REASON_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            )}
          </>
        )}

        {action === 'DELETE' && (
          <p className="rounded-md bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
            These leads will be moved to deleted. Their history is preserved and an admin can
            restore them.
          </p>
        )}
      </div>
    </Modal>
  );
}
