'use client';

import { useMemo, useState } from 'react';
import { ENTRY_FORMS, FormKey, FormField, Answers, validateAnswers } from '@/lib/forms';

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

interface FieldState {
  value: string;      // choice/dropdown/text/paragraph/date ("__other__" when Other is picked)
  checked: string[];  // checkboxes
  other: string;      // the "Other: ___" text
}

const emptyState = (fields: FormField[]): Record<string, FieldState> =>
  Object.fromEntries(fields.map(f => [f.header, { value: '', checked: [], other: '' }]));

function toAnswers(fields: FormField[], state: Record<string, FieldState>): Answers {
  const answers: Answers = {};
  for (const f of fields) {
    const s = state[f.header];
    if (f.type === 'checkboxes') {
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

export default function EntryForm({ formKey, onSubmitted, compact = false }: {
  formKey: FormKey;
  onSubmitted?: () => void;
  compact?: boolean;
}) {
  const def = ENTRY_FORMS[formKey];
  const [state, setState] = useState(() => emptyState(def.fields));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [submissionId, setSubmissionId] = useState(newSubmissionId);
  const ids = useMemo(() => Object.fromEntries(def.fields.map((f, i) => [f.header, `${formKey}-q${i}`])), [def, formKey]);

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
    const found = validateAnswers(def, answers);
    // "Other" picked but left blank reads as unanswered
    for (const f of def.fields) {
      const s = state[f.header];
      if ((s.value === OTHER || s.checked.includes(OTHER)) && !s.other.trim()) found[f.header] = 'Type your answer for "Other"';
    }
    if (Object.keys(found).length) {
      setErrors(found);
      setMessage({ kind: 'error', text: 'Please fix the highlighted questions.' });
      document.getElementById(ids[Object.keys(found)[0]] ?? '')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      setState(emptyState(def.fields));
      setErrors({});
      setSubmissionId(newSubmissionId());
      setMessage({ kind: 'ok', text: 'Submitted. Your response has been recorded.' });
      onSubmitted?.();
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={compact ? 'space-y-4' : 'space-y-5'}>
      {def.fields.map(f => {
        const s = state[f.header];
        const id = ids[f.header];
        const err = errors[f.header];
        return (
          <fieldset key={f.header} id={id} className="rounded-lg p-3 sm:p-4 space-y-2 min-w-0"
            style={{ border: `1px solid ${err ? '#ef4444' : 'var(--cn-border)'}`, background: 'var(--cn-bg-card)' }}>
            <legend className="sr-only">{f.header}</legend>
            <label htmlFor={`${id}-input`} className="block text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>
              {f.header}{f.required && <span style={{ color: '#ef4444' }}> *</span>}
            </label>

            {(f.type === 'text' || f.type === 'date') && (
              <input id={`${id}-input`} type={f.type === 'date' ? 'date' : 'text'} value={s.value}
                onChange={e => update(f.header, { value: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none" style={inputStyle} />
            )}

            {f.type === 'paragraph' && (
              <textarea id={`${id}-input`} rows={3} value={s.value}
                onChange={e => update(f.header, { value: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-y" style={inputStyle} />
            )}

            {f.type === 'dropdown' && (
              <select id={`${id}-input`} value={s.value} onChange={e => update(f.header, { value: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none cursor-pointer" style={inputStyle}>
                <option value="">Choose</option>
                {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}

            {(f.type === 'choice' || f.type === 'checkboxes') && (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                {[...f.options!, ...(f.allowOther ? [OTHER] : [])].map((o, i) => {
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
