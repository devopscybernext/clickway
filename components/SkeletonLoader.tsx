'use client';

export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-md border border-slate-700 bg-slate-800/50 p-4 animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="h-4 w-24 bg-slate-700 rounded" />
            <div className="w-8 h-8 bg-slate-700 rounded-lg" />
          </div>
          <div className="h-8 w-16 bg-slate-700 rounded" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="rounded-md border border-slate-700 bg-slate-800/50 p-6 animate-pulse">
      <div className="h-6 w-32 bg-slate-700 rounded mb-4" />
      <div className="h-72 bg-slate-700/50 rounded-lg" />
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="rounded-md border border-slate-700 bg-slate-800/50 overflow-hidden animate-pulse">
      <div className="bg-slate-800 px-4 py-3 flex gap-4 border-b border-slate-700">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 bg-slate-700 rounded flex-1" />
        ))}
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="px-4 py-3 flex gap-4 border-b border-slate-800">
          {Array.from({ length: 5 }).map((_, j) => (
            <div key={j} className="h-4 bg-slate-700/60 rounded flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
