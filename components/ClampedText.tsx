'use client';

import { useState } from 'react';

// Long free text in a table cell — shows the first `limit` words with an
// ellipsis and a Show more / Show less toggle, so one wordy cell can't blow a
// row up to a wall of text. Short text renders as-is.
export default function ClampedText({ text, limit = 30 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();
  if (!trimmed) return <>—</>;

  const words = trimmed.split(/\s+/);
  if (words.length <= limit) return <>{trimmed}</>;

  return (
    <>
      {open ? trimmed : `${words.slice(0, limit).join(' ')}…`}
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="ml-1.5 text-[11px] font-semibold cursor-pointer hover:opacity-80 whitespace-nowrap"
        style={{ color: 'var(--cn-accent)' }}
      >
        {open ? 'Show less' : 'Show more'}
      </button>
    </>
  );
}
