'use client';

import { BarChart2, LineChart, AreaChart, PieChart, ScatterChart, Radar } from 'lucide-react';

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'scatter' | 'radar';

interface ChartSelectorProps {
  selected: ChartType;
  onChange: (type: ChartType) => void;
}

const CHARTS: { type: ChartType; label: string; Icon: React.ElementType }[] = [
  { type: 'bar', label: 'Bar', Icon: BarChart2 },
  { type: 'line', label: 'Line', Icon: LineChart },
  { type: 'area', label: 'Area', Icon: AreaChart },
  { type: 'pie', label: 'Pie', Icon: PieChart },
  { type: 'scatter', label: 'Scatter', Icon: ScatterChart },
  { type: 'radar', label: 'Radar', Icon: Radar },
];

export default function ChartSelector({ selected, onChange }: ChartSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {CHARTS.map(({ type, label, Icon }) => (
        <button
          key={type}
          onClick={() => onChange(type)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selected === type
              ? 'bg-blue-600 text-white shadow'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
