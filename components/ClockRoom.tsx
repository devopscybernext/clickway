'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { Globe2, Search, MapPinOff, ArrowRightLeft, ChevronDown, X } from 'lucide-react';

type Country = 'usa' | 'india' | 'canada' | 'australia' | 'belgium' | 'netherlands' | 'germany' | 'uae' | 'ireland' | 'southkorea';

interface CityZone {
  city: string;
  zone: string;     // IANA timezone
  label: string;     // e.g. "Eastern Time"
  covers?: string;   // states/regions that share this zone
}

const COUNTRY_ZONES: Record<Country, CityZone[]> = {
  usa: [
    { city: 'New York',    zone: 'America/New_York',    label: 'Eastern Time',  covers: 'New York, Florida, Georgia, Virginia, Massachusetts' },
    { city: 'Chicago',     zone: 'America/Chicago',     label: 'Central Time',  covers: 'Texas, Illinois, Louisiana, Wisconsin, Tennessee' },
    { city: 'Denver',      zone: 'America/Denver',      label: 'Mountain Time', covers: 'Colorado, Arizona, Utah, Montana, New Mexico' },
    { city: 'Los Angeles', zone: 'America/Los_Angeles', label: 'Pacific Time',  covers: 'California, Washington, Oregon, Nevada' },
    { city: 'Anchorage',   zone: 'America/Anchorage',   label: 'Alaska Time',   covers: 'Alaska' },
    { city: 'Honolulu',    zone: 'Pacific/Honolulu',    label: 'Hawaii-Aleutian Time', covers: 'Hawaii' },
  ],
  india: [
    { city: 'Mumbai / Delhi', zone: 'Asia/Kolkata', label: 'Indian Standard Time', covers: 'Nationwide — single time zone' },
  ],
  canada: [
    { city: 'St. John\'s', zone: 'America/St_Johns',  label: 'Newfoundland Time', covers: 'Newfoundland and Labrador' },
    { city: 'Halifax',     zone: 'America/Halifax',   label: 'Atlantic Time',     covers: 'Nova Scotia, New Brunswick, Prince Edward Island' },
    { city: 'Toronto',     zone: 'America/Toronto',   label: 'Eastern Time',      covers: 'Ontario, Quebec' },
    { city: 'Winnipeg',    zone: 'America/Winnipeg',  label: 'Central Time',      covers: 'Manitoba, Saskatchewan (most)' },
    { city: 'Edmonton',    zone: 'America/Edmonton',  label: 'Mountain Time',     covers: 'Alberta, Northwest Territories' },
    { city: 'Vancouver',   zone: 'America/Vancouver', label: 'Pacific Time',      covers: 'British Columbia, Yukon' },
  ],
  australia: [
    { city: 'Sydney',   zone: 'Australia/Sydney',   label: 'Australian Eastern Time',         covers: 'New South Wales, Victoria, Tasmania, ACT' },
    { city: 'Brisbane', zone: 'Australia/Brisbane', label: 'Australian Eastern Time (no DST)', covers: 'Queensland' },
    { city: 'Adelaide', zone: 'Australia/Adelaide', label: 'Australian Central Time',          covers: 'South Australia, Northern Territory' },
    { city: 'Perth',    zone: 'Australia/Perth',    label: 'Australian Western Time',          covers: 'Western Australia' },
  ],
  belgium: [
    { city: 'Brussels', zone: 'Europe/Brussels', label: 'Central European Time', covers: 'Nationwide — single time zone' },
  ],
  netherlands: [
    { city: 'Amsterdam', zone: 'Europe/Amsterdam', label: 'Central European Time', covers: 'Nationwide (European Netherlands)' },
  ],
  germany: [
    { city: 'Berlin', zone: 'Europe/Berlin', label: 'Central European Time', covers: 'Nationwide — single time zone' },
  ],
  uae: [
    { city: 'Dubai', zone: 'Asia/Dubai', label: 'Gulf Standard Time', covers: 'Nationwide — single time zone' },
  ],
  ireland: [
    { city: 'Dublin', zone: 'Europe/Dublin', label: 'Irish Standard Time', covers: 'Nationwide — single time zone' },
  ],
  southkorea: [
    { city: 'Seoul', zone: 'Asia/Seoul', label: 'Korea Standard Time', covers: 'Nationwide — single time zone' },
  ],
};

