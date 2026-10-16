'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, AlertCircle, X } from 'lucide-react';
import { MultiSelect } from './FilteredDataTable';

export type InHouseSubTab = 'websites' | 'case-studies' | 'brand-kit' | 'documentations';

interface Row { [key: string]: string | number }
interface TabData { headers: string[]; data: Row[] }

const str = (v: unknown) => String(v ?? '').trim();

// Pick a cell by its header, ignoring case and stray spaces
const cell = (row: Row, headers: string[], name: string) => {
  const h = headers.find(x => x.trim().toLowerCase() === name);
  return h ? str(row[h]) : '';
};

// Links come from a sheet, so only real web addresses become buttons. A bare
// domain ("example.com") is given https://.
function safeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

// The filters each sub-tab offers: label shown, and the sheet column it reads
const FILTERS: Partial<Record<InHouseSubTab, { label: string; column: string }[]>> = {
  'websites': [
    { label: 'Name', column: 'website name' },
    { label: 'Platform', column: 'platform' },
    { label: 'Industry', column: 'industry' },
    { label: 'Status', column: 'status' },
  ],
  'case-studies': [
    { label: 'Name', column: 'website name' },
    { label: 'Platform', column: 'platform' },
    { label: 'Category', column: 'category' },
    { label: 'Industry', column: 'industry' },
    { label: 'Status', column: 'status' },
  ],
};

// Tags that say nothing are left out
const meaningful = (v: string) => !!v && !/^(n\/?a|none|-+)$/i.test(v);

// ── The short paragraph on each card, written from the sheet's own data ──────
const tidy = (v: string) => v.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+/g, ' ').trim();
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

function statusSentence(status: string): string {
  const s = status.trim().toLowerCase();
  if (!s) return '';
  if (s === 'live') return 'It is live right now.';
  if (s === 'not working') return 'It is not working at the moment and needs a look.';
  if (s === 'development server') return 'It is still on a development server, so it is not public yet.';
  if (s === 'review') return 'It is currently in review.';
  if (s === 'expired') return 'It has expired.';
  return `Its status is ${status.trim().toLowerCase()}.`;
}

function websiteBlurb(row: Row, headers: string[]): string {
  const name = cell(row, headers, 'website name');
  const platform = cell(row, headers, 'platform');
  const industry = cell(row, headers, 'industry');
  const kind = meaningful(platform) ? `${article(platform)} ${tidy(platform)} website` : 'a website';
  const field = meaningful(industry) ? ` in the ${tidy(industry)} space` : '';
  return [`${name} is ${kind}${field}.`, statusSentence(cell(row, headers, 'status'))].filter(Boolean).join(' ');
}

function caseStudyBlurb(row: Row, headers: string[]): string {
  const name = cell(row, headers, 'website name');
  const platform = cell(row, headers, 'platform');
  const industry = cell(row, headers, 'industry');
  const category = cell(row, headers, 'category');
  const kind = meaningful(platform) ? `${article(platform)} ${tidy(platform)} project` : 'a project';
  const field = meaningful(industry) ? ` in the ${tidy(industry)} space` : '';
  const work = meaningful(category) ? `, delivered as part of our ${tidy(category)} work` : '';
  return [`${name} is ${kind}${field}${work}.`, statusSentence(cell(row, headers, 'status')), 'The website and the full case study are linked below.'].filter(Boolean).join(' ');
}

function linkBlurb(row: Row, headers: string[], what: string): string {
  const name = cell(row, headers, 'name');
  const destination = cell(row, headers, 'destination');
  return `${name} for ${what}, shared as ${meaningful(destination) ? `${article(destination)} ${tidy(destination)}` : 'a link'}.`;
}

function Blurb({ children }: { children: string }) {
  return <p className="text-sm leading-relaxed" style={{ color: 'var(--cn-text-secondary)' }}>{children}</p>;
}

// Small grey pill with an orange dot — Platform, Category, Industry
function Tag({ children }: { children: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold"
      style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)' }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--cn-accent)' }} />
      {children}
    </span>
  );
}

// Status pill, top right: green for Live, red for anything else
function StatusPill({ status }: { status: string }) {
  if (!status) return null;
  const live = status.toLowerCase() === 'live';
  return (
    <span
      className="shrink-0 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold mt-0.5"
      style={live ? { background: '#1db210', color: '#fff' } : { background: '#d81010', color: '#fff' }}
      title={status}
    >
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: live ? '#44ff2a' : '#ff5c5c' }} />
      {status}
    </span>
  );
}

