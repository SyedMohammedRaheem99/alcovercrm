import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  STAGE_LABELS,
  STAGE_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  SOURCE_LABELS,
  SOURCE_COLORS,
  FOLLOW_UP_BUCKET_LABELS,
  FOLLOW_UP_BUCKET_COLORS,
  type LeadStage,
  type Priority,
  type LeadSource,
  type FollowUpBucket,
} from '@/lib/constants/enums';

/**
 * Coloured chips.
 *
 * Colours are derived from a hex value at runtime rather than from Tailwind
 * classes, because stage/source colours are configurable per organisation —
 * a static class map would break the moment a client renames or recolours one.
 */

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface BaseBadgeProps {
  label: string;
  color: string;
  className?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
}

export function Badge({ label, color, className, icon, size = 'md' }: BaseBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium leading-none',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
      style={{ backgroundColor: hexToRgba(color, 0.12), color }}
    >
      {icon}
      {label}
    </span>
  );
}

export function StageBadge({ stage, size }: { stage: LeadStage; size?: 'sm' | 'md' }) {
  return <Badge label={STAGE_LABELS[stage]} color={STAGE_COLORS[stage]} size={size} />;
}

export function PriorityBadge({ priority, size }: { priority: Priority; size?: 'sm' | 'md' }) {
  return <Badge label={PRIORITY_LABELS[priority]} color={PRIORITY_COLORS[priority]} size={size} />;
}

export function SourceBadge({ source, size }: { source: LeadSource; size?: 'sm' | 'md' }) {
  return <Badge label={SOURCE_LABELS[source]} color={SOURCE_COLORS[source]} size={size} />;
}

/**
 * Follow-up chip. Overdue carries an icon as well as the colour, so the state
 * is never communicated by colour alone (WCAG 1.4.1).
 */
export function FollowUpBadge({
  bucket,
  label,
  size,
}: {
  bucket: FollowUpBucket;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const isUrgent = bucket === 'OVERDUE';
  return (
    <Badge
      label={label ?? FOLLOW_UP_BUCKET_LABELS[bucket]}
      color={FOLLOW_UP_BUCKET_COLORS[bucket]}
      size={size}
      icon={isUrgent ? <AlertCircle className="h-3 w-3 shrink-0" aria-hidden /> : undefined}
      className={isUrgent ? 'font-semibold' : undefined}
    />
  );
}

/** Neutral chip for tags and free-form labels. */
export function Chip({
  children,
  onRemove,
  className,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700',
        className,
      )}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full text-slate-400 hover:text-slate-700"
          aria-label="Remove"
        >
          ×
        </button>
      )}
    </span>
  );
}
