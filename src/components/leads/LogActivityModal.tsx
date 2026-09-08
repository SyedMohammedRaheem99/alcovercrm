'use client';

import { useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { apiFetch, ApiError } from '@/lib/hooks/useApi';
import { FOLLOW_UP_PRESETS } from '@/lib/utils/dates';
import {
  CALL_OUTCOME_OPTIONS,
  LOST_REASON_OPTIONS,
  MANUAL_ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  CONNECTED_OUTCOMES,
  type ActivityType,
  type CallOutcome,
} from '@/lib/constants/enums';

/**
 * Log a call / message / visit.
 *
 * This modal is where the CRM's core rule is expressed to the user: after a
 * contact attempt you must either schedule the next step or close the lead with
 * a reason. The UI makes the right choice the easy one — a next follow-up is
 * pre-selected — and the server enforces the same rule regardless.
 */

function toLocalInputValue(date: Date): string {
  // datetime-local needs a local-time string, not an ISO/UTC string.
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function LogActivityModal({
  open,
  onClose,
  leadId,
  leadName,
  defaultType = 'CALL',
  requireNextAction,
  onLogged,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
  defaultType?: ActivityType;
  requireNextAction: boolean;
  onLogged: () => void;
}) {
  const [type, setType] = useState<ActivityType>(defaultType);
  const [outcome, setOutcome] = useState<CallOutcome | ''>('');
  const [body, setBody] = useState('');

  const [nextAction, setNextAction] = useState<'FOLLOW_UP' | 'CLOSE' | 'WON'>('FOLLOW_UP');
  const [followUpAt, setFollowUpAt] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isContactAttempt = type === 'CALL' || type === 'WHATSAPP' || type === 'MEETING';
  const isSiteVisit = type === 'SITE_VISIT';

  function reset() {
    setType(defaultType);
    setOutcome('');
    setBody('');
    setNextAction('FOLLOW_UP');
    setFollowUpAt('');
    setFollowUpNote('');
    setLostReason('');
    setDealValue('');
    setScheduledAt('');
    setError(null);
  }

  function applyPreset(compute: (from?: Date) => Date) {
    setFollowUpAt(toLocalInputValue(compute(new Date())));
  }

  async function submit() {
    setError(null);
    setSubmitting(true);

    const payload: Record<string, unknown> = {
      type,
      direction: 'OUTGOING',
      body: body || undefined,
      status: isSiteVisit && scheduledAt ? 'PENDING' : 'COMPLETED',
    };

    if (isContactAttempt && outcome) payload.outcome = outcome;
    if (isSiteVisit && scheduledAt) payload.scheduledAt = scheduledAt;

    if (nextAction === 'FOLLOW_UP' && followUpAt) {
      payload.nextFollowUpAt = followUpAt;
      payload.nextFollowUpNote = followUpNote || undefined;
    } else if (nextAction === 'CLOSE') {
      payload.closeLead = true;
      payload.lostReason = lostReason || undefined;
    } else if (nextAction === 'WON') {
      payload.markWon = true;
      if (dealValue) payload.dealValue = Number(dealValue);
    }

    try {
      await apiFetch(`/api/leads/${leadId}/activities`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      reset();
      onLogged();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Mirrors the server rule so the user is told before submitting, not after.
  const needsNextStep = requireNextAction && isContactAttempt && !(isSiteVisit && scheduledAt);
  const nextStepMissing =
    needsNextStep &&
    ((nextAction === 'FOLLOW_UP' && !followUpAt) || (nextAction === 'CLOSE' && !lostReason));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log activity"
      description={leadName}
      preventCloseOnOverlay
      footer={
        <>
          <Button variant="outline" fullWidth onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button fullWidth onClick={submit} loading={submitting} disabled={nextStepMissing}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-1">
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Activity type as buttons — faster than a dropdown on mobile */}
        <div className="flex flex-wrap gap-2">
          {MANUAL_ACTIVITY_TYPES.slice(0, 6).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                'rounded-full border px-3 py-2 text-sm font-medium transition-colors',
                type === t
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {ACTIVITY_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {isContactAttempt && (
          <Select
            label="What happened?"
            value={outcome}
            onChange={(e) => {
              const next = e.target.value as CallOutcome | '';
              setOutcome(next);
              // A dead number should not be left waiting for a follow-up.
              if (next === 'WRONG_NUMBER' || next === 'INVALID' || next === 'NOT_INTERESTED') {
                setNextAction('CLOSE');
                setLostReason(
                  next === 'NOT_INTERESTED'
                    ? 'JUST_ENQUIRING'
                    : next === 'WRONG_NUMBER'
                      ? 'WRONG_NUMBER'
                      : 'WRONG_NUMBER',
                );
              }
            }}
            placeholder="Select the outcome"
            options={CALL_OUTCOME_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        )}

        {isSiteVisit && (
          <Input
            label="Visit date & time"
            hint="Leave blank if the visit already happened"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        )}

        <Textarea
          label="Notes"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What was discussed?"
          rows={3}
        />

        {/* ---- The discipline rule ---- */}
        {needsNextStep && (
          <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-800">
              <Clock className="h-4 w-4" />
              What happens next?
            </p>
            <p className="mt-0.5 text-xs text-brand-700">
              Every lead needs a next step so nothing is forgotten.
            </p>

            <div className="mt-3 flex gap-2">
              {(
                [
                  ['FOLLOW_UP', 'Follow up later'],
                  ['WON', 'Won'],
                  ['CLOSE', 'Close lead'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setNextAction(value)}
                  className={cn(
                    'flex-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                    nextAction === value
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : 'border-slate-300 bg-white text-slate-700',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {nextAction === 'FOLLOW_UP' && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {FOLLOW_UP_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => applyPreset(preset.compute)}
                      className="rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:border-brand-600 hover:text-brand-700"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <Input
                  type="datetime-local"
                  value={followUpAt}
                  onChange={(e) => setFollowUpAt(e.target.value)}
                  aria-label="Follow-up date and time"
                />
                <Input
                  placeholder="What should you do next? (optional)"
                  value={followUpNote}
                  onChange={(e) => setFollowUpNote(e.target.value)}
                  aria-label="Follow-up note"
                />
              </div>
            )}

            {nextAction === 'CLOSE' && (
              <div className="mt-3">
                <Select
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  placeholder="Why is this lead lost?"
                  options={LOST_REASON_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  aria-label="Reason for losing the lead"
                />
              </div>
            )}

            {nextAction === 'WON' && (
              <div className="mt-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Order value (₹)"
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  aria-label="Order value"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