const COUNTRY_LABELS: Record<Country, string> = {
  usa: 'USA',
  india: 'India',
  canada: 'Canada',
  australia: 'Australia',
  belgium: 'Belgium',
  netherlands: 'Netherlands',
  germany: 'Germany',
  uae: 'UAE',
  ireland: 'Ireland',
  southkorea: 'South Korea',
};

const COUNTRY_FLAGS: Record<Country, string> = {
  usa: '🇺🇸',
  india: '🇮🇳',
  canada: '🇨🇦',
  australia: '🇦🇺',
  belgium: '🇧🇪',
  netherlands: '🇳🇱',
  germany: '🇩🇪',
  uae: '🇦🇪',
  ireland: '🇮🇪',
  southkorea: '🇰🇷',
};

function getZoneParts(now: Date, zone: string): { h: number; m: number; s: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  return { h: get('hour') % 24, m: get('minute'), s: get('second') };
}

// ─── Analog clock face (iOS-style) ─────────────────────────────────────────────
function AnalogClock({ zone, now, size = 72 }: { zone: string; now: Date; size?: number }) {
  const { h, m, s } = getZoneParts(now, zone);
  const hourAngle   = ((h % 12) + m / 60) * 30;
  const minuteAngle = (m + s / 60) * 6;
  const secondAngle = s * 6;
  const cx = 50, cy = 50;

  const hand = (angle: number, length: number, width: number, color: string, opacity = 1) => {
    const rad = (angle - 90) * (Math.PI / 180);
    const x2 = cx + length * Math.cos(rad);
    const y2 = cy + length * Math.sin(rad);
    return <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" opacity={opacity} />;
  };

  const ticks = Array.from({ length: 12 }, (_, i) => {
    const angle = i * 30;
    const rad = (angle - 90) * (Math.PI / 180);
    const outer = 44, inner = i % 3 === 0 ? 36 : 40;
    return (
      <line
        key={i}
        x1={cx + outer * Math.cos(rad)} y1={cy + outer * Math.sin(rad)}
        x2={cx + inner * Math.cos(rad)} y2={cy + inner * Math.sin(rad)}
        stroke="#9ca3af" strokeWidth={i % 3 === 0 ? 2 : 1} strokeLinecap="round"
      />
    );
  });

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="shrink-0">
      <circle cx={cx} cy={cy} r={48} fill="#e9eaee" />
      {ticks}
      <text x={cx} y={20} textAnchor="middle" fontSize="9" fontWeight="600" fill="#3f3f46">XII</text>
      <text x={82} y={cy + 3} textAnchor="middle" fontSize="9" fontWeight="600" fill="#3f3f46">III</text>
      <text x={cx} y={86} textAnchor="middle" fontSize="9" fontWeight="600" fill="#3f3f46">VI</text>
      <text x={18} y={cy + 3} textAnchor="middle" fontSize="9" fontWeight="600" fill="#3f3f46">IX</text>
      {hand(hourAngle, 24, 3.2, '#27272a')}
      {hand(minuteAngle, 34, 2.2, '#27272a')}
      {hand(secondAngle, 36, 1.2, '#ef4444')}
      <circle cx={cx} cy={cy} r={2.4} fill="#ef4444" />
    </svg>
  );
}

// Working-hours awareness — tells a PM whether it's a good time to reach out
function getDayStatus(hour: number): { label: string; color: string } {
  if (hour >= 0 && hour < 6)   return { label: 'Sleeping',      color: '#6b7280' };
  if (hour >= 6 && hour < 9)   return { label: 'Early Morning', color: '#f59e0b' };
  if (hour >= 9 && hour < 18)  return { label: 'Working Hours', color: '#16a34a' };
  if (hour >= 18 && hour < 22) return { label: 'Evening',       color: '#3b82f6' };
  return                              { label: 'Late Night',    color: '#7c3aed' };
}

