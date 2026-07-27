'use client';

import {
  PartyPopper, CalendarDays, Sparkles, Flag, Palette, Flame, Moon, TreePine,
  Feather, BookOpen, Sun, Gift, Star, type LucideIcon,
} from 'lucide-react';
import { SheetData } from '@/lib/googleSheets';

interface Holiday {
  name: string;
  date: Date;
  day: string;
  raw: string;
}

// Keyword -> icon/color mapping, checked in order (first match wins)
const HOLIDAY_ICON_RULES: { keywords: string[]; icon: LucideIcon; color: string }[] = [
  { keywords: ['new year'],                          icon: PartyPopper, color: '#FE4A23' },
  { keywords: ['republic day', 'independence day'],  icon: Flag,        color: '#16a34a' },
  { keywords: ['holi'],                               icon: Palette,     color: '#ec4899' },
  { keywords: ['diwali', 'deepavali'],                icon: Flame,       color: '#f59e0b' },
  { keywords: ['eid', 'id-ul', 'ramadan'],            icon: Moon,        color: '#0891b2' },
  { keywords: ['christmas'],                          icon: TreePine,    color: '#16a34a' },
  { keywords: ['gandhi jayanti'],                     icon: Feather,     color: '#6b7280' },
  { keywords: ['guru nanak', 'gurpurab'],             icon: BookOpen,    color: '#7c3aed' },
  { keywords: ['dussehra', 'navratri', 'durga'],     icon: Star,        color: '#dc2626' },
  { keywords: ['raksha bandhan'],                     icon: Gift,        color: '#db2777' },
  { keywords: ['makar sankranti', 'pongal'],         icon: Sun,         color: '#f59e0b' },
];

function getHolidayIcon(name: string): { Icon: LucideIcon; color: string } {
  const lower = name.toLowerCase();
  for (const rule of HOLIDAY_ICON_RULES) {
    if (rule.keywords.some(k => lower.includes(k))) return { Icon: rule.icon, color: rule.color };
  }
  return { Icon: PartyPopper, color: '#6b7280' };
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  // Sheet uses DD/MM/YYYY
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    if (!isNaN(d.getTime())) return d;
  }
  const d2 = new Date(raw);
  return isNaN(d2.getTime()) ? null : d2;
}

function daysAway(date: Date): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function HolidayCalendar({ data, headers }: { data: SheetData[]; headers: string[] }) {
  const nameCol = headers.find(h => h.toLowerCase().includes('name'));
  const dateCol = headers.find(h => h.toLowerCase().includes('date'));
  const dayCol  = headers.find(h => h.toLowerCase().includes('day'));

  if (!nameCol || !dateCol) {
    return (
      <div className="cn-card rounded-xl p-6 text-center text-sm" style={{ background: 'var(--cn-bg-card)', color: 'var(--cn-text-muted)' }}>
        Name or Date column not found in the Holiday sheet.
      </div>
    );
  }

  const holidays: Holiday[] = data
    .map(r => {
      const raw = String(r[dateCol] ?? '').trim();
      const date = parseDate(raw);
      return date ? {
        name: String(r[nameCol] ?? '').trim(),
        date,
        day: dayCol ? String(r[dayCol] ?? '').trim() : date.toLocaleDateString('en-US', { weekday: 'long' }),
        raw,
      } : null;
    })
    .filter((h): h is Holiday => h !== null && !!h.name)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (holidays.length === 0) {
    return (
      <div className="cn-card rounded-xl p-6 text-center text-sm" style={{ background: 'var(--cn-bg-card)', color: 'var(--cn-text-muted)' }}>
        No holidays found. Add rows to the Holiday sheet tab (Name, Date, Day).
      </div>
    );
  }

  const upcoming = holidays.filter(h => daysAway(h.date) >= 0);
  const next = upcoming[0];
  const nextIcon = next ? getHolidayIcon(next.name) : null;

  return (
    <div className="space-y-5">
      {/* Next holiday spotlight */}
      {next && nextIcon && (
        <div
          className="relative rounded-2xl p-6 overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${nextIcon.color}22, var(--cn-bg-card) 60%)`,
            border: `1px solid ${nextIcon.color}55`,
          }}
        >
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={{ background: `${nextIcon.color}20`, color: nextIcon.color }}>
              <nextIcon.Icon className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: nextIcon.color }}>Next Holiday</p>
              <p className="text-2xl font-extrabold" style={{ color: 'var(--cn-text-primary)' }}>{next.name}</p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>
                {next.day}, {next.date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-4xl font-extrabold tabular-nums" style={{ color: nextIcon.color }}>
                {daysAway(next.date) === 0 ? 'Today' : daysAway(next.date)}
              </p>
              {daysAway(next.date) > 0 && (
                <p className="text-[11px]" style={{ color: 'var(--cn-text-muted)' }}>day{daysAway(next.date) === 1 ? '' : 's'} away</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Card grid */}
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4" style={{ color: 'var(--cn-text-muted)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>All Holidays</h3>
        <span className="text-xs ml-auto" style={{ color: 'var(--cn-text-muted)' }}>{holidays.length} total</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {holidays.map((h, i) => {
          const away = daysAway(h.date);
          const isPast = away < 0;
          const isToday = away === 0;
          const { Icon, color } = getHolidayIcon(h.name);
          return (
            <div
              key={i}
              className="cn-card rounded-xl p-4"
              style={{ background: 'var(--cn-bg-card)', opacity: isPast ? 0.5 : 1 }}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}18`, color }}>
                  <Icon className="w-5 h-5" />
                </div>
                {isToday ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full shrink-0" style={{ background: `${color}18`, color }}>
                    <Sparkles className="w-3 h-3" /> Today
                  </span>
                ) : !isPast ? (
                  <span className="text-[11px] font-semibold shrink-0" style={{ color: 'var(--cn-text-muted)' }}>{away} day{away === 1 ? '' : 's'} away</span>
                ) : (
                  <span className="text-[11px] shrink-0" style={{ color: 'var(--cn-text-faint)' }}>Past</span>
                )}
              </div>
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>{h.name}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--cn-text-muted)' }}>
                {h.day}, {h.date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
