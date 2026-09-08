'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  LabelList,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import {
  STAGE_LABELS,
  STAGE_COLORS,
  SOURCE_LABELS,
  MATERIAL_LABELS,
  LOST_REASON_LABELS,
} from '@/lib/constants/enums';
import type { Bucket, TrendPoint, DashboardBreakdowns } from '@/lib/services/analytics';

/**
 * Dashboard charts.
 *
 * Palette note: the categorical hues below are the validated reference set —
 * they clear the colourblind-separation and normal-vision floors, unlike the
 * blue/indigo/violet ramp that reads as one colour to a protanope. Bars carry
 * direct value labels as well, so identity never depends on colour alone
 * (three of the hues sit under 3:1 contrast on white, which makes the labels
 * mandatory rather than decorative).
 */
const SERIES = {
  created: '#2a78d6',
  won: '#1baf7a',
} as const;

const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#e34948', '#008300'];

const AXIS_TICK = { fontSize: 11, fill: '#64748b' };

function TooltipBox({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2 shadow-md">
      {label && <p className="mb-1 text-xs font-medium text-slate-900">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-sm"
            style={{ backgroundColor: entry.color }}
            aria-hidden
          />
          {entry.name}: <span className="tabular font-semibold text-slate-900">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export function DashboardCharts({
  trend,
  breakdowns,
}: {
  trend: TrendPoint[];
  breakdowns: DashboardBreakdowns;
}) {
  const [showTable, setShowTable] = useState(false);

  const trendData = useMemo(
    () =>
      trend.map((p) => ({
        ...p,
        // "12 Sep" reads faster on a phone axis than an ISO date.
        label: new Date(`${p.date}T00:00:00`).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        }),
      })),
    [trend],
  );

  const stageData = useMemo(
    () =>
      breakdowns.byStage.map((b) => ({
        name: STAGE_LABELS[b.key as keyof typeof STAGE_LABELS] ?? b.key,
        value: b.count,
        color: STAGE_COLORS[b.key as keyof typeof STAGE_COLORS] ?? '#64748B',
      })),
    [breakdowns.byStage],
  );

  const sourceData = useMemo(
    () =>
      breakdowns.bySource.slice(0, 8).map((b, i) => ({
        name: SOURCE_LABELS[b.key as keyof typeof SOURCE_LABELS] ?? b.key,
        value: b.count,
        color: CATEGORICAL[i % CATEGORICAL.length],
      })),
    [breakdowns.bySource],
  );

  const hasTrend = trendData.some((p) => p.created > 0 || p.won > 0);

  return (
    <div className="space-y-4">
      {/* ---------------- Trend ---------------- */}
      <Card>
        <CardHeader>
          <CardTitle>Leads over the last 30 days</CardTitle>
          <button
            onClick={() => setShowTable((v) => !v)}
            // -my-2 keeps the header height unchanged while the tap area grows.
            className="-my-2 min-h-[36px] px-1 py-2 text-xs font-medium text-brand-700"
          >
            {showTable ? 'Show chart' : 'Show table'}
          </button>
        </CardHeader>
        <CardBody>
          {!hasTrend ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No leads in this period yet.
            </p>
          ) : showTable ? (
            // A table view is the accessibility fallback for every chart here.
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-1.5 font-medium">Date</th>
                    <th className="py-1.5 text-right font-medium">New</th>
                    <th className="py-1.5 text-right font-medium">Won</th>
                  </tr>
                </thead>
                <tbody>
                  {trendData
                    .filter((p) => p.created > 0 || p.won > 0)
                    .map((p) => (
                      <tr key={p.date} className="border-b border-slate-100">
                        <td className="py-1.5 text-slate-700">{p.label}</td>
                        <td className="tabular py-1.5 text-right font-medium">{p.created}</td>
                        <td className="tabular py-1.5 text-right font-medium">{p.won}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES.created} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={SERIES.created} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gWon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SERIES.won} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={SERIES.won} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                <Tooltip content={<TooltipBox />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
                  iconType="plainline"
                  iconSize={14}
                />
                <Area
                  type="monotone"
                  dataKey="created"
                  name="New leads"
                  stroke={SERIES.created}
                  strokeWidth={2}
                  fill="url(#gCreated)"
                />
                <Area
                  type="monotone"
                  dataKey="won"
                  name="Won"
                  stroke={SERIES.won}
                  strokeWidth={2}
                  fill="url(#gWon)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------- Pipeline by stage ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline by stage</CardTitle>
          </CardHeader>
          <CardBody>
            {stageData.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, stageData.length * 34)}>
                <BarChart
                  data={stageData}
                  layout="vertical"
                  margin={{ top: 0, right: 32, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={112}
                  />
                  <Tooltip content={<TooltipBox />} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="value" name="Leads" radius={[0, 4, 4, 0]} barSize={16}>
                    {stageData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                    {/* Direct labels: identity and value never depend on colour. */}
                    <LabelList
                      dataKey="value"
                      position="right"
                      style={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        {/* ---------------- Where leads come from ---------------- */}
        <Card>
          <CardHeader>
            <CardTitle>Where leads come from</CardTitle>
          </CardHeader>
          <CardBody>
            {sourceData.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, sourceData.length * 34)}>
                <BarChart
                  data={sourceData}
                  layout="vertical"
                  margin={{ top: 0, right: 32, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={112}
                  />
                  <Tooltip content={<TooltipBox />} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="value" name="Leads" radius={[0, 4, 4, 0]} barSize={16}>
                    {sourceData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      style={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ---------------- Simple lists (no chart needed) ---------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <MiniList
          title="Top areas"
          items={breakdowns.byArea.slice(0, 6).map((b) => ({ label: b.key, value: b.count }))}
        />
        <MiniList
          title="Material demand"
          items={breakdowns.byMaterial
            .slice(0, 6)
            .map((b) => ({
              label: MATERIAL_LABELS[b.key as keyof typeof MATERIAL_LABELS] ?? b.key,
              value: b.count,
            }))}
        />
        <MiniList
          title="Why we lose"
          items={breakdowns.lostReasons
            .slice(0, 6)
            .map((b) => ({
              label: LOST_REASON_LABELS[b.key as keyof typeof LOST_REASON_LABELS] ?? b.key,
              value: b.count,
            }))}
        />
      </div>
    </div>
  );
}

/**
 * A ranked list, not a chart.
 *
 * For six labelled counts a table is faster to read than a pie or bar — the
 * reader wants the names and numbers, and a chart would add ink without adding
 * information.
 */
function MiniList({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No data yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => (
              <li key={item.label}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-slate-700">{item.label}</span>
                  <span className="tabular shrink-0 font-semibold text-slate-900">{item.value}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{ width: `${(item.value / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
