import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import Portal from '@/components/shared/Portal';
import {
  DELIMITERS, DELIMITER_LABEL, IMPORT_ACCEPT, IMPORT_MAX_MB, csvFile, guessColumns, readTable,
  type Columns, type Delimiter, type FieldDef, type Table,
} from '@/lib/importTable';
import { cn } from '@/lib/utils';

/** A choice that only shows when it matters (e.g. which way the dates are written). */
export interface ImportChoice { key: string; label: string; options: { value: string; label: string }[]; value: string }

/** What the person sees before saving. */
export interface ImportSummary {
  ready: number;
  skipped: { line: number; reason: string }[];
  notes: string[];
  preview: { headers: string[]; rows: string[][] };
}

/** One kind of import: its fields, how a file becomes a plan, and how the plan is saved. */
export interface ImportSetup<P> {
  title: string;
  /** "products", "sales": for "Import 120 products". */
  what: string;
  fields: FieldDef[];
  sample: { file: string; rows: (string | number)[][] };
  plan: (table: Table, cols: Columns, choices: Record<string, string>) => P;
  summary: (plan: P) => ImportSummary;
  choices?: (plan: P) => ImportChoice[];
  /** Saves the plan; returns the message shown when it's done. */
  save: (plan: P, onProgress: (done: number, total: number) => void) => Promise<string>;
}

type Step = 'pick' | 'reading' | 'review' | 'saving' | 'done';
const SKIPPED_SHOWN = 30;

/**
 * Import from a CSV or Excel file: choose the file, check which column is
 * which and what will be saved (and what's skipped, with the reason), then save.
 */
