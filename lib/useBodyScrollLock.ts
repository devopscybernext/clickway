'use client';

import { useEffect } from 'react';

// Freezes the page behind a popup so only the popup's own scrollbar moves.
// Reference-counted, so stacked popups (or one opening as another closes)
// never unlock the page early. The scrollbar's width is padded back in so
// the page doesn't jump sideways when it disappears.
let locks = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

export function useBodyScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    if (locks === 0) {
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      saved = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
      body.style.overflow = 'hidden';
      if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    }
    locks++;
    return () => {
      locks--;
      if (locks === 0 && saved) {
        body.style.overflow = saved.overflow;
        body.style.paddingRight = saved.paddingRight;
        saved = null;
      }
    };
  }, [active]);
}
