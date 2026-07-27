'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';

const PAGE_SIZE = 50;

interface DataTableProps {
  data: SheetData[];
  headers: string[];
}

export default function DataTable({ data, headers }: DataTableProps) {
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = [...data].sort((a, b) => {
    if (!sortCol) return 0;
    const av = a[sortCol] ?? '';
    const bv = b[sortCol] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageData = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  if (!headers.length) {
    return <div className="text-slate-400 text-center py-12">No data available</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-slate-700">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700">
              <th className="px-4 py-3 text-slate-400 font-medium w-12">#</th>
              {headers.map((h) => (
                <th
                  key={h}
                  onClick={() => handleSort(h)}
                  className="px-4 py-3 text-slate-300 font-medium whitespace-nowrap cursor-pointer hover:text-white select-none group"
                >
                  <div className="flex items-center gap-1">
                    {h}
                    {sortCol === h ? (
                      sortDir === 'asc' ? (
                        <ChevronUp className="w-3.5 h-3.5 text-blue-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
                      )
                    ) : (
                      <ChevronsUpDown className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={headers.length + 1} className="text-center text-slate-400 py-12">
                  No records found
                </td>
              </tr>
            ) : (
              pageData.map((row, i) => (
                <tr
                  key={i}
                  className={`border-b border-slate-800 hover:bg-slate-700/40 transition-colors ${
                    i % 2 === 0 ? 'bg-slate-900/30' : 'bg-slate-800/20'
                  }`}
                >
                  <td className="px-4 py-2.5 text-slate-500 tabular-nums">
                    {(currentPage - 1) * PAGE_SIZE + i + 1}
                  </td>
                  {headers.map((h) => (
                    <td key={h} className="px-4 py-2.5 text-slate-300 whitespace-nowrap max-w-xs truncate">
                      {String(row[h] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <p>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sorted.length)} of{' '}
            {sorted.length} records
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={currentPage === 1}
              className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              «
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ‹
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
              return start + i;
            }).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  p === currentPage
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
