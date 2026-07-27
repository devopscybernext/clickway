'use client';

import { useEffect } from 'react';

// Cosmetic deterrent only — does not provide real security (trivially bypassed
// via browser menu, viewing source, etc). The actual protection is server-side
// access control and never shipping secrets to the client.
export default function DisableDevTools() {
  useEffect(() => {
    const blockContextMenu = (e: MouseEvent) => e.preventDefault();

    const blockKeys = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        k === 'f12' ||
        (e.ctrlKey && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) ||
        (e.ctrlKey && k === 'u')
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', blockContextMenu);
    document.addEventListener('keydown', blockKeys);
    return () => {
      document.removeEventListener('contextmenu', blockContextMenu);
      document.removeEventListener('keydown', blockKeys);
    };
  }, []);

  return null;
}
