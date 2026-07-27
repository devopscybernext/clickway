'use client';

import { BarChart2, TrendingUp, TrendingDown, Hash } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';

interface StatsCardsProps {
  data: SheetData[];
}

function getNumericValues(data: SheetData[]): number[] {
  const nums: number[] = [];
  data.forEach((row) => {
    Object.values(row).forEach((v) => {
      if (typeof v === 'number' && isFinite(v)) nums.push(v);
    });
  });
  return nums;
}

export default function StatsCards({ data }: StatsCardsProps) {
  const nums = getNumericValues(data);
  const total = data.length;
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  const max = nums.length ? Math.max(...nums) : 0;
  const min = nums.length ? Math.min(...nums) : 0;

  const fmt = (n: number) =>
    Math.abs(n) >= 1_000_000
      ? (n / 1_000_000).toFixed(1) + 'M'
      : Math.abs(n) >= 1_000
      ? (n / 1_000).toFixed(1) + 'K'
      : n.toFixed(2);

  const cards = [
    {
      label: 'Total Records',
      value: total.toLocaleString(),
      icon: Hash,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      label: 'Average Value',
      value: nums.length ? fmt(avg) : '—',
      icon: BarChart2,
      color: 'text-violet-400',
      bg: 'bg-violet-500/10',
      border: 'border-violet-500/20',
    },
    {
      label: 'Max Value',
      value: nums.length ? fmt(max) : '—',
      icon: TrendingUp,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    {
      label: 'Min Value',
      value: nums.length ? fmt(min) : '—',
      icon: TrendingDown,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, color, bg, border }) => (
        <div
          key={label}
          className={`rounded-md border ${border} ${bg} p-4 hover:scale-[1.02] transition-transform duration-200`}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-400 text-sm font-medium">{label}</p>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
          </div>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}
