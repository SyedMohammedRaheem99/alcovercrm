'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Download,
  ArrowRight,
  X,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { SOURCE_OPTIONS, DUPLICATE_STRATEGIES } from '@/lib/constants/enums';

/** Fields a column can be mapped to, in the order they appear in the UI. */
const MAPPABLE_FIELDS = [
  { value: '', label: '— Ignore this column —' },
  { value: 'name', label: 'Name' },
  { value: 'phone', label: 'Phone (required)' },
  { value: 'altPhone', label: 'Alternate phone' },
  { value: 'email', label: 'Email' },
  { value: 'address.city', label: 'City' },
  { value: 'address.area', label: 'Area / locality' },
  { value: 'address.line1', label: 'Address' },
  { value: 'address.pincode', label: 'Pincode' },
  { value: 'source', label: 'Source' },
  { value: 'sourceDetail', label: 'Campaign / ad name' },
  { value: 'requirementNotes', label: 'Requirement / notes' },
  { value: 'budgetMin', label: 'Budget' },
  { value: 'approxAreaSqft', label: 'Area (sq.ft)' },
  { value: 'unitCount', label: 'Number of units' },
  { value: 'createdAt', label: 'Enquiry date' },
];

interface PreviewData {
  headers: string[];
  detectedMapping: Record<string, string>;
  totalRows: number;
  sample: Array<Record<string, unknown>>;
}

interface ImportResult {
  batchId: string;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; field?: string; value?: string; reason: string }>;
}