// Rounded pill buttons: filled orange for the main action, outlined for the other
function LinkButton({ href, label, primary }: { href: string | null; label: string; primary?: boolean }) {
  const base = 'inline-flex items-center px-5 py-2.5 rounded-full text-xs font-semibold transition-all';
  if (!href) {
    return (
      <span className={`${base} opacity-50 cursor-not-allowed`} style={{ border: '1px solid var(--cn-border)', color: 'var(--cn-text-muted)' }} title="No link in the sheet">
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} cursor-pointer hover:shadow-md`}
      style={primary
        ? { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }
        : { background: 'transparent', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-text-primary)' }}
    >
      {label}
    </a>
  );
}

const cardClass = 'rounded-3xl border p-7 flex flex-col gap-5 transition-shadow hover:shadow-lg';
const cardStyle = { background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)' };

// name (big) and, optionally, the status on the right
function CardTop({ name, status }: { name: string; status?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h3 className="font-bold text-2xl leading-tight tracking-tight break-words" style={{ color: 'var(--cn-text-primary)' }}>{name}</h3>
      {status ? <StatusPill status={status} /> : null}
    </div>
  );
}

// divider, then the tags
function CardTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-5 mt-auto" style={{ borderTop: '1px solid var(--cn-border)' }}>
      {tags.map((t, i) => <Tag key={`${t}-${i}`}>{t}</Tag>)}
    </div>
  );
}

function WebsiteCard({ row, headers }: { row: Row; headers: string[] }) {
  return (
    <article className={cardClass} style={cardStyle}>
      <CardTop name={cell(row, headers, 'website name')} status={cell(row, headers, 'status')} />
      <Blurb>{websiteBlurb(row, headers)}</Blurb>
      <div className="flex flex-wrap gap-2">
        <LinkButton href={safeUrl(cell(row, headers, 'website link'))} label="Visit Website" primary />
      </div>
      <CardTags tags={[cell(row, headers, 'platform'), cell(row, headers, 'industry')].filter(meaningful)} />
    </article>
  );
}

function CaseStudyCard({ row, headers }: { row: Row; headers: string[] }) {
  return (
    <article className={cardClass} style={cardStyle}>
      <CardTop name={cell(row, headers, 'website name')} status={cell(row, headers, 'status')} />
      <Blurb>{caseStudyBlurb(row, headers)}</Blurb>
      <div className="flex flex-wrap gap-2">
        <LinkButton href={safeUrl(cell(row, headers, 'website link'))} label="Visit Website" primary />
        <LinkButton href={safeUrl(cell(row, headers, 'url'))} label="Case Study" />
      </div>
      <CardTags tags={[cell(row, headers, 'platform'), cell(row, headers, 'category'), cell(row, headers, 'industry')].filter(meaningful)} />
    </article>
  );
}

// Brand Kit and Documentations: a name, where the link goes, and one Open button
function LinkCardItem({ row, headers, what }: { row: Row; headers: string[]; what: string }) {
  return (
    <article className={cardClass} style={cardStyle}>
      <CardTop name={cell(row, headers, 'name')} status={cell(row, headers, 'status')} />
      <Blurb>{linkBlurb(row, headers, what)}</Blurb>
      <div className="flex flex-wrap gap-2">
        <LinkButton href={safeUrl(cell(row, headers, 'url'))} label="Open Link" primary />
      </div>
      <CardTags tags={[cell(row, headers, 'destination')].filter(meaningful)} />
    </article>
  );
}

interface Props {
  subTab: InHouseSubTab;
  /** Changes when the dashboard's Refresh button is pressed */
  refreshKey?: string;
}

// Cybernext InHouse: our own websites and case studies as cards, three per row.
export default function InHouse({ subTab, refreshKey }: Props) {
  const [websites, setWebsites] = useState<TabData | null>(null);
  const [caseStudies, setCaseStudies] = useState<TabData | null>(null);
  const [brandKit, setBrandKit] = useState<TabData | null>(null);
  const [documentations, setDocumentations] = useState<TabData | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  // chosen values per filter, remembered separately for each sub-tab
  const [chosen, setChosen] = useState<Partial<Record<InHouseSubTab, Record<string, string[]>>>>({});

  useEffect(() => {
    let cancelled = false;
    fetch('/api/inhouse')
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        if (!json.success) { setError(json.error || 'Could not load the portfolio.'); return; }
        setError('');
        setWebsites(json.websites);
        setCaseStudies(json.caseStudies);
        setBrandKit(json.brandKit ?? { headers: [], data: [] });
        setDocumentations(json.documentations ?? { headers: [], data: [] });
      })
      .catch(() => { if (!cancelled) setError('Could not load the portfolio.'); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const tab = { 'websites': websites, 'case-studies': caseStudies, 'brand-kit': brandKit, 'documentations': documentations }[subTab];
  const filters = FILTERS[subTab] ?? [];
  const picked = chosen[subTab] ?? {};
  const setPicked = (column: string, values: string[]) => setChosen(prev => ({ ...prev, [subTab]: { ...(prev[subTab] ?? {}), [column]: values } }));
  const activeFilters = filters.filter(f => (picked[f.column]?.length ?? 0) > 0).length;

  // every value in the sheet for each filter, so the lists don't shrink as you pick
  const options = useMemo(() => {
    const out: Record<string, string[]> = {};
    if (!tab) return out;
    filters.forEach(f => {
      out[f.column] = [...new Set(tab.data.map(r => cell(r, tab.headers, f.column)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, subTab]);

  const rows = useMemo(() => {
    if (!tab) return [];
    const q = query.trim().toLowerCase();
    return tab.data.filter(r => {
      for (const f of filters) {
        const sel = picked[f.column];
        if (sel && sel.length > 0 && !sel.includes(cell(r, tab.headers, f.column))) return false;
      }
      return !q || Object.values(r).some(v => String(v).toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query, chosen, subTab]);

  const COPY: Record<InHouseSubTab, { title: string; blurb: string }> = {
    'websites': { title: 'Websites', blurb: 'Every website Cybernext has built or manages.' },
    'case-studies': { title: 'Case Studies', blurb: 'Our live portfolio, with the website and the case study page for each.' },
    'brand-kit': { title: 'Brand Kit', blurb: 'Logos, fonts, colours and the other brand files.' },
    'documentations': { title: 'Documentations', blurb: 'Company documents and research.' },
  };
  const { title, blurb } = COPY[subTab];

  return (
    <div className="p-3 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="font-semibold text-base" style={{ color: 'var(--cn-text-primary)' }}>{title}</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
            {blurb}{tab ? ` Showing ${rows.length} of ${tab.data.length}.` : ''}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--cn-text-muted)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            aria-label={`Search ${title.toLowerCase()}`}
            className="w-full text-sm rounded-lg pl-9 pr-3 py-2 border focus:outline-none focus:ring-1 focus:ring-[#FE4A23]"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', borderColor: 'var(--cn-border)' }}
          />
        </div>
      </div>

      {tab && filters.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 mb-5">
          {filters.map(f => (
            <MultiSelect
              key={f.column}
              label={f.label}
              options={options[f.column] ?? []}
              selected={picked[f.column] ?? []}
              onChange={values => setPicked(f.column, values)}
            />
          ))}
          {activeFilters > 0 && (
            <button
              onClick={() => setChosen(prev => ({ ...prev, [subTab]: {} }))}
              title={`Clear all ${activeFilters} filter${activeFilters === 1 ? '' : 's'}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all text-xs font-medium"
              style={{ background: 'var(--cn-bg-input)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <X className="w-3.5 h-3.5" />
              Clear all ({activeFilters})
            </button>
          )}
        </div>
      )}

      {error ? (
        <p className="text-sm flex items-center gap-2 py-10 justify-center" style={{ color: '#ef4444' }}>
          <AlertCircle className="w-4 h-4" /> {error}
        </p>
      ) : !tab ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 rounded-3xl" style={{ background: 'var(--cn-bg-input)' }} />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: 'var(--cn-text-muted)' }}>
          {query || activeFilters > 0 ? 'Nothing matches your search and filters.' : `No ${title.toLowerCase()} in the sheet yet.`}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r, i) => {
            const key = `${cell(r, tab.headers, 'website name') || cell(r, tab.headers, 'name')}-${i}`;
            return subTab === 'websites' ? <WebsiteCard key={key} row={r} headers={tab.headers} />
              : subTab === 'case-studies' ? <CaseStudyCard key={key} row={r} headers={tab.headers} />
              : <LinkCardItem key={key} row={r} headers={tab.headers} what={subTab === 'brand-kit' ? 'the Cybernext brand kit' : 'the team documentation'} />;
          })}
        </div>
      )}
    </div>
  );
}