export default function ImportModal<P>({ setup, onClose, onDone }: { setup: ImportSetup<P>; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [cols, setCols] = useState<Columns>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [readError, setReadError] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [doneMessage, setDoneMessage] = useState('');
  const [showSkipped, setShowSkipped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const busy = step === 'reading' || step === 'saving';

  // Esc closes, except while saving
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // `delimiter`: the person picked what splits the columns (CSV and text files)
  async function open(picked: File | undefined | null, delimiter?: Delimiter) {
    if (!picked) return;
    setStep('reading');
    setReadError('');
    setFile(picked);
    try {
      const t = await readTable(picked, { delimiter });
      setTable(t);
      setCols(guessColumns(t.headers, setup.fields));
      setChoices({});
      setShowSkipped(false);
      setStep('review');
    } catch (err) {
      setReadError(err instanceof Error ? err.message : "This file couldn't be read.");
      setStep('pick');
    }
  }

  const missing = setup.fields.filter(f => f.required && !(cols[f.key] >= 0));
  const planned = useMemo((): { plan: P; summary: ImportSummary; choices: ImportChoice[] } | { error: string } | null => {
    if (!table || missing.length) return null;
    try {
      const plan = setup.plan(table, cols, choices);
      return { plan, summary: setup.summary(plan), choices: setup.choices?.(plan) ?? [] };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "This file couldn't be read." };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, cols, choices, missing.length]);
  const ok = planned && 'plan' in planned ? planned : null;

  async function save() {
    if (!ok || !ok.summary.ready) return;
    setStep('saving');
    setProgress({ done: 0, total: ok.summary.ready });
    try {
      setDoneMessage(await setup.save(ok.plan, (done, total) => setProgress({ done, total })));
      setStep('done');
      onDone();
    } catch (err) {
      console.error('[import] save', err);
      setReadError(err instanceof Error && !('code' in err) ? err.message : "Couldn't save everything. Check your connection, then import the same file again: what's already saved is skipped.");
      setStep('review');
    }
  }

  function downloadSample() {
    const url = URL.createObjectURL(csvFile(setup.sample.rows));
    const a = document.createElement('a');
    a.href = url;
    a.download = setup.sample.file;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const pickFile = () => pickRef.current?.click();

  return (
    <Portal>
      <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
        <div className="modal-panel max-w-3xl max-h-[92vh] overflow-y-auto" role="dialog" aria-labelledby="import-title" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="min-w-0">
              <h2 id="import-title" className="font-display text-2xl text-espresso-900">{setup.title}</h2>
              <p className="text-sm text-bark-500">From a CSV or Excel file.</p>
            </div>
            <button onClick={onClose} disabled={busy} className="icon-btn" title="Close"><X className="w-5 h-5" /></button>
          </div>

          <input ref={pickRef} type="file" accept={IMPORT_ACCEPT} className="hidden" tabIndex={-1}
            onChange={e => { open(e.target.files?.[0]); e.target.value = ''; }} />

          {(step === 'pick' || step === 'reading') && (
            <div className="p-6 space-y-4">
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); if (step === 'pick') open(e.dataTransfer.files?.[0]); }}
                className={cn('flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                  dragging ? 'border-caramel-500 bg-cream-200/70' : 'border-cream-400 bg-cream-100/60')}
              >
                {step === 'reading'
                  ? <Loader2 className="h-10 w-10 animate-spin text-caramel-600" aria-hidden="true" />
                  : <FileSpreadsheet className="h-10 w-10 text-caramel-600" aria-hidden="true" />}
                <p className="text-sm text-espresso-800">{step === 'reading' ? `Reading ${file?.name ?? 'the file'}...` : 'Drop the file here, or'}</p>
                {step === 'pick' && (
                  <button type="button" onClick={pickFile} className="btn-primary">
                    <Upload className="h-4 w-4" aria-hidden="true" /> Choose a file
                  </button>
                )}
                <p className="text-xs text-bark-500">CSV, XLSX or XLS, up to {IMPORT_MAX_MB} MB. The first row has the column names.</p>
              </div>
              {readError && <p className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{readError}</p>}
              <button type="button" onClick={downloadSample} disabled={step === 'reading'} className="btn-ghost mx-auto flex text-sm">
                <Download className="h-4 w-4" aria-hidden="true" /> Download a sample
              </button>
            </div>
          )}

          {step === 'review' && table && (
            <div className="p-6 space-y-6">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-cream-300 bg-white/70 px-4 py-3">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-caramel-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-espresso-900">{file?.name}</p>
                  <p className="text-xs text-bark-500">{table.rows.length.toLocaleString()} {table.rows.length === 1 ? 'row' : 'rows'}</p>
                </div>
                {table.delimiter && (
                  <label className="flex items-center gap-2 text-xs text-bark-600">
                    Columns split by
                    <select className="input w-auto py-1.5 text-sm" value={table.delimiter}
                      onChange={e => open(file, e.target.value as Delimiter)}>
                      {DELIMITERS.map(d => <option key={d} value={d}>{DELIMITER_LABEL[d]}</option>)}
                    </select>
                  </label>
                )}
                <button type="button" onClick={pickFile} className="btn-ghost text-sm">Choose another file</button>
              </div>
              {readError && <p className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{readError}</p>}

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-espresso-800">Which column is which?</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {setup.fields.map(f => (
                    <label key={f.key} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 text-sm text-espresso-800">{f.label}{f.required && <span className="text-red-600"> *</span>}</span>
                      <select className="input min-w-0 flex-1 py-2 text-sm" value={cols[f.key] ?? -1}
                        onChange={e => setCols(c => {
                          const n = Number(e.target.value);
                          // One column per field: picking a column here frees it elsewhere
                          const next = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v === n && n >= 0 ? -1 : v]));
                          return { ...next, [f.key]: n };
                        })}>
                        <option value={-1}>Not in my file</option>
                        {table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                {missing.length > 0 && (
                  <p className="text-sm text-red-700">Pick the column for {missing.map(f => f.label).join(' and ')}.</p>
                )}
              </section>

              {planned && 'error' in planned && (
                <p className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{planned.error}</p>
              )}

              {ok && (
                <>
                  {ok.choices.map(c => (
                    <section key={c.key} className="space-y-2">
                      <h3 className="text-sm font-semibold text-espresso-800">{c.label}</h3>
                      <div className="segmented max-w-md">
                        {c.options.map(o => (
                          <button key={o.value} type="button" className={cn('segmented-item', c.value === o.value && 'active')}
                            onClick={() => setChoices(ch => ({ ...ch, [c.key]: o.value }))}>{o.label}</button>
                        ))}
                      </div>
                    </section>
                  ))}

                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge-success normal-case px-3 py-1 text-sm">{ok.summary.ready.toLocaleString()} {setup.what} ready</span>
                      {ok.summary.skipped.length > 0 && (
                        <button type="button" onClick={() => setShowSkipped(s => !s)} className="badge-warning normal-case px-3 py-1 text-sm hover:brightness-95">
                          {ok.summary.skipped.length.toLocaleString()} {ok.summary.skipped.length === 1 ? 'row' : 'rows'} skipped {showSkipped ? '(hide)' : '(see why)'}
                        </button>
                      )}
                    </div>
                    {showSkipped && (
                      <ul className="max-h-40 overflow-y-auto rounded-2xl border border-cream-300 bg-white/70 px-4 py-2 text-xs text-espresso-800">
                        {ok.summary.skipped.slice(0, SKIPPED_SHOWN).map((s, i) => <li key={i} className="py-0.5">Row {s.line}: {s.reason}</li>)}
                        {ok.summary.skipped.length > SKIPPED_SHOWN && <li className="py-0.5 text-bark-500">and {(ok.summary.skipped.length - SKIPPED_SHOWN).toLocaleString()} more</li>}
                      </ul>
                    )}
                    {ok.summary.notes.length > 0 && (
                      <ul className="space-y-1 text-sm text-espresso-800">
                        {ok.summary.notes.map((n, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-caramel-500" aria-hidden="true" />{n}</li>)}
                      </ul>
                    )}
                  </section>

                  {ok.summary.preview.rows.length > 0 && (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold text-espresso-800">First {ok.summary.preview.rows.length} {setup.what}</h3>
                      <div className="overflow-x-auto rounded-2xl border border-cream-300">
                        <table className="w-full text-sm">
                          <thead><tr>{ok.summary.preview.headers.map(h => <th key={h} className="table-header whitespace-nowrap">{h}</th>)}</tr></thead>
                          <tbody>
                            {ok.summary.preview.rows.map((r, i) => (
                              <tr key={i} className="table-row">{r.map((c, j) => <td key={j} className="table-cell max-w-[220px] truncate" title={c}>{c}</td>)}</tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {step === 'saving' && (
            <div className="p-10 space-y-4 text-center">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-caramel-600" aria-hidden="true" />
              <p className="text-sm text-espresso-800">Saving {progress.done.toLocaleString()} of {progress.total.toLocaleString()} {setup.what}...</p>
              <div className="mx-auto h-2 max-w-sm overflow-hidden rounded-full bg-cream-200">
                <div className="h-full rounded-full bg-caramel-500 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
              </div>
              <p className="text-xs text-bark-500">Keep this page open until it's done.</p>
            </div>
          )}

          {step === 'done' && (
            <div className="p-10 space-y-3 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden="true" />
              <p className="font-display text-xl text-espresso-900">Import done</p>
              <p className="text-sm text-espresso-800">{doneMessage}</p>
            </div>
          )}

          {step !== 'saving' && (
            <div className="modal-footer">
              {step === 'done' ? (
                <button type="button" onClick={onClose} className="btn-primary flex-1">Done</button>
              ) : (
                <>
                  <button type="button" onClick={onClose} disabled={step === 'reading'} className="btn-secondary flex-1">Cancel</button>
                  {step === 'review' && (
                    <button type="button" onClick={save} disabled={!ok || !ok.summary.ready} className="btn-primary flex-1">
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      {ok?.summary.ready ? `Import ${ok.summary.ready.toLocaleString()} ${setup.what}` : 'Import'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