export function ImportClient({ team }: { team: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicateStrategy, setDuplicateStrategy] = useState<string>('SKIP');
  const [defaultSource, setDefaultSource] = useState('');
  const [defaultAssignee, setDefaultAssignee] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(selected: File) {
    setFile(selected);
    setPreview(null);
    setResult(null);
    setBusy(true);

    try {
      const form = new FormData();
      form.append('file', selected);

      // FormData sets its own multipart boundary — do NOT set Content-Type here.
      const res = await fetch('/api/import?preview=true', { method: 'POST', body: form });
      const body = await res.json();

      if (!res.ok || !body.ok) throw new Error(body.error ?? 'Could not read that file');

      setPreview(body.data);
      setMapping(body.data.detectedMapping);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read that file');
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!file) return;
    setBusy(true);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append(
        'config',
        JSON.stringify({
          mapping,
          duplicateStrategy,
          defaults: {
            ...(defaultSource ? { source: defaultSource } : {}),
            ...(defaultAssignee ? { assignedTo: defaultAssignee } : {}),
          },
        }),
      );

      const res = await fetch('/api/import', { method: 'POST', body: form });
      const body = await res.json();

      if (!res.ok || !body.ok) throw new Error(body.error ?? 'Import failed');

      setResult(body.data);
      setPreview(null);
      toast.success(`${body.data.inserted} leads imported`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setMapping({});
    if (fileInput.current) fileInput.current.value = '';
  }

  const phoneMapped = Object.values(mapping).includes('phone');

  /* ---------------- Result screen ---------------- */
  if (result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
        <Card>
          <CardBody className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Import complete</h2>
            <p className="mt-1 text-sm text-slate-500">{result.totalRows} rows processed</p>

            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="Added" value={result.inserted} tone="success" />
              <Stat label="Updated" value={result.updated} tone="info" />
              <Stat label="Skipped" value={result.skipped} tone="muted" />
              <Stat label="Failed" value={result.failed} tone={result.failed > 0 ? 'danger' : 'muted'} />
            </div>

            <div className="mt-5 flex gap-2">
              <Button variant="outline" fullWidth onClick={reset}>
                Import another file
              </Button>
              <Button fullWidth onClick={() => router.push('/leads')}>
                View leads
              </Button>
            </div>
          </CardBody>
        </Card>

        {result.errors.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5 text-danger-700">
                <AlertTriangle className="h-4 w-4" />
                Rows that need attention ({result.errors.length})
              </CardTitle>
            </CardHeader>
            <CardBody className="max-h-72 overflow-y-auto p-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Value</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="tabular px-4 py-2 text-slate-500">{e.row}</td>
                      <td className="px-3 py-2 text-slate-700">{e.value ?? '—'}</td>
                      <td className="px-4 py-2 text-slate-600">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        )}
      </div>
    );
  }

  /* ---------------- Mapping screen ---------------- */
  if (preview) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Check the columns</CardTitle>
            <button onClick={reset} className="text-slate-400 hover:text-slate-700" aria-label="Cancel">
              <X className="h-4 w-4" />
            </button>
          </CardHeader>
          <CardBody>
            <p className="mb-4 text-sm text-slate-600">
              Found <span className="tabular font-semibold">{preview.totalRows}</span> rows in{' '}
              <span className="font-medium">{file?.name}</span>. We matched the columns
              automatically — change anything that looks wrong.
            </p>

            {!phoneMapped && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Map one column to <strong>Phone</strong> — it is required to create a lead.</span>
              </div>
            )}

            <div className="space-y-3">
              {preview.headers.map((header) => {
                const sampleValue = preview.sample[0]?.[header];
                return (
                  <div key={header} className="rounded-md border border-slate-200 p-3">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{header}</span>
                      {sampleValue != null && String(sampleValue) !== '' && (
                        <span className="max-w-[45%] truncate text-xs text-slate-400">
                          e.g. {String(sampleValue)}
                        </span>
                      )}
                    </div>
                    <Select
                      value={mapping[header] ?? ''}
                      onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
                      options={MAPPABLE_FIELDS}
                      aria-label={`Map column ${header}`}
                    />
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Options</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <Select
              label="If a phone number already exists"
              value={duplicateStrategy}
              onChange={(e) => setDuplicateStrategy(e.target.value)}
              options={[
                { value: 'SKIP', label: 'Skip it (recommended)' },
                { value: 'UPDATE', label: 'Update the existing lead' },
              ]}
              hint="Duplicates are matched on the phone number, ignoring formatting."
            />
            <Select
              label="Default source"
              hint="Used when a row has no source column"
              value={defaultSource}
              onChange={(e) => setDefaultSource(e.target.value)}
              placeholder="Leave as detected"
              options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <Select
              label="Assign all to"
              value={defaultAssignee}
              onChange={(e) => setDefaultAssignee(e.target.value)}
              placeholder="Leave unassigned"
              options={team.map((m) => ({ value: m.id, label: m.name }))}
            />
          </CardBody>
        </Card>

        <div className="mt-4 flex gap-2 pb-6">
          <Button variant="outline" onClick={reset} disabled={busy}>
            Cancel
          </Button>
          <Button fullWidth onClick={runImport} loading={busy} disabled={!phoneMapped}>
            Import {preview.totalRows} rows
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  /* ---------------- Upload screen ---------------- */
  return (
    <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
      <Card>
        <CardBody>
          <label
            htmlFor="import-file"
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-6 py-10 text-center transition-colors hover:border-brand-600 hover:bg-brand-50"
          >
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              {busy ? (
                <Upload className="h-6 w-6 animate-pulse" />
              ) : (
                <FileSpreadsheet className="h-6 w-6" />
              )}
            </div>
            <span className="text-sm font-semibold text-slate-900">
              {busy ? 'Reading file…' : 'Choose a file to upload'}
            </span>
            <span className="mt-1 text-xs text-slate-500">CSV or Excel · up to 4MB · 5,000 rows</span>
            <input
              ref={fileInput}
              id="import-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2.5 text-sm text-slate-600">
          <Step n={1} text="Export your leads from Meta Lead Center, Google, JustDial, or use your own sheet." />
          <Step n={2} text="Upload it here. Columns like Name, Phone and City are matched automatically." />
          <Step n={3} text="Check the matches, then import. Duplicate phone numbers are detected even if the format is different." />
          <Step n={4} text="Any rows that could not be imported are listed with the reason, so you can fix and retry." />
          <a
            href="/api/import/template"
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
          >
            <Download className="h-4 w-4" />
            Download a blank template
          </a>
        </CardBody>
      </Card>
    </div>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <p className="flex gap-2.5">
      <span className="tabular flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
        {n}
      </span>
      <span className="min-w-0">{text}</span>
    </p>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'info' | 'danger' | 'muted';
}) {
  const TONES = {
    success: 'text-success-600',
    info: 'text-info-600',
    danger: 'text-danger-600',
    muted: 'text-slate-500',
  } as const;

  return (
    <div className="rounded-md bg-slate-50 px-3 py-2.5">
      <p className={`tabular text-xl font-semibold ${TONES[tone]}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
