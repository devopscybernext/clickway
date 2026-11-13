'use client';

import { NavLeaf } from '@/lib/auth';

// The tabs on a Cybernext InHouse page. The sidebar opens Internal or Tools; the page shows that page's
// sub pages as tabs (Internal: Websites, Case Studies, Brand Kit, Documentations, Holiday Calendar. Tools: Clock Room,
// AI Tools, NextBot), only those the role may open. One tab alone is not worth a tab bar, so it is left out.

export default function BusinessDevTabs({ pages, isTabActive, onNavigate }: {
  pages: NavLeaf[];                          // the user's Cybernext InHouse pages, each with its tabs
  isTabActive: (tab: NavLeaf) => boolean;
  onNavigate: (tab: NavLeaf) => void;
}) {
  const page = pages.find(p => p.tabs?.some(isTabActive));
  const tabs = page?.tabs ?? [];
  if (!page || tabs.length < 2) return null;
  return (
    <div role="tablist" aria-label={page.label} className="flex flex-wrap gap-2 mb-4">
      {tabs.map(tab => {
        const on = isTabActive(tab);
        return (
          <button key={`${tab.id}-${tab.subTab}`} role="tab" aria-selected={on} onClick={() => onNavigate(tab)}
            className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all"
            style={on
              ? { background: 'var(--cn-accent)', color: '#fff', border: '1px solid var(--cn-accent)' }
              : { background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
