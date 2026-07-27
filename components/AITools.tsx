'use client';

import { useState } from 'react';
import { ExternalLink, Sparkles, Briefcase, Hammer, Search, X } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';

type FocusFilter = 'All' | 'Management' | 'Production';
type PriceFilter = 'All' | 'Free' | 'Freemium' | 'Premium';

interface Tool {
  name: string;
  description: string;
  price: string;
  categories: string[];
  url: string;
  pmFocus: boolean;
  resourceFocus: boolean;
}

const PRICE_COLORS: Record<string, string> = {
  free: '#16a34a',
  freemium: '#FE4A23',
  premium: '#7c3aed',
};

export default function AITools({ data, headers }: { data: SheetData[]; headers: string[] }) {
  const [category, setCategory] = useState('All');
  const [focus, setFocus] = useState<FocusFilter>('All');
  const [price, setPrice] = useState<PriceFilter>('All');
  const [search, setSearch] = useState('');

  const nameCol     = headers.find(h => h.toLowerCase().includes('tool name') || h.toLowerCase() === 'name');
  const descCol     = headers.find(h => h.toLowerCase().includes('description'));
  const priceCol    = headers.find(h => h.toLowerCase().includes('price'));
  const catCol      = headers.find(h => h.toLowerCase().includes('categor'));
  const urlCol      = headers.find(h => h.toLowerCase().includes('url') || h.toLowerCase().includes('link'));
  const pmCol       = headers.find(h => h.toLowerCase().includes('pm focus'));
  const resourceCol = headers.find(h => h.toLowerCase().includes('resource focus'));

  if (!nameCol || !urlCol) {
    return (
      <div className="cn-card rounded-xl p-6 text-center text-sm" style={{ background: 'var(--cn-bg-card)', color: 'var(--cn-text-muted)' }}>
        Tool Name or URL column not found in the AI Tools sheet.
      </div>
    );
  }

  const tools: Tool[] = data
    .map(r => ({
      name: String(r[nameCol] ?? '').trim(),
      description: descCol ? String(r[descCol] ?? '').trim() : '',
      price: priceCol ? String(r[priceCol] ?? '').trim() : '',
      categories: catCol ? String(r[catCol] ?? '').trim().split(',').map(c => c.trim()).filter(Boolean) : [],
      url: String(r[urlCol] ?? '').trim(),
      pmFocus: pmCol ? String(r[pmCol] ?? '').trim().toLowerCase() === 'yes' : false,
      resourceFocus: resourceCol ? String(r[resourceCol] ?? '').trim().toLowerCase() === 'yes' : false,
    }))
    .filter(t => t.name && t.url);

  if (tools.length === 0) {
    return (
      <div className="cn-card rounded-xl p-6 text-center text-sm" style={{ background: 'var(--cn-bg-card)', color: 'var(--cn-text-muted)' }}>
        No tools found. Add rows to the AI Tools sheet tab.
      </div>
    );
  }

  const allCategories = ['All', ...Array.from(new Set(tools.flatMap(t => t.categories))).sort()];

  const searchQ = search.trim().toLowerCase();

  const filtered = tools
    .filter(t => category === 'All' || t.categories.includes(category))
    .filter(t => focus === 'All' || (focus === 'Management' ? t.pmFocus : t.resourceFocus))
    .filter(t => price === 'All' || t.price.toLowerCase() === price.toLowerCase())
    .filter(t => !searchQ || t.name.toLowerCase().includes(searchQ) || t.description.toLowerCase().includes(searchQ) || t.categories.some(c => c.toLowerCase().includes(searchQ)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectStyle = {
    background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)',
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--cn-text-muted)' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tools by name, description, or category..."
          className="w-full pl-9 pr-8 py-2 rounded-lg text-xs focus:outline-none"
          style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
            style={{ color: 'var(--cn-text-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {allCategories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer"
              style={{
                background: category === c ? 'var(--cn-accent)' : 'var(--cn-bg-input)',
                color: category === c ? '#fff' : 'var(--cn-text-muted)',
                border: `1px solid ${category === c ? 'var(--cn-accent)' : 'var(--cn-border)'}`,
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={focus}
            onChange={e => setFocus(e.target.value as FocusFilter)}
            className="text-sm font-medium rounded-lg px-3 py-2 cursor-pointer focus:outline-none"
            style={selectStyle}
          >
            <option value="All">Focus: All</option>
            <option value="Management">Management</option>
            <option value="Production">Production</option>
          </select>
          <select
            value={price}
            onChange={e => setPrice(e.target.value as PriceFilter)}
            className="text-sm font-medium rounded-lg px-3 py-2 cursor-pointer focus:outline-none"
            style={selectStyle}
          >
            <option value="All">Price: All</option>
            <option value="Free">Free</option>
            <option value="Freemium">Freemium</option>
            <option value="Premium">Premium</option>
          </select>
        </div>
      </div>

      <p className="text-xs" style={{ color: 'var(--cn-text-muted)' }}>{filtered.length} tool{filtered.length === 1 ? '' : 's'}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((tool, i) => {
          const priceColor = PRICE_COLORS[tool.price.toLowerCase()] ?? '#6b7280';
          return (
            <div key={i} className="cn-card rounded-xl p-4 flex flex-col" style={{ background: 'var(--cn-bg-card)' }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--cn-accent)' + '18', color: 'var(--cn-accent)' }}>
                  <Sparkles className="w-4 h-4" />
                </div>
                {tool.price && (
                  <span className="text-[11px] font-bold px-2 py-1 rounded-full shrink-0" style={{ background: `${priceColor}18`, color: priceColor }}>
                    {tool.price}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{tool.name}</p>
              {tool.description && (
                <p className="text-xs mt-1 flex-1" style={{ color: 'var(--cn-text-muted)' }}>{tool.description}</p>
              )}
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {tool.categories.map(c => (
                  <span key={c} className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-muted)' }}>
                    {c}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--cn-border-light)' }}>
                <div className="flex items-center gap-2">
                  {tool.pmFocus && (
                    <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--cn-text-muted)' }} title="Useful for PMs">
                      <Briefcase className="w-3 h-3" /> Management
                    </span>
                  )}
                  {tool.resourceFocus && (
                    <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--cn-text-muted)' }} title="Useful for Resources">
                      <Hammer className="w-3 h-3" /> Production
                    </span>
                  )}
                </div>
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
                  style={{ color: 'var(--cn-accent)', background: 'var(--cn-accent)' + '15' }}
                >
                  Visit <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
