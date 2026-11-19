'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Lock, X, UserPlus } from 'lucide-react';
import { api, postJson, Pill, Button, useFlash, inputClass, inputStyle } from './shared';
import styles from './ProjectSettings.module.css';
import { ACCESS_LABELS } from '@/lib/projects/rules';
import type { Rule, Policy, AutoAdd } from '@/lib/projects/policy';

// Admin Portal → Projects: who may use Projects, create projects, have full access, and who is added to
// new projects automatically. Set per department; a person's own setting overrides their department's.
// Anything left on "Default" follows the built-in rule for the person's role.

type Field = keyof Rule;
interface Department { name: string; rule: Rule; people: number }
interface Person {
  id: number; name: string; username: string; email: string; role: string; department: string;
  own: Rule; policy: Policy; roleDefault: { access: boolean; create: boolean; full: boolean; autoAdd: AutoAdd };
}

const FIELDS: { key: Field; label: string; hint: string }[] = [
  { key: 'access', label: 'Projects access', hint: 'Sees the Projects menu and the projects they are added to' },
  { key: 'create', label: 'Can create', hint: 'Can create new projects (becomes their Creator)' },
  { key: 'full', label: 'Full access', hint: 'Sees and manages every project, Google editor on every restricted document, manages templates' },
  { key: 'autoAdd', label: 'Added to new projects', hint: 'Joins every new project automatically, at this level' },
];
const AUTO_LABELS: Record<AutoAdd, string> = { none: "Don't add", viewer: ACCESS_LABELS.viewer, editor: ACCESS_LABELS.editor, manager: ACCESS_LABELS.manager };
const yesNo = (b: boolean) => (b ? 'Yes' : 'No');
const show = (k: Field, v: boolean | AutoAdd) => (k === 'autoAdd' ? AUTO_LABELS[v as AutoAdd] : yesNo(v as boolean));

const th = 'text-left';
const td = 'align-middle';
const selectClass = styles.select;

function summary(p: Policy): { text: string; tone: 'green' | 'accent' | 'blue' | 'muted' } {
  if (!p.access) return { text: 'No access', tone: 'muted' };
  if (p.full) return { text: 'Full access', tone: 'green' };
  if (p.create) return { text: 'Can create', tone: 'accent' };
  return { text: 'Member only', tone: 'blue' };
}

// One setting as a dropdown: "inherit" (labelled with what it inherits) or an explicit value
function RuleSelect({ field, value, inherited, inheritLabel, disabled, onChange, label }: {
  field: Field; value: boolean | AutoAdd | null; inherited: string; inheritLabel: string; disabled?: boolean;
  onChange: (v: boolean | AutoAdd | null) => void; label: string;
}) {
  const current = value === null ? '' : String(value);
  return (
    <select aria-label={label} value={current} disabled={disabled} className={selectClass} style={inputStyle}
      onChange={e => {
        const v = e.target.value;
        onChange(v === '' ? null : field === 'autoAdd' ? (v as AutoAdd) : v === 'true');
      }}>
      <option value="">{inheritLabel}: {inherited}</option>
      {field === 'autoAdd'
        ? (Object.keys(AUTO_LABELS) as AutoAdd[]).map(a => <option key={a} value={a}>{AUTO_LABELS[a]}</option>)
        : <><option value="true">Yes</option><option value="false">No</option></>}
    </select>
  );
}

interface AlwaysEditor { email: string; name: string; addedBy: string; addedAt: string | null }

