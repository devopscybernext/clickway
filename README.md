# Google Sheets Dashboard

A real-time, interactive dashboard built with Next.js 14 that visualises data from Google Sheets. Supports multiple chart types, search/filter, CSV export, and auto-refresh.

## Features

- **Real-time data** — auto-refreshes every 30 seconds
- **6 chart types** — Bar, Line, Area, Pie, Scatter, Radar (powered by Recharts)
- **Data table** — sortable columns, pagination (50 rows/page), horizontal scroll
- **Search & filter** — debounced full-text search across all columns
- **Statistics cards** — total records, average, max, min
- **CSV export** — downloads the current (filtered) dataset
- **Two sheet selector** — switch between Sheet 1 and Sheet 2 in-header
- **Dark theme** — slate-900 base, Tailwind CSS throughout
- **Skeleton loaders** — smooth loading states on first fetch
- **Responsive** — mobile, tablet, desktop layouts

## Tech Stack

| Tool | Purpose |
|------|---------|
| Next.js 14 (App Router) | Framework |
| TypeScript | Type safety |
| Tailwind CSS v4 | Styling |
| Recharts | Charts |
| Lucide React | Icons |

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/google-sheets-dashboard.git
cd google-sheets-dashboard
npm install
```

### 2. Configure environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SHEET_ID_1=your_first_sheet_id
NEXT_PUBLIC_SHEET_ID_2=your_second_sheet_id
NEXT_PUBLIC_GOOGLE_API_KEY=your_google_api_key
```

> **Finding your Sheet ID:** Open the Google Sheet and copy the long string between `/d/` and `/edit` in the URL.

> **Getting an API Key:** Go to Google Cloud Console → APIs & Services → Credentials → Create API Key → enable the **Google Sheets API**.

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

1. Push this repo to GitHub.
2. Go to vercel.com/new and import the repo.
3. Add the three environment variables under **Settings → Environment Variables**:
   - `NEXT_PUBLIC_SHEET_ID_1`
   - `NEXT_PUBLIC_SHEET_ID_2`
   - `NEXT_PUBLIC_GOOGLE_API_KEY`
4. Deploy — Vercel auto-deploys on every push to `main`.

## Project Structure

```
google-sheets-dashboard/
├── app/
│   ├── api/data/route.ts   # Google Sheets proxy API
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── Charts.tsx          # All 6 chart types
│   ├── ChartSelector.tsx   # Chart type toggle buttons
│   ├── Dashboard.tsx       # Main orchestrator component
│   ├── DataTable.tsx       # Sortable paginated table
│   ├── Header.tsx          # Top bar with controls
│   ├── SearchFilter.tsx    # Debounced search input
│   ├── SkeletonLoader.tsx  # Loading placeholders
│   └── StatsCards.tsx      # Summary stat cards
├── lib/
│   └── googleSheets.ts     # Fetch + 60s in-memory cache
├── .env.local              # Local secrets (not committed)
└── README.md
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SHEET_ID_1` | Google Sheets ID for Sheet 1 |
| `NEXT_PUBLIC_SHEET_ID_2` | Google Sheets ID for Sheet 2 |
| `NEXT_PUBLIC_GOOGLE_API_KEY` | Google API key with Sheets API enabled |

## Switching to Different Sheets

Update the Sheet IDs in `.env.local` (locally) and in Vercel's Environment Variables (production). No code changes required.
