'use client';

import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { SheetData } from '@/lib/googleSheets';
import { ChartType } from './ChartSelector';

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6',
];

interface ChartsProps {
  data: SheetData[];
  chartType: ChartType;
  headers: string[];
}

function prepareChartData(data: SheetData[], headers: string[], max = 50) {
  return data.slice(0, max).map((row, i) => {
    const label = String(row[headers[0]] ?? `Row ${i + 1}`);
    const result: Record<string, string | number> = { name: label };
    headers.slice(1).forEach((h) => {
      if (typeof row[h] === 'number') result[h] = row[h] as number;
    });
    return result;
  });
}

function getNumericHeaders(data: SheetData[], headers: string[]): string[] {
  return headers.filter((h) => data.some((r) => typeof r[h] === 'number'));
}

const tooltipStyle = {
  contentStyle: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0' },
  labelStyle: { color: '#94a3b8' },
};

export default function Charts({ data, chartType, headers }: ChartsProps) {
  if (!data.length || !headers.length) {
    return (
      <div className="flex items-center justify-center h-72 text-slate-400">No data to display</div>
    );
  }

  const numericHeaders = getNumericHeaders(data, headers);
  const chartData = prepareChartData(data, headers);

  if (!numericHeaders.length) {
    return (
      <div className="flex items-center justify-center h-72 text-slate-400">
        No numeric columns found for chart
      </div>
    );
  }

  const displayKeys = numericHeaders.slice(0, 5);

  if (chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
          {displayKeys.map((key, i) => (
            <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
          {displayKeys.map((key, i) => (
            <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height={360}>
        <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
          {displayKeys.map((key, i) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'pie') {
    const pieData = data.slice(0, 10).map((row, i) => ({
      name: String(row[headers[0]] ?? `Item ${i + 1}`),
      value: typeof row[numericHeaders[0]] === 'number' ? (row[numericHeaders[0]] as number) : 0,
    }));
    return (
      <ResponsiveContainer width="100%" height={360}>
        <PieChart>
          <Pie data={pieData} cx="50%" cy="50%" outerRadius={130} dataKey="value" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`} labelLine={false}>
            {pieData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'scatter') {
    const xKey = numericHeaders[0];
    const yKey = numericHeaders[1] ?? numericHeaders[0];
    const scatterData = data.slice(0, 200).map((row) => ({
      x: typeof row[xKey] === 'number' ? row[xKey] : 0,
      y: typeof row[yKey] === 'number' ? row[yKey] : 0,
    }));
    return (
      <ResponsiveContainer width="100%" height={360}>
        <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="x" name={xKey} tick={{ fill: '#94a3b8', fontSize: 11 }} label={{ value: xKey, fill: '#94a3b8', position: 'insideBottom', offset: -5 }} />
          <YAxis dataKey="y" name={yKey} tick={{ fill: '#94a3b8', fontSize: 11 }} label={{ value: yKey, fill: '#94a3b8', angle: -90, position: 'insideLeft' }} />
          <ZAxis range={[40, 40]} />
          <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={scatterData} fill={COLORS[0]} fillOpacity={0.7} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'radar') {
    const radarData = displayKeys.map((key) => {
      const vals = data.map((r) => (typeof r[key] === 'number' ? (r[key] as number) : 0));
      const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      return { subject: key, value: avg };
    });
    return (
      <ResponsiveContainer width="100%" height={360}>
        <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={130}>
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <PolarRadiusAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <Radar name="Average" dataKey="value" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.25} strokeWidth={2} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  return null;
}
