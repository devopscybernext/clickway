'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  ENTRY_FORMS, FormKey, FormField, Answers, validateAnswers, gridKey, resolveFieldOptions,
  DURATION_MAX_HOURS, DURATION_MAX_MINUTES, formatDuration, parseDuration,
} from '@/lib/forms';
import { currentRosterNames } from '@/lib/roster';

// One of the dashboard's entry forms (lib/forms.ts) — replaces the embedded
// Google Form. Submits to /api/forms, which stores the row in MySQL.

const OTHER = '__other__';

const newSubmissionId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const inputStyle = {
  background: 'var(--cn-bg-input)',
  color: 'var(--cn-text-primary)',
  border: '1px solid var(--cn-border)',
} as const;

const HOUR_CHOICES = Array.from({ length: DURATION_MAX_HOURS + 1 }, (_, i) => i);
const MINUTE_CHOICES = Array.from({ length: DURATION_MAX_MINUTES + 1 }, (_, i) => i);
const two = (n: number) => String(n).padStart(2, '0');

// A dropdown you tick several entries in (the Assigned question). The chosen
// names show on the button; the list closes when you click elsewhere.
function MultiDropdown({ id, options, checked, onChange }: {
  id: string; options: string[]; checked: string[]; onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button id={id} type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="w-full px-3 py-2 rounded-lg text-sm text-left flex items-center justify-between gap-2 cursor-pointer focus:outline-none" style={inputStyle}>
        <span className="truncate" style={checked.length ? undefined : { color: 'var(--cn-text-muted)' }}>
          {checked.length ? checked.join(', ') : 'Choose'}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-64 overflow-y-auto rounded-lg border py-1"
          style={{ background: 'var(--cn-bg-dropdown)', borderColor: 'var(--cn-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
          {options.map(o => (
            <label key={o} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-[var(--cn-bg-input)]"
              style={{ color: 'var(--cn-text-primary)' }}>
              <input type="checkbox" checked={checked.includes(o)}
                onChange={() => onChange(checked.includes(o) ? checked.filter(v => v !== o) : [...checked, o])}
                style={{ accentColor: 'var(--cn-accent)' }} />
              <span className="truncate">{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Big screenshots are shrunk (max 1920 px wide, JPEG) so they upload quickly and stay under the 2 MB limit.
async function prepareImage(file: File): Promise<File> {
  if (file.size <= 900 * 1024 || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (blob && blob.size < file.size) return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { /* keep the original */ }
  return file;
}

// Optional screenshots: choose, drag in, or paste (Ctrl+V anywhere in the form). Shown as thumbnails.
function ImagePicker({ id, files, max, onAdd, onRemove }: {
  id: string; files: File[]; max: number; onAdd: (list: File[]) => void; onRemove: (index: number) => void;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach(u => URL.revokeObjectURL(u)), [urls]);
  return (
    <div className="space-y-2">
      <div
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); onAdd(Array.from(e.dataTransfer.files)); }}
        className="rounded-lg px-3 py-4 text-center text-xs"
        style={{ border: `1px dashed ${over ? 'var(--cn-accent)' : 'var(--cn-border)'}`, background: over ? 'rgba(254, 74, 35, 0.06)' : 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}
      >
        <button type="button" onClick={() => inputRef.current?.click()} disabled={files.length >= max}
          className="font-semibold cursor-pointer disabled:opacity-50" style={{ color: 'var(--cn-accent)' }}>
          Add screenshot
        </button>
        {' '}— or drop an image here, or paste one with Ctrl+V. Up to {max} images, 2 MB each.
        <input id={`${id}-input`} ref={inputRef} type="file" accept={IMAGE_TYPES.join(',')} multiple className="hidden" aria-label="Screenshots"
          onChange={e => { onAdd(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[i]} alt={f.name} className="h-20 w-28 object-cover rounded-lg" style={{ border: '1px solid var(--cn-border)' }} />
              <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${f.name}`}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[11px] leading-none cursor-pointer"
                style={{ background: '#ef4444', color: '#fff' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FieldState {
  value: string;      // choice/dropdown/text/paragraph/date ("__other__" when Other is picked)
  checked: string[];  // checkboxes
  other: string;      // the "Other: ___" text
  grid: Record<string, string>; // grid: row → chosen column
  files: File[];      // images
}

const emptyState = (fields: FormField[]): Record<string, FieldState> =>
  Object.fromEntries(fields.map(f => [f.header, { value: '', checked: [], other: '', grid: {}, files: [] }]));

// A grid's errors are keyed by its rows' own columns ("Header [Row]").
const fieldError = (f: FormField, errors: Record<string, string>): string | undefined =>
  f.type === 'grid'
    ? Object.entries(errors).find(([k]) => k.startsWith(`${f.header} [`))?.[1]
    : errors[f.header];

function toAnswers(fields: FormField[], state: Record<string, FieldState>): Answers {
  const answers: Answers = {};
  for (const f of fields) {
    const s = state[f.header];
    if (f.type === 'images') {
      continue; // screenshots aren't an answer; they are uploaded once the row is saved
    } else if (f.type === 'grid') {
      for (const [row, v] of Object.entries(s.grid)) if (v) answers[gridKey(f.header, row)] = v;
    } else if (f.type === 'checkboxes') {
      const list = s.checked.filter(v => v !== OTHER);
      if (s.checked.includes(OTHER) && s.other.trim()) list.push(s.other.trim());
      if (list.length) answers[f.header] = list;
    } else {
      const v = s.value === OTHER ? s.other.trim() : s.value.trim();
      if (v) answers[f.header] = v;
    }
  }
  return answers;
}

// Dropdown entries for a question: the form's own list plus anything already
// in the sheet (hints, keyed by the question title), so a project or client
// that's already been used can be picked rather than retyped.
function optionsFor(f: FormField, hints?: Record<string, string[]>): string[] {
  const base = resolveFieldOptions(f, currentRosterNames()) ?? [];
  const seen = new Set(base.map(o => o.toLowerCase()));
  const extra = (hints?.[f.header] ?? []).map(v => v.trim()).filter(v => {
    if (!v || seen.has(v.toLowerCase())) return false;
    seen.add(v.toLowerCase());
    return true;
  }).sort((a, b) => a.localeCompare(b));
  return [...base, ...extra];
}

export default function EntryForm({ formKey, onSubmitted, compact = false, optionHints }: {
  formKey: FormKey;
  onSubmitted?: () => void;
  compact?: boolean;
  /** extra dropdown entries per question title, e.g. the projects already in the sheet */
  optionHints?: Record<string, string[]>;
}) {
  const def = ENTRY_FORMS[formKey];
  const [state, setState] = useState(() => emptyState(def.fields));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [submissionId, setSubmissionId] = useState(newSubmissionId);
  const ids = useMemo(() => Object.fromEntries(def.fields.map((f, i) => [f.header, `${formKey}-q${i}`])), [def, formKey]);

  const imagesField = def.fields.find(f => f.type === 'images');
  const [imageError, setImageError] = useState('');
  const addImages = async (list: File[]) => {
    if (!imagesField) return;
    setImageError('');
    const max = imagesField.maxFiles ?? 3;
    const have = state[imagesField.header].files;
    const next = [...have];
    for (const raw of list) {
      if (!IMAGE_TYPES.includes(raw.type)) { setImageError('Only PNG, JPEG, GIF or WebP images can be added.'); continue; }
      if (next.length >= max) { setImageError(`You can add up to ${max} screenshots.`); break; }
      const file = await prepareImage(raw);
      if (file.size > MAX_IMAGE_BYTES) { setImageError(`${raw.name || 'That image'} is over 2 MB even after shrinking.`); continue; }
      next.push(file);
    }
    update(imagesField.header, { files: next });
  };
  const onPaste = (e: React.ClipboardEvent) => {
    if (!imagesField) return;
    const pasted = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
    if (pasted.length === 0) return;
    e.preventDefault();
    void addImages(pasted);
  };

  const update = (header: string, patch: Partial<FieldState>) => {
    setState(prev => ({ ...prev, [header]: { ...prev[header], ...patch } }));
    setErrors(prev => {
      if (!prev[header]) return prev;
      const next = { ...prev };
      delete next[header];
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const answers = toAnswers(def.fields, state);
    const found = validateAnswers(def, answers, currentRosterNames());
    // "Other" picked but left blank reads as unanswered
    for (const f of def.fields) {
      const s = state[f.header];
      if ((s.value === OTHER || s.checked.includes(OTHER)) && !s.other.trim()) found[f.header] = 'Type your answer for "Other"';
    }
    if (Object.keys(found).length) {
      setErrors(found);
      setMessage({ kind: 'error', text: 'Please fix the highlighted questions.' });
      const first = def.fields.find(f => fieldError(f, found));
      if (first) document.getElementById(ids[first.header])?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: formKey, submissionId, answers }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        if (json.errors) setErrors(json.errors);
        setMessage({ kind: 'error', text: json.error ?? `Could not save the form (error ${res.status}). Please try again.` });
        return;
      }
      // Screenshots go up one by one now that the row exists
      let failed = 0;
      const toUpload = imagesField && json.id ? state[imagesField.header].files : [];
      for (const file of toUpload) {
        const body = new FormData();
        body.append('helpId', String(json.id));
        body.append('file', file);
        try {
          const up = await fetch(imagesField!.uploadTo!, { method: 'POST', body });
          if (!up.ok) failed++;
        } catch { failed++; }
      }
      setState(emptyState(def.fields));
      setErrors({});
      setImageError('');
      setSubmissionId(newSubmissionId());
      setMessage(failed > 0
        ? { kind: 'error', text: `Submitted, but ${failed} screenshot${failed === 1 ? '' : 's'} could not be uploaded. Your request is in — you can mention it in a new request if it matters.` }
        : { kind: 'ok', text: 'Submitted. Your response has been recorded.' });
      onSubmitted?.();
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} onPaste={onPaste} noValidate className={compact ? 'space-y-4' : 'space-y-5'}>
      {def.fields.map(f => {
        const s = state[f.header];
        const id = ids[f.header];
        const err = fieldError(f, errors);
        return (
          <fieldset key={f.header} id={id} className="rounded-lg p-3 sm:p-4 space-y-2 min-w-0"
            style={{ border: `1px solid ${err ? '#ef4444' : 'var(--cn-border)'}`, background: 'var(--cn-bg-card)' }}>
            <legend className="sr-only">{f.header}</legend>
            <label htmlFor={`${id}-input`} className="block text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>
              {f.header}{f.required && <span style={{ color: '#ef4444' }}> *</span>}
            </label>

            {(f.type === 'text' || f.type === 'date') && (
              <input id={`${id}-input`} type={f.type === 'date' ? 'date' : 'text'} value={s.value} maxLength={f.maxLength}
                onChange={e => update(f.header, { value: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={inputStyle} />
            )}

            {f.type === 'paragraph' && (
              <textarea id={`${id}-input`} rows={f.maxLength && f.maxLength > 1000 ? 6 : 3} value={s.value} maxLength={f.maxLength}
                onChange={e => update(f.header, { value: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-y" style={inputStyle} />
            )}

            {f.type === 'dropdown' && (
              <select id={`${id}-input`} value={s.value} onChange={e => update(f.header, { value: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none cursor-pointer" style={inputStyle}>
                <option value="">Choose</option>
                {optionsFor(f, optionHints).map(o => <option key={o} value={o}>{o}</option>)}
                {f.allowOther && <option value={OTHER}>Other…</option>}
              </select>
            )}

            {f.type === 'images' && (
              <>
                <ImagePicker id={id} files={s.files} max={f.maxFiles ?? 3}
                  onAdd={list => void addImages(list)}
                  onRemove={i => update(f.header, { files: s.files.filter((_, k) => k !== i) })} />
                {imageError && <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{imageError}</p>}
              </>
            )}

            {f.type === 'duration' && (() => {
              const d = parseDuration(s.value);
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <select id={`${id}-input`} aria-label={`${f.header} hours`} value={d ? String(d.h) : ''}
                    onChange={e => update(f.header, { value: e.target.value === '' ? '' : formatDuration(Number(e.target.value), d?.m ?? 0) })}
                    className="px-3 py-2 rounded-lg text-sm focus:outline-none cursor-pointer" style={inputStyle}>
                    <option value="">Hours</option>
                    {HOUR_CHOICES.map(h => <option key={h} value={h}>{two(h)}</option>)}
                  </select>
                  <span className="font-semibold" style={{ color: 'var(--cn-text-muted)' }}>:</span>
                  <select id={`${id}-minutes`} aria-label={`${f.header} minutes`} value={d ? String(d.m) : ''}
                    onChange={e => update(f.header, { value: e.target.value === '' ? '' : formatDuration(d?.h ?? 0, Number(e.target.value)) })}
                    className="px-3 py-2 rounded-lg text-sm focus:outline-none cursor-pointer" style={inputStyle}>
                    <option value="">Minutes</option>
                    {MINUTE_CHOICES.map(m => <option key={m} value={m}>{two(m)}</option>)}
                  </select>
                  {d && (
                    <>
                      <span className="text-xs tabular-nums" style={{ color: 'var(--cn-text-muted)' }}>{two(d.h)}:{two(d.m)}</span>
                      <button type="button" className="text-xs cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}
                        onClick={() => update(f.header, { value: '' })}>Clear</button>
                    </>
                  )}
                </div>
              );
            })()}

            {f.type === 'checkboxes' && f.asDropdown && (
              <MultiDropdown id={`${id}-input`} options={optionsFor(f, optionHints)} checked={s.checked.filter(v => v !== OTHER)}
                onChange={next => update(f.header, { checked: next })} />
            )}

            {(f.type === 'choice' || (f.type === 'checkboxes' && !f.asDropdown)) && (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {[...optionsFor(f, optionHints), ...(f.allowOther ? [OTHER] : [])].map((o, i) => {
                  const optId = `${id}-o${i}`;
                  const checked = f.type === 'checkboxes' ? s.checked.includes(o) : s.value === o;
                  return (
                    <label key={o} htmlFor={optId} className="flex items-center gap-2 text-sm cursor-pointer min-w-0"
                      style={{ color: 'var(--cn-text-primary)' }}>
                      <input id={optId} type={f.type === 'checkboxes' ? 'checkbox' : 'radio'} name={id} checked={checked}
                        onChange={() => f.type === 'checkboxes'
                          ? update(f.header, { checked: checked ? s.checked.filter(v => v !== o) : [...s.checked, o] })
                          : update(f.header, { value: o })}
                        style={{ accentColor: 'var(--cn-accent)' }} />
                      <span className="truncate">{o === OTHER ? 'Other:' : o}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {f.type === 'grid' && (
              <div className="overflow-x-auto">
                <table className="text-sm w-full" style={{ color: 'var(--cn-text-primary)' }}>
                  <thead>
                    <tr>
                      <th className="text-left font-medium py-1 pr-3" aria-label="Row" />
                      {f.options!.map(col => (
                        <th key={col} className="font-semibold px-1.5 py-1 text-center text-xs" style={{ color: 'var(--cn-text-muted)' }}>{col}</th>
                      ))}
                      <th aria-label="Clear" />
                    </tr>
                  </thead>
                  <tbody>
                    {f.rows!.map((row, ri) => (
                      <tr key={row} className="border-t" style={{ borderColor: 'var(--cn-border)' }}>
                        <td className="py-1.5 pr-3 min-w-[160px]">{row}</td>
                        {f.options!.map((col, ci) => (
                          <td key={col} className="text-center px-1.5">
                            <input type="radio" id={`${id}-r${ri}-c${ci}`} name={`${id}-r${ri}`} aria-label={`${row}: ${col}`}
                              checked={s.grid[row] === col}
                              onChange={() => update(f.header, { grid: { ...s.grid, [row]: col } })}
                              style={{ accentColor: 'var(--cn-accent)' }} />
                          </td>
                        ))}
                        <td className="pl-1.5">
                          {s.grid[row] && (
                            <button type="button" className="text-xs cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}
                              aria-label={`Clear ${row}`}
                              onClick={() => { const next = { ...s.grid }; delete next[row]; update(f.header, { grid: next }); }}>
                              Clear
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {f.allowOther && (s.value === OTHER || s.checked.includes(OTHER)) && (
              <input id={`${id}-other`} type="text" value={s.other} autoFocus placeholder="Type your answer"
                onChange={e => update(f.header, { other: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={inputStyle} />
            )}

            {err && <p className="text-xs font-medium" style={{ color: '#ef4444' }}>{err}</p>}
          </fieldset>
        );
      })}

      {message && (
        <div role={message.kind === 'error' ? 'alert' : 'status'} className="rounded-lg px-4 py-3 text-sm font-medium"
          style={message.kind === 'ok'
            ? { background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a' }
            : { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting}
          className="px-5 py-2 text-sm font-semibold rounded-lg cursor-pointer transition-opacity disabled:opacity-60"
          style={{ background: 'var(--cn-accent)', color: '#fff' }}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
        <button type="button" disabled={submitting}
          onClick={() => { setState(emptyState(def.fields)); setErrors({}); setMessage(null); }}
          className="px-4 py-2 text-sm font-medium rounded-lg cursor-pointer"
          style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}>
          Clear form
        </button>
      </div>
    </form>
  );
}
