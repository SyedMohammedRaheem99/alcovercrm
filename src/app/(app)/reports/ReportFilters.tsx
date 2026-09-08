'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/** Date-range control for the reports page; state lives in the URL so a view is shareable. */
export function ReportFilters({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  function apply() {
    const params = new URLSearchParams();
    if (start) params.set('from', start);
    if (end) params.set('to', end);
    const qs = params.toString();
    router.push(qs ? `/reports?${qs}` : '/reports');
  }

  function preset(days: number) {
    const now = new Date();
    const past = new Date(now.getTime() - days * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    setStart(fmt(past));
    setEnd(fmt(now));
    router.push(`/reports?from=${fmt(past)}&to=${fmt(now)}`);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap gap-1.5">
        {[
          [7, 'Last 7 days'],
          [30, 'Last 30 days'],
          [90, 'Last 3 months'],
          [365, 'Last year'],
        ].map(([days, label]) => (
          <button
            key={String(days)}
            type="button"
            onClick={() => preset(days as number)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-600 hover:text-brand-700"
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setStart('');
            setEnd('');
            router.push('/reports');
          }}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-danger-600"
        >
          All time
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Input
          type="date"
          label="From"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          containerClassName="flex-1"
        />
        <Input
          type="date"
          label="To"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          containerClassName="flex-1"
        />
        <Button onClick={apply} className="sm:mb-0">
          Apply
        </Button>
      </div>
    </div>
  );
}
