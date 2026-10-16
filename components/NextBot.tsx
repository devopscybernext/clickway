'use client';

import { Bot } from 'lucide-react';

// NextBot — placeholder until it is built
export default function NextBot() {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 px-6 py-24">
      <span className="w-14 h-14 rounded-2xl inline-flex items-center justify-center" style={{ background: 'rgba(254,74,35,0.12)', color: 'var(--cn-accent)' }}>
        <Bot className="w-7 h-7" />
      </span>
      <h2 className="font-semibold text-lg" style={{ color: 'var(--cn-text-primary)' }}>NextBot</h2>
      <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>Coming soon…</p>
    </div>
  );
}
