import { NextRequest } from 'next/server';

// Browsers tag every request with Sec-Fetch-* metadata describing how it was
// made. Pasting a URL into the address bar (or following a link) produces
// Sec-Fetch-Mode: navigate / Sec-Fetch-Dest: document — a top-level page
// load. The app's own fetch() calls from inside the dashboard instead send
// Sec-Fetch-Mode: same-origin / Sec-Fetch-Dest: empty. This lets us reject
// "open this API URL directly in a tab" while leaving in-app calls untouched.
export function isDirectBrowserNavigation(req: NextRequest): boolean {
  const mode = req.headers.get('sec-fetch-mode');
  const dest = req.headers.get('sec-fetch-dest');
  return mode === 'navigate' || dest === 'document';
}
