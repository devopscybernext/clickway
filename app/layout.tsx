import type { Metadata } from 'next';
import './globals.css';
import DisableDevTools from '@/components/DisableDevTools';

export const metadata: Metadata = {
  title: 'Cybernext Bandwidth Allocation Sheet',
  description: 'Real-time bandwidth allocation dashboard by Cybernext',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Set theme before paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('cn-theme') || 'dark';
            document.documentElement.setAttribute('data-theme', t);
          } catch(e) {}
        `}} />
      </head>
      <body className="min-h-full antialiased">
        <DisableDevTools />
        {children}
      </body>
    </html>
  );
}
