import {
  startOfDay,
  endOfDay,
  addDays,
  addHours,
  addMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  formatDistanceToNowStrict,
  isToday,
  isTomorrow,
  isPast,
  setHours,
  setMinutes,
} from 'date-fns';
import type { FollowUpBucket } from '@/lib/constants/enums';

/**
 * All business dates are reasoned about in the organisation's timezone
 * (default Asia/Kolkata). The server may run in UTC on Vercel, so "today" must
 * be computed against the org timezone rather than the server clock, otherwise
 * follow-ups flip a day early or late for users in IST.
 */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** Current time shifted into the target timezone, for day-boundary maths. */
export function nowInTimezone(timeZone: string = DEFAULT_TIMEZONE): Date {
  return toTimezone(new Date(), timeZone);
}

export function toTimezone(date: Date, timeZone: string = DEFAULT_TIMEZONE): Date {
  // `en-US` + the sv-like parse keeps this dependency-free and stable.
  const s = date.toLocaleString('en-US', { timeZone });
  return new Date(s);
}

/** Offset in ms between the given timezone and the host clock. */
function tzOffsetMs(date: Date, timeZone: string): number {
  return toTimezone(date, timeZone).getTime() - date.getTime();
}

/** Convert a wall-clock date in `timeZone` back into a real UTC instant. */
export function fromTimezone(date: Date, timeZone: string = DEFAULT_TIMEZONE): Date {
  return new Date(date.getTime() - tzOffsetMs(date, timeZone));
}

/* ---------------- Range helpers (return real UTC instants) ---------------- */

export function dayRange(ref: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE) {
  const local = toTimezone(ref, timeZone);
  return {
    start: fromTimezone(startOfDay(local), timeZone),
    end: fromTimezone(endOfDay(local), timeZone),
  };
}

export function weekRange(ref: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE) {
  const local = toTimezone(ref, timeZone);
  return {
    start: fromTimezone(startOfWeek(local, { weekStartsOn: 1 }), timeZone),
    end: fromTimezone(endOfWeek(local, { weekStartsOn: 1 }), timeZone),
  };
}

export function monthRange(ref: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE) {
  const local = toTimezone(ref, timeZone);
  return {
    start: fromTimezone(startOfMonth(local), timeZone),
    end: fromTimezone(endOfMonth(local), timeZone),
  };
}

/* ---------------- Follow-up bucketing (drives the dashboard) -------------- */

export function getFollowUpBucket(
  date: Date | string | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE,
): FollowUpBucket {
  if (!date) return 'NONE';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 'NONE';

  const local = toTimezone(d, timeZone);
  const localNow = nowInTimezone(timeZone);

  if (local.getTime() < localNow.getTime() && !isSameLocalDay(local, localNow)) return 'OVERDUE';
  if (isSameLocalDay(local, localNow)) {
    return local.getTime() < localNow.getTime() ? 'OVERDUE' : 'TODAY';
  }
  if (isSameLocalDay(local, addDays(localNow, 1))) return 'TOMORROW';

  const weekEnd = endOfWeek(localNow, { weekStartsOn: 1 });
  if (local.getTime() <= weekEnd.getTime()) return 'THIS_WEEK';

  return 'LATER';
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/* ---------------- Quick follow-up presets (used in the call modal) -------- */

export type FollowUpPreset = {
  key: string;
  label: string;
  compute: (from?: Date) => Date;
};

export const FOLLOW_UP_PRESETS: FollowUpPreset[] = [
  { key: 'IN_2_HOURS', label: 'In 2 hours', compute: (f = new Date()) => addHours(f, 2) },
  { key: 'IN_4_HOURS', label: 'In 4 hours', compute: (f = new Date()) => addHours(f, 4) },
  {
    key: 'TOMORROW_10',
    label: 'Tomorrow 10:00 AM',
    compute: (f = new Date()) => setMinutes(setHours(addDays(f, 1), 10), 0),
  },
  {
    key: 'IN_3_DAYS',
    label: 'In 3 days',
    compute: (f = new Date()) => setMinutes(setHours(addDays(f, 3), 10), 0),
  },
  {
    key: 'NEXT_WEEK',
    label: 'Next week',
    compute: (f = new Date()) => setMinutes(setHours(addDays(f, 7), 10), 0),
  },
  {
    key: 'IN_15_DAYS',
    label: 'In 15 days',
    compute: (f = new Date()) => setMinutes(setHours(addDays(f, 15), 10), 0),
  },
  {
    key: 'NEXT_MONTH',
    label: 'Next month',
    compute: (f = new Date()) => setMinutes(setHours(addMonths(f, 1), 10), 0),
  },
];

/* ---------------- Display helpers ---------------------------------------- */

export function formatDate(d: Date | string | null | undefined, pattern = 'dd MMM yyyy'): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, pattern);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  return formatDate(d, "dd MMM yyyy, h:mm a");
}

export function formatRelative(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  const suffix = isPast(date) ? 'ago' : 'from now';
  return `${formatDistanceToNowStrict(date)} ${suffix}`;
}

/** Human label used on follow-up chips: "Today 3:30 PM", "Tomorrow 10:00 AM". */
export function formatFollowUpLabel(d: Date | string | null | undefined): string {
  if (!d) return 'No follow-up';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return 'No follow-up';
  if (isToday(date)) return `Today ${format(date, 'h:mm a')}`;
  if (isTomorrow(date)) return `Tomorrow ${format(date, 'h:mm a')}`;
  return format(date, 'dd MMM, h:mm a');
}

/** Minutes between two instants — used for the speed-to-lead metric. */
export function minutesBetween(a: Date | string, b: Date | string): number {
  const d1 = typeof a === 'string' ? new Date(a) : a;
  const d2 = typeof b === 'string' ? new Date(b) : b;
  return Math.round(Math.abs(d2.getTime() - d1.getTime()) / 60000);
}

/** Parse a `YYYY-MM-DD` filter value into an inclusive UTC range. */
export function parseDateRangeParam(
  from?: string | null,
  to?: string | null,
  timeZone: string = DEFAULT_TIMEZONE,
): { start?: Date; end?: Date } {
  const out: { start?: Date; end?: Date } = {};
  if (from) {
    const d = new Date(`${from}T00:00:00`);
    if (!Number.isNaN(d.getTime())) out.start = fromTimezone(startOfDay(d), timeZone);
  }
  if (to) {
    const d = new Date(`${to}T00:00:00`);
    if (!Number.isNaN(d.getTime())) out.end = fromTimezone(endOfDay(d), timeZone);
  }
  return out;
}
