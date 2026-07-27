'use client';

import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface SearchFilterProps {
  searchTerm: string;
  totalCount: number;
  filteredCount: number;
  onChange: (term: string) => void;
}

export default function SearchFilter({ searchTerm, totalCount, filteredCount, onChange }: SearchFilterProps) {
  const [localValue, setLocalValue] = useState(searchTerm);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(searchTerm);
  }, [searchTerm]);

  const handleChange = (val: string) => {
    setLocalValue(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(val), 300);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange('');
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="relative flex-1 w-full">
        <Search style={{ color: 'var(--cn-text-muted)' }} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
        <input
          type="text"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search all columns…"
          style={{ background: 'var(--cn-bg-input)', borderColor: 'var(--cn-border)', color: 'var(--cn-text-primary)' }}
          className="w-full border placeholder-[var(--cn-text-faint)] rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FE4A23] transition"
        />
        {localValue && (
          <button
            onClick={handleClear}
            style={{ color: 'var(--cn-text-muted)' }}
            className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <p style={{ color: 'var(--cn-text-muted)' }} className="text-sm whitespace-nowrap">
        {searchTerm ? (
          <>
            <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{filteredCount}</span>
            <span> of {totalCount} records</span>
          </>
        ) : (
          <>
            <span className="font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{totalCount}</span>
            <span> records</span>
          </>
        )}
      </p>
    </div>
  );
}