export default function ProjectSettings() {
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [editors, setEditors] = useState<AlwaysEditor[]>([]);
  const [newEditor, setNewEditor] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [onlyCustom, setOnlyCustom] = useState(false);
  const { flash, setFlash } = useFlash();

  const load = useCallback(async () => {
    const r = await api('/api/project-settings');
    if (!r.success) { setError(r.error!); return; }
    setError('');
    setDepartments(r.departments as Department[]);
    setPeople(r.people as Person[]);
    setEditors((r.alwaysEditors as AlwaysEditor[]) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (scope: 'department' | 'user', key: string | number, rule: Rule) => {
    setBusy(true);
    const r = await postJson('/api/project-settings', { scope, key, rule }, 'PUT');
    setBusy(false);
    setFlash(r.success ? { kind: 'ok', text: String(r.message ?? 'Saved.') } : { kind: 'error', text: r.error! });
    if (r.success) void load();
  };

  const saveEditor = async (action: 'add' | 'remove', email: string) => {
    if (action === 'remove' && !confirm(`Remove ${email}? They lose Google editor access to restricted documents, unless they are a member of that project.`)) return;
    setBusy(true);
    const r = await postJson('/api/project-settings', { action, email });
    setBusy(false);
    setFlash(r.success ? { kind: 'ok', text: String(r.message ?? 'Saved.') } : { kind: 'error', text: r.error! });
    if (r.success) { if (action === 'add') setNewEditor(''); void load(); }
  };

  const deptRule = useMemo(() => new Map((departments ?? []).map(d => [d.name, d.rule])), [departments]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter(p =>
      (!dept || p.department === dept) &&
      (!onlyCustom || Object.values(p.own).some(v => v !== null)) &&
      (!q || [p.name, p.username, p.email, p.role].some(v => v.toLowerCase().includes(q))));
  }, [people, search, dept, onlyCustom]);

  if (error) return <div className="p-3 sm:p-6"><div role="alert" className="rounded-lg px-4 py-3 text-sm" style={{ border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>{error}</div></div>;
  if (!departments) return <div className="flex justify-center py-16"><span className="w-7 h-7 border-2 border-[#FE4A23]/30 border-t-[#FE4A23] rounded-full animate-spin" /></div>;

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <div>
          <h2>Projects settings</h2>
          <p>Manage project permissions for departments and individual people.</p>
        </div>
        <Pill tone={busy ? 'amber' : 'muted'}>{busy ? 'Saving changes…' : 'Changes save automatically'}</Pill>
      </header>
      <div className={styles.guide}>
        <div><strong>1. Set department defaults</strong><p>Choose permissions for a whole department. Default follows each person’s built-in role.</p></div>
        <div><strong>2. Adjust individual access</strong><p>A person’s own settings override their department. Super Admin always has full access.</p></div>
        <div><strong>Changes apply immediately</strong><p>Access changes update Google access to restricted documents. Without Projects access, other permissions do not apply.</p></div>
      </div>
      {flash}

      {/* ── Always editors ── */}
      <section className={styles.section}>
        <div className={styles.heading}>
          <div>
            <h3>Always editors</h3>
            <p>These email addresses are Google editors on every &ldquo;Project members only&rdquo; document, in every project, including ones added later. They don&apos;t need a dashboard account or project membership.</p>
          </div>
          <Pill>{editors.length} {editors.length === 1 ? 'email' : 'emails'}</Pill>
        </div>
        <form className={styles.filters} onSubmit={e => { e.preventDefault(); if (newEditor.trim()) void saveEditor('add', newEditor); }}>
          <input type="email" value={newEditor} onChange={e => setNewEditor(e.target.value)} placeholder="name@cybernext.io" aria-label="Email to add"
            maxLength={191} className={`${inputClass} sm:max-w-sm`} style={inputStyle} />
          <Button type="submit" primary disabled={busy || !newEditor.trim()}><UserPlus className="w-4 h-4" /> Add email</Button>
        </form>
        <ul className={styles.editorList}>
          {editors.length === 0 && <li className={styles.editorEmpty}>No always editors.</li>}
          {editors.map(e => (
            <li key={e.email} className={styles.editor}>
              <div className="min-w-0">
                <span className="font-semibold break-all" style={{ color: 'var(--cn-text-primary)' }}>{e.email}</span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--cn-text-faint)' }}>
                  {e.name ? `${e.name} · dashboard account` : 'No dashboard account'}
                </span>
              </div>
              <Pill tone="green">Editor</Pill>
              <button type="button" onClick={() => void saveEditor('remove', e.email)} disabled={busy} aria-label={`Remove ${e.email}`} title="Remove"
                className="p-1.5 rounded-lg cursor-pointer disabled:opacity-50" style={{ color: '#ef4444' }}>
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Departments ── */}
      <section className={styles.section}>
        <div className={styles.heading}><div><h3>Department defaults</h3><p>Set the baseline permissions for each team.</p></div><Pill>{departments.length} departments</Pill></div>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Permission settings">
          <table className={styles.table}>
            <thead>
              <tr className="border-b" style={{ background: 'var(--cn-bg-row-even)', borderColor: 'var(--cn-border)' }}>
                <th scope="col" className={th} style={{ color: 'var(--cn-text-secondary)' }}>Department</th>
                {FIELDS.map(f => <th scope="col" key={f.key} className={th} style={{ color: 'var(--cn-text-secondary)' }} title={f.hint}>{f.label}<span className={styles.hint}>{f.hint}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {departments.map(d => (
                <tr key={d.name} className="border-b last:border-b-0" style={{ borderColor: 'var(--cn-border)' }}>
                  <td className={td}>
                    <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{d.name === 'None' ? 'No department' : d.name}</span>
                    <span className="block text-xs mt-1 leading-relaxed" style={{ color: 'var(--cn-text-faint)' }}>{d.people} {d.people === 1 ? 'person' : 'people'}</span>
                  </td>
                  {FIELDS.map(f => (
                    <td key={f.key} className={td}>
                      <RuleSelect field={f.key} value={d.rule[f.key]} inheritLabel="Default" inherited="by role" disabled={busy}
                        label={`${f.label} for ${d.name}`} onChange={v => void save('department', d.name, { ...d.rule, [f.key]: v })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>
          Defaults by role: everyone has access; Super Admin, HM, Mod, the PMs and the Web team can create; Super Admin and HM have full access;
          the Web team is added to new projects as Viewers. Automatic adding applies to projects created from now on.
        </p>
      </section>

      {/* ── People ── */}
      <section className={styles.section}>
        <div className={styles.heading}><div><h3>Individual permissions</h3><p>Override department settings and review each person’s effective access.</p></div><Pill>{shown.length} of {people.length} people</Pill></div>
          <div className={styles.filters}>
            <div className={styles.search}>
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--cn-text-faint)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people…" aria-label="Search people"
                className={`${inputClass} pl-9`} style={inputStyle} />
            </div>
            <select value={dept} onChange={e => setDept(e.target.value)} aria-label="Department" className={selectClass} style={inputStyle}>
              <option value="">All departments</option>
              {departments.map(d => <option key={d.name} value={d.name}>{d.name === 'None' ? 'No department' : d.name}</option>)}
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--cn-text-muted)' }}>
              <input type="checkbox" checked={onlyCustom} onChange={e => setOnlyCustom(e.target.checked)} className="accent-[#FE4A23]" />
              Only people with their own settings
            </label>
          </div>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Permission settings">
          <table className={styles.table}>
            <thead>
              <tr className="border-b" style={{ background: 'var(--cn-bg-row-even)', borderColor: 'var(--cn-border)' }}>
                <th scope="col" className={th} style={{ color: 'var(--cn-text-secondary)' }}>Person</th>
                <th scope="col" className={th} style={{ color: 'var(--cn-text-secondary)' }}>Department</th>
                {FIELDS.map(f => <th scope="col" key={f.key} className={th} style={{ color: 'var(--cn-text-secondary)' }} title={f.hint}>{f.label}<span className={styles.hint}>{f.hint}</span></th>)}
                <th scope="col" className={th} style={{ color: 'var(--cn-text-secondary)' }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(p => {
                const d = deptRule.get(p.department);
                const s = summary(p.policy);
                return (
                  <tr key={p.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--cn-border)' }}>
                    <td className={td}>
                      <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{p.name}</span>
                      <span className="block text-xs mt-1 leading-relaxed" style={{ color: 'var(--cn-text-faint)' }}>{[p.email || 'no email', p.role].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className={td} style={{ color: 'var(--cn-text-muted)' }}>{p.department === 'None' ? '—' : p.department}</td>
                    {FIELDS.map(f => (
                      <td key={f.key} className={td}>
                        {p.policy.locked ? (
                          <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--cn-text-faint)' }}><Lock className="w-3 h-3" /> {f.key === 'autoAdd' ? '—' : 'Yes'}</span>
                        ) : (
                          <RuleSelect field={f.key} value={p.own[f.key]} disabled={busy} label={`${f.label} for ${p.name}`}
                            inheritLabel={d?.[f.key] != null ? 'Department' : 'Default'}
                            inherited={show(f.key, (d?.[f.key] ?? p.roleDefault[f.key]) as boolean | AutoAdd)}
                            onChange={v => void save('user', p.id, { ...p.own, [f.key]: v })} />
                        )}
                      </td>
                    ))}
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        <Pill tone={s.tone}>{p.policy.locked ? 'Super Admin' : s.text}</Pill>
                        {p.policy.autoAdd && <Pill>Auto: {ACCESS_LABELS[p.policy.autoAdd]}</Pill>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!shown.length && <div className="p-6 text-center text-sm" style={{ color: 'var(--cn-text-muted)' }}>No people match.</div>}
        </div>
      </section>
    </div>
  );
}
