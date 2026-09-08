import {
  Phone,
  MessageCircle,
  StickyNote,
  MapPin,
  FileText,
  ArrowRightLeft,
  UserPlus,
  Clock,
  CheckCircle2,
  IndianRupee,
  Settings2,
  Mail,
  Users2,
} from 'lucide-react';
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_COLORS,
  CALL_OUTCOME_LABELS,
  CALL_OUTCOME_COLORS,
  type ActivityType,
  type CallOutcome,
} from '@/lib/constants/enums';
import { formatDateTime, formatRelative } from '@/lib/utils/dates';

export interface TimelineActivity {
  _id: string;
  type: ActivityType;
  outcome?: CallOutcome;
  subject?: string;
  body?: string;
  scheduledAt?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  performedByName?: string;
  createdAt: string;
}

const ICONS: Partial<Record<ActivityType, React.ElementType>> = {
  CALL: Phone,
  WHATSAPP: MessageCircle,
  SMS: MessageCircle,
  EMAIL: Mail,
  MEETING: Users2,
  SITE_VISIT: MapPin,
  QUOTATION_SENT: FileText,
  NOTE: StickyNote,
  STAGE_CHANGE: ArrowRightLeft,
  ASSIGNMENT: UserPlus,
  FOLLOW_UP_SET: Clock,
  FOLLOW_UP_DONE: CheckCircle2,
  PAYMENT: IndianRupee,
  SYSTEM: Settings2,
};

/**
 * Immutable history of everything that happened to a lead.
 *
 * Rendered newest-first, because the question a salesperson asks when they open
 * a lead is "what happened last time?", not "how did this start?".
 */
export function LeadTimeline({ activities }: { activities: TimelineActivity[] }) {
  if (activities.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-slate-500">
        No activity yet. Log your first call to start the history.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0">
      {activities.map((activity, index) => {
        const Icon = ICONS[activity.type] ?? StickyNote;
        const color = ACTIVITY_TYPE_COLORS[activity.type];
        const isLast = index === activities.length - 1;

        const meta = activity.metadata as { from?: string; to?: string } | undefined;

        return (
          <li key={activity._id} className="relative flex gap-3 pb-5">
            {/* Connector line */}
            {!isLast && <span className="absolute left-[15px] top-8 h-full w-px bg-slate-200" aria-hidden />}

            <span
              className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white"
              style={{ backgroundColor: `${color}1A`, color }}
            >
              <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-slate-900">
                  {activity.subject || ACTIVITY_TYPE_LABELS[activity.type]}
                </span>
                {activity.outcome && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: `${CALL_OUTCOME_COLORS[activity.outcome]}1A`,
                      color: CALL_OUTCOME_COLORS[activity.outcome],
                    }}
                  >
                    {CALL_OUTCOME_LABELS[activity.outcome]}
                  </span>
                )}
              </div>

              {activity.body && (
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">
                  {activity.body}
                </p>
              )}

              {meta?.from && meta?.to && (
                <p className="mt-1 text-xs text-slate-500">
                  {String(meta.from)} → <span className="font-medium">{String(meta.to)}</span>
                </p>
              )}

              {activity.scheduledAt && activity.status === 'PENDING' && (
                <p className="mt-1 inline-flex items-center gap-1 rounded bg-info-50 px-1.5 py-0.5 text-xs font-medium text-info-700">
                  <Clock className="h-3 w-3" />
                  Scheduled for {formatDateTime(activity.scheduledAt)}
                </p>
              )}

              <p className="mt-1 text-xs text-slate-400">
                {activity.performedByName && <>{activity.performedByName} · </>}
                <time dateTime={activity.createdAt} title={formatDateTime(activity.createdAt)}>
                  {formatRelative(activity.createdAt)}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