function offsetFromIST(now: Date, zone: string): number {
  const zoneMs = new Date(now.toLocaleString('en-US', { timeZone: zone })).getTime();
  const istMs  = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getTime();
  return Math.round(((zoneMs - istMs) / 60000) / 30) * 0.5; // round to nearest half hour
}

function ClockCard({ city, zone, label, covers, now }: CityZone & { now: Date }) {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(now);

  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, weekday: 'short', day: 'numeric', month: 'short',
  }).format(now);

  const offset = offsetFromIST(now, zone);
  const offsetLabel = offset === 0
    ? 'Same time as India'
    : `${Math.abs(offset)} hr${Math.abs(offset) === 1 ? '' : 's'} ${offset > 0 ? 'ahead of' : 'behind'} India`;

  const { h } = getZoneParts(now, zone);
  const status = getDayStatus(h);

  return (
    <div className="cn-card rounded-xl p-5" style={{ background: 'var(--cn-bg-card)' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--cn-text-primary)' }}>{city}</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--cn-text-muted)' }}>{label}</p>
        </div>
        <AnalogClock zone={zone} now={now} size={96} />
      </div>
      <p className="text-3xl font-bold tabular-nums tracking-tight" style={{ color: 'var(--cn-text-primary)' }}>
        {time}
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--cn-text-muted)' }}>{date}</p>
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
          style={{
            background: offset === 0 ? 'var(--cn-bg-input)' : '#FE4A2318',
            color: offset === 0 ? 'var(--cn-text-muted)' : '#FE4A23',
          }}>
          {offsetLabel}
        </span>
      </div>
      {covers && (
        <p className="text-[11px] mt-3 pt-3" style={{ color: 'var(--cn-text-muted)', borderTop: '1px solid var(--cn-border-light)' }}>
          <span className="font-semibold" style={{ color: 'var(--cn-text-secondary)' }}>Covers:</span> {covers}
        </p>
      )}
    </div>
  );
}

// ─── Expanded zones for converter (main city + every state/city in covers) ───
interface ZoneEntry { flag: string; country: string; city: string; sublabel: string; zone: string; }

const ALL_ZONES_FLAT: ZoneEntry[] = (Object.keys(COUNTRY_ZONES) as Country[]).flatMap(c =>
  COUNTRY_ZONES[c].flatMap(z => {
    const main: ZoneEntry = {
      flag: COUNTRY_FLAGS[c], country: COUNTRY_LABELS[c],
      city: z.city, sublabel: z.label, zone: z.zone,
    };
    const extras: ZoneEntry[] = z.covers
      ? z.covers.split(',').map(s => s.trim()).filter(s => s && s !== z.city && !z.city.includes(s)).map(place => ({
          flag: COUNTRY_FLAGS[c], country: COUNTRY_LABELS[c],
          city: place, sublabel: z.label, zone: z.zone,
        }))
      : [];
    return [main, ...extras];
  })
);

const INDIA_ZONE = 'Asia/Kolkata';
// India excluded — used for the "World Timezone" picker so it can't
// redundantly select the side the India<->World mode already locks.
const WORLD_ZONES_FLAT: ZoneEntry[] = ALL_ZONES_FLAT.filter(z => z.country !== 'India');

// ─── Custom searchable zone select ───────────────────────────────────────────
// `zones` defaults to every zone, but the India<->World converter passes a
// filtered list (e.g. India excluded) so the "other side" picker can't
// redundantly select the side that's already locked by the chosen mode.
function ZoneSelect({ value, onChange, zones = ALL_ZONES_FLAT }: { value: string; onChange: (zone: string) => void; zones?: ZoneEntry[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = zones.find(z => z.zone === value) ?? zones[0];

  // Grouped by country for the browse (non-search) view
  const zonesByCountry = useMemo(() => {
    const byCountry = new Map<string, { country: string; flag: string; entries: ZoneEntry[] }>();
    zones.forEach(z => {
      if (!byCountry.has(z.country)) byCountry.set(z.country, { country: z.country, flag: z.flag, entries: [] });
      byCountry.get(z.country)!.entries.push(z);
    });
    return [...byCountry.values()];
  }, [zones]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setSearch('');
  }, [open]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? zones.filter(z =>
        z.city.toLowerCase().includes(q) ||
        z.country.toLowerCase().includes(q) ||
        z.sublabel.toLowerCase().includes(q)
      )
    : null;

  return (
    <div ref={ref} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer"
        style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
      >
        <span className="flex items-center gap-2 truncate">
          <span>{selected.flag}</span>
          <span className="font-semibold truncate">{selected.city}</span>
          <span className="truncate" style={{ color: 'var(--cn-text-muted)' }}>— {selected.sublabel}</span>
        </span>
        <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--cn-text-muted)', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl shadow-xl overflow-hidden"
          style={{ background: 'var(--cn-bg-card)', border: '1px solid var(--cn-border)', maxHeight: '340px', display: 'flex', flexDirection: 'column' }}>
          {/* Search inside dropdown */}
          <div className="p-2 border-b" style={{ borderColor: 'var(--cn-border)' }}>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--cn-text-muted)' }} />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search city, state or timezone…"
                className="w-full pl-8 pr-8 py-1.5 rounded-lg text-xs focus:outline-none"
                style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3" style={{ color: 'var(--cn-text-muted)' }} />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {filtered ? (
              filtered.length === 0 ? (
                <p className="px-4 py-3 text-xs" style={{ color: 'var(--cn-text-muted)' }}>No results for &quot;{search}&quot;</p>
              ) : (
                filtered.map((z, i) => (
                  <button key={`${z.zone}-${i}`} type="button"
                    onClick={() => { onChange(z.zone); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs cursor-pointer transition-colors"
                    style={{
                      background: z.zone === value ? 'var(--cn-accent)' : 'transparent',
                      color: z.zone === value ? '#fff' : 'var(--cn-text-primary)',
                    }}
                    onMouseEnter={e => { if (z.zone !== value) (e.currentTarget as HTMLButtonElement).style.background = 'var(--cn-bg-hover)'; }}
                    onMouseLeave={e => { if (z.zone !== value) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  >
                    <span>{z.flag}</span>
                    <span className="font-semibold">{z.city}</span>
                    <span style={{ color: z.zone === value ? '#ffffff99' : 'var(--cn-text-muted)' }}>— {z.sublabel}</span>
                  </button>
                ))
              )
            ) : (
              zonesByCountry.map(group => (
                <div key={group.country}>
                  <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest sticky top-0"
                    style={{ background: 'var(--cn-bg-card)', color: 'var(--cn-text-muted)', borderBottom: '1px solid var(--cn-border)' }}>
                    {group.flag} {group.country}
                  </div>
                  {group.entries.map((z, i) => {
                    const isActive = z.zone === value && z.city === selected.city;
                    return (
                      <button key={`${z.zone}-${i}`} type="button"
                        onClick={() => { onChange(z.zone); setOpen(false); }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs cursor-pointer transition-colors"
                        style={{
                          background: isActive ? 'var(--cn-accent)' : 'transparent',
                          color: isActive ? '#fff' : 'var(--cn-text-primary)',
                        }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--cn-bg-hover)'; }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                      >
                        <span className="font-semibold">{z.city}</span>
                        <span style={{ color: isActive ? '#ffffff99' : 'var(--cn-text-muted)' }}>— {z.sublabel}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Big decorative analog clock for the converter result
function BigStaticClock({ h, m, size = 160, accentColor = '#27272a' }: { h: number; m: number; size?: number; accentColor?: string }) {
  const hourAngle   = ((h % 12) + m / 60) * 30;
  const minuteAngle = m * 6;
  const cx = 50, cy = 50;

  const hand = (angle: number, length: number, width: number, color: string) => {
    const rad = (angle - 90) * (Math.PI / 180);
    return <line x1={cx} y1={cy} x2={cx + length * Math.cos(rad)} y2={cy + length * Math.sin(rad)}
      stroke={color} strokeWidth={width} strokeLinecap="round" />;
  };

  const ticks = Array.from({ length: 60 }, (_, i) => {
    const rad = (i * 6 - 90) * (Math.PI / 180);
    const isHour = i % 5 === 0;
    const outer = 44, inner = isHour ? 34 : 40;
    return <line key={i}
      x1={cx + outer * Math.cos(rad)} y1={cy + outer * Math.sin(rad)}
      x2={cx + inner * Math.cos(rad)} y2={cy + inner * Math.sin(rad)}
      stroke={isHour ? '#6b7280' : '#d1d5db'} strokeWidth={isHour ? 1.8 : 0.8} strokeLinecap="round" />;
  });

  const numerals = [
    { n: 'XII', x: cx,   y: 14  },
    { n: 'III', x: 86,   y: cy + 3.5 },
    { n: 'VI',  x: cx,   y: 90  },
    { n: 'IX',  x: 14,   y: cy + 3.5 },
  ];

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={49} fill="none" stroke="#e5e7eb" strokeWidth="1" />
      {/* Face */}
      <circle cx={cx} cy={cy} r={47} fill="white" />
      {/* Inner subtle ring */}
      <circle cx={cx} cy={cy} r={43} fill="none" stroke="#f3f4f6" strokeWidth="0.5" />
      {ticks}
      {numerals.map(({ n, x, y }) => (
        <text key={n} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
          fontSize="7.5" fontWeight="700" fill="#374151">{n}</text>
      ))}
      {hand(hourAngle,   26, 4,   '#1f2937')}
      {hand(minuteAngle, 36, 2.8, '#374151')}
      {/* Center cap */}
      <circle cx={cx} cy={cy} r={3.5} fill={accentColor} />
      <circle cx={cx} cy={cy} r={1.5} fill="white" />
    </svg>
  );
}

// Returns the UTC offset in minutes for `timeZone` at the instant `date`
// (i.e. wall-clock-in-zone = date + offset). DST-aware and independent of
// the browser's own local timezone — unlike parsing a formatted string back
// through `new Date(...)`, which implicitly reinterprets it as browser-local.
function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return (asUTC - date.getTime()) / 60000;
}

// Resolves a wall-clock date/time that's stated to be IN `timeZone` to the
// true UTC instant it represents (accurate outside DST-transition edge cases).
function zonedWallTimeToUTC(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guessUTC = Date.UTC(year, month - 1, day, hour, minute);
  const offset = zoneOffsetMinutes(new Date(guessUTC), timeZone);
  return new Date(guessUTC - offset * 60000);
}

type ConverterMode = 'india-to-world' | 'world-to-india';

function TimeConverter({ mode, onModeChange, worldZone, onWorldZoneChange, dateTime, onDateTimeChange }: {
  mode: ConverterMode; onModeChange: (m: ConverterMode) => void;
  worldZone: string; onWorldZoneChange: (z: string) => void;
  dateTime: string; onDateTimeChange: (d: string) => void;
}) {
  // India is locked to whichever side the mode says; only the "other side"
  // world timezone is user-selectable — the date/time entered always means
  // the source side's wall-clock time.
  const fromZone = mode === 'india-to-world' ? INDIA_ZONE : worldZone;
  const toZone   = mode === 'india-to-world' ? worldZone : INDIA_ZONE;
  const inputDateTime = dateTime;
  const setInputDateTime = onDateTimeChange;

  const result = useMemo(() => {
    if (!inputDateTime) return null;
    const [datePart, timePart] = inputDateTime.split('T');
    if (!datePart || !timePart) return null;
    const [yStr, moStr, dStr] = datePart.split('-');
    const [hStr, mStr] = timePart.split(':');
    const y  = parseInt(yStr ?? '0', 10);
    const mo = parseInt(moStr ?? '0', 10);
    const d  = parseInt(dStr ?? '0', 10);
    const srcH24 = parseInt(hStr ?? '0', 10);
    const srcM   = parseInt(mStr ?? '0', 10);
    if ([y, mo, d, srcH24, srcM].some(n => isNaN(n))) return null;

    // The datetime-local input's wall-clock time is stated to be IN
    // fromZone — resolve it to the real UTC instant it represents, then
    // format that single instant natively in both zones. (Previously this
    // parsed the input as browser-local time and re-formatted with an
    // explicit target timeZone, double-applying the offset — it only
    // "worked" when the viewer's browser zone happened to match whichever
    // zone was being displayed.)
    const trueInstant = zonedWallTimeToUTC(y, mo, d, srcH24, srcM, fromZone);

    // Target h/m for clock hands
    const toParts = new Intl.DateTimeFormat('en-US', {
      timeZone: toZone, hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(trueInstant);
    const toH = Number(toParts.find(p => p.type === 'hour')?.value ?? 0) % 24;
    const toM = Number(toParts.find(p => p.type === 'minute')?.value ?? 0);

    const toTime = new Intl.DateTimeFormat('en-US', {
      timeZone: toZone, hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(trueInstant);
    const toDateStr = new Intl.DateTimeFormat('en-US', {
      timeZone: toZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    }).format(trueInstant);

    // Source display — same true instant, formatted back in fromZone
    // (round-trips exactly to what was typed)
    const srcTime = new Intl.DateTimeFormat('en-US', {
      timeZone: fromZone, hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(trueInstant);
    const srcDateStr = new Intl.DateTimeFormat('en-US', {
      timeZone: fromZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    }).format(trueInstant);

    const toStatus = getDayStatus(toH);
    const srcStatus = getDayStatus(srcH24);

    const srcEntry = ALL_ZONES_FLAT.find(z => z.zone === fromZone);
    const srcCity     = srcEntry?.city ?? 'Source';
    const srcSubLabel = srcEntry?.sublabel ?? fromZone;
    const srcFlag     = srcEntry?.flag ?? '🌍';

    const toEntry = ALL_ZONES_FLAT.find(z => z.zone === toZone);
    const toCity     = toEntry?.city ?? 'Target';
    const toSubLabel = toEntry?.sublabel ?? toZone;
    const toFlag      = toEntry?.flag ?? '🌍';

    // offset label — computed at the actual selected instant, so it's
    // correct even when from/to observe DST differently at that date
    const diffMin = Math.round(zoneOffsetMinutes(trueInstant, toZone) - zoneOffsetMinutes(trueInstant, fromZone));
    const diffH = Math.floor(Math.abs(diffMin) / 60);
    const diffM = Math.abs(diffMin) % 60;
    const offsetLabel = diffMin === 0 ? 'Same time as source'
      : `${diffH > 0 ? `${diffH}h ` : ''}${diffM > 0 ? `${diffM}m ` : ''}${diffMin > 0 ? 'ahead of source' : 'behind source'}`;

    return { srcH24, srcM, srcTime, srcDateStr, srcCity, srcSubLabel, srcFlag, srcStatus,
             toH, toM, toTime, toDateStr, toStatus, toCity, toSubLabel, toFlag, offsetLabel };
  }, [inputDateTime, fromZone, toZone]);

  return (
    <div className="cn-card rounded-xl p-5 mt-2" style={{ background: 'var(--cn-bg-card)', border: '1px solid var(--cn-border)' }}>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4" style={{ color: 'var(--cn-accent)' }} />
          <h3 className="text-sm font-bold" style={{ color: 'var(--cn-text-primary)' }}>Time Converter</h3>
        </div>

        {/* Mode toggle — which side the typed date/time belongs to */}
        <div className="flex items-center gap-1.5">
          {([
            ['india-to-world', '🇮🇳 India to World'],
            ['world-to-india', '🌍 World to India'],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer"
              style={{
                background: mode === m ? 'var(--cn-accent)' : 'var(--cn-bg-input)',
                color: mode === m ? '#fff' : 'var(--cn-text-muted)',
                border: `1px solid ${mode === m ? 'var(--cn-accent)' : 'var(--cn-border)'}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end flex-wrap">
        {/* World-side timezone — India is fixed by the mode above */}
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--cn-text-muted)' }}>World Timezone</label>
          <ZoneSelect value={worldZone} onChange={onWorldZoneChange} zones={WORLD_ZONES_FLAT} />
        </div>

        {/* Date & Time input — always means the source side's wall-clock time */}
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--cn-text-muted)' }}>
            {mode === 'india-to-world' ? 'India Date & Time' : 'World Date & Time'}
          </label>
          <input
            type="datetime-local"
            value={inputDateTime}
            onChange={e => setInputDateTime(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)', minWidth: '200px' }}
          />
        </div>
      </div>

      {/* Dual clock result */}
      {result ? (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-center">

          {/* Source clock */}
          <div className="rounded-2xl p-6 flex flex-col items-center text-center"
            style={{ background: 'var(--cn-bg-page)', border: '1px solid var(--cn-border)' }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">{result.srcFlag}</span>
              <div className="text-left">
                <p className="text-sm font-bold leading-tight" style={{ color: 'var(--cn-text-primary)' }}>{result.srcCity}</p>
                <p className="text-[11px]" style={{ color: 'var(--cn-text-muted)' }}>{result.srcSubLabel}</p>
              </div>
            </div>
            <BigStaticClock h={result.srcH24} m={result.srcM} size={180} accentColor="#6b7280" />
            <p className="text-3xl font-bold tabular-nums tracking-tight mt-4" style={{ color: 'var(--cn-text-primary)' }}>{result.srcTime}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--cn-text-muted)' }}>{result.srcDateStr}</p>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full mt-3"
              style={{ background: `${result.srcStatus.color}18`, color: result.srcStatus.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: result.srcStatus.color }} />
              {result.srcStatus.label}
            </span>
          </div>

          {/* Arrow connector */}
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-md"
              style={{ background: 'var(--cn-accent)' }}>
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            <span className="text-[10px] font-bold text-center px-2 py-1 rounded-lg"
              style={{ background: '#FE4A2318', color: '#FE4A23', maxWidth: '90px', lineHeight: '1.4' }}>
              {result.offsetLabel}
            </span>
          </div>

          {/* Target clock */}
          <div className="rounded-2xl p-6 flex flex-col items-center text-center"
            style={{ background: '#FE4A2308', border: '2px solid #FE4A2340' }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">{result.toFlag}</span>
              <div className="text-left">
                <p className="text-sm font-bold leading-tight" style={{ color: 'var(--cn-text-primary)' }}>{result.toCity}</p>
                <p className="text-[11px]" style={{ color: 'var(--cn-text-muted)' }}>{result.toSubLabel}</p>
              </div>
            </div>
            <BigStaticClock h={result.toH} m={result.toM} size={180} accentColor="#FE4A23" />
            <p className="text-3xl font-bold tabular-nums tracking-tight mt-4" style={{ color: '#FE4A23' }}>{result.toTime}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--cn-text-muted)' }}>{result.toDateStr}</p>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1 rounded-full mt-3"
              style={{ background: `${result.toStatus.color}18`, color: result.toStatus.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: result.toStatus.color }} />
              {result.toStatus.label}
            </span>
          </div>

        </div>
      ) : (
        <div className="mt-6 rounded-2xl p-10 flex flex-col items-center gap-3 text-center"
          style={{ background: 'var(--cn-bg-page)', border: '2px dashed var(--cn-border)' }}>
          <ArrowRightLeft className="w-8 h-8" style={{ color: 'var(--cn-text-faint)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--cn-text-muted)' }}>Select a timezone, date &amp; time above</p>
          <p className="text-xs" style={{ color: 'var(--cn-text-faint)' }}>Both clocks will appear here side by side</p>
        </div>
      )}
    </div>
  );
}

type ClockTab = 'clocks' | 'converter';

export default function ClockRoom() {
  const [tab, setTab] = useState<ClockTab>('clocks');
  const [country, setCountry] = useState<Country>('usa');
  const [now, setNow] = useState(new Date());
  const [search, setSearch] = useState('');
  // Converter state lifted here so it survives tab switches
  const [converterMode, setConverterMode] = useState<ConverterMode>('india-to-world');
  const [converterWorldZone, setConverterWorldZone] = useState(WORLD_ZONES_FLAT[0].zone);
  const [converterDateTime, setConverterDateTime] = useState('');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const zones = COUNTRY_ZONES[country];

  const allZones = (Object.keys(COUNTRY_ZONES) as Country[]).flatMap(c =>
    COUNTRY_ZONES[c].map(z => ({ ...z, country: COUNTRY_LABELS[c] }))
  );
  const query = search.trim().toLowerCase();
  const searchResults = query
    ? allZones.filter(z =>
        z.city.toLowerCase().includes(query) ||
        z.country.toLowerCase().includes(query) ||
        z.label.toLowerCase().includes(query) ||
        (z.covers ?? '').toLowerCase().includes(query)
      )
    : [];

  const TABS: { id: ClockTab; label: string }[] = [
    { id: 'clocks',    label: 'World Clocks' },
    { id: 'converter', label: 'Timezone Converter' },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center justify-end gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-3 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer"
            style={{
              background: tab === t.id ? 'var(--cn-accent)' : 'var(--cn-bg-input)',
              color: tab === t.id ? '#fff' : 'var(--cn-text-muted)',
              border: `1px solid ${tab === t.id ? 'var(--cn-accent)' : 'var(--cn-border)'}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Timezone Converter tab — always mounted to preserve state */}
      <div style={{ display: tab === 'converter' ? 'block' : 'none' }}>
        <TimeConverter
          mode={converterMode} onModeChange={setConverterMode}
          worldZone={converterWorldZone} onWorldZoneChange={setConverterWorldZone}
          dateTime={converterDateTime} onDateTimeChange={setConverterDateTime}
        />
      </div>

      {/* Clock Room tab */}
      {tab === 'clocks' && (<>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--cn-text-muted)' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search any city or country (e.g. London, Tokyo, Singapore)..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm focus:outline-none"
          style={{ background: 'var(--cn-bg-input)', color: 'var(--cn-text-primary)', border: '1px solid var(--cn-border)' }}
        />
      </div>

      {query && (
        searchResults.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {searchResults.map(z => (
              <ClockCard key={z.zone} {...z} now={now} />
            ))}
          </div>
        ) : (
          <div className="cn-card rounded-xl p-5 flex items-center gap-3" style={{ background: 'var(--cn-bg-card)' }}>
            <MapPinOff className="w-5 h-5 shrink-0" style={{ color: 'var(--cn-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--cn-text-muted)' }}>
              <span style={{ color: 'var(--cn-text-primary)' }} className="font-semibold">&quot;{search}&quot;</span>&nbsp;isn&apos;t available yet — please ask the admin to add this location to the Clock Room panel.
            </p>
          </div>
        )
      )}

      {!query && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            {(Object.keys(COUNTRY_ZONES) as Country[]).map(c => (
              <button
                key={c}
                onClick={() => setCountry(c)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer"
                style={{
                  background: country === c ? 'var(--cn-accent)' : 'var(--cn-bg-input)',
                  color: country === c ? '#fff' : 'var(--cn-text-muted)',
                  border: `1px solid ${country === c ? 'var(--cn-accent)' : 'var(--cn-border)'}`,
                }}
              >
                <span>{COUNTRY_FLAGS[c]}</span>
                {COUNTRY_LABELS[c]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--cn-text-muted)' }}>
            <Globe2 className="w-3.5 h-3.5" />
            <span>All times update live. Offsets are shown relative to India (IST).</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {zones.map(z => (
              <ClockCard key={z.zone} {...z} now={now} />
            ))}
          </div>
        </>
      )}
      </>)}

    </div>
  );
}
