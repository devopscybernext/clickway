'use client';

import { useState } from 'react';
import { BarChart3, Users, Layers, Menu, X, UsersRound, CalendarDays, ClipboardPlus, Trophy, ListChecks, LayoutDashboard, BarChart2, Wrench, Briefcase } from 'lucide-react';
import { AuthUser, SheetId, getSheetLabel } from '@/lib/auth';
import { memberPhoto } from '@/lib/memberColors';

interface SidebarProps {
  selectedSheet: SheetId;
  allowedSheets: SheetId[];
  user: AuthUser;
  onSheetChange: (sheet: SheetId) => void;
  onLogout: () => void;
  isAdmin?: boolean;
}

const NAV_ICONS: Record<SheetId, React.ReactNode> = {
  '1': <Layers        className="w-4 h-4 shrink-0" />,
  '2': <Users         className="w-4 h-4 shrink-0" />,
  '3': <BarChart3     className="w-4 h-4 shrink-0" />,
  '4': <UsersRound    className="w-4 h-4 shrink-0" />,
  '5': <CalendarDays  className="w-4 h-4 shrink-0" />,
  '6': <ClipboardPlus className="w-4 h-4 shrink-0" />,
  '7': <Trophy           className="w-4 h-4 shrink-0" />,
  '8': <ListChecks       className="w-4 h-4 shrink-0" />,
  '9': <LayoutDashboard  className="w-4 h-4 shrink-0" />,
  '10': <BarChart2       className="w-4 h-4 shrink-0" />,
  '11': <Briefcase       className="w-4 h-4 shrink-0" />,
  '14': <Wrench          className="w-4 h-4 shrink-0" />,
};

const ROLE_LABELS: Record<string, string> = {
  akash: 'Admin', admin: 'Admin', high: 'Admin', mod: 'Admin',
  pm: 'Project Manager', resource: 'Resource',
};

const USER_DESIGNATIONS: Record<string, string> = {
  akash:     'Senior UI/UX Designer',
  kiran:     'Project Manager',
  lovepreet: 'Web Designer',
  manpreet:  'Web Designer',
  shubham:   'Web Designer',
  dhruv:     'CMS Developer',
  pawan:     'Web Developer - Team Lead',
  vinay:     'QA Analyst',
  robin:     'Web Designer',
};

function getUserDesignation(username: string, role: string): string {
  const key = Object.keys(USER_DESIGNATIONS).find(k => username.toLowerCase().includes(k));
  if (key) return USER_DESIGNATIONS[key];
  return ROLE_LABELS[role] ?? role;
}

export default function Sidebar({ selectedSheet, allowedSheets, user, onSheetChange, isAdmin }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (
    <>
      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--cn-border)' }}>
        <div className="flex items-center gap-2.5">
          <svg
            viewBox="0 0 2621 542"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ height: 18, width: 'auto', color: 'var(--cn-text-primary)' }}
          >
            <path d="M0.0323239 294.4C0.015884 313.887 3.84193 333.185 11.2915 351.192C18.7412 369.198 29.6681 385.559 43.4473 399.338C57.2264 413.117 73.5872 424.044 91.5937 431.494C109.6 438.943 128.899 442.769 148.385 442.753C197.836 442.753 239.142 418.9 264.74 381.085L232.74 356.069C210.051 386.322 182.126 401.448 148.964 401.448C90.2053 401.448 45.9903 353.742 45.9903 294.401C45.9903 235.642 90.2053 187.936 148.964 187.936C182.125 187.936 210.632 203.062 233.322 233.896L265.322 208.296C239.722 170.48 197.836 146.628 148.385 146.628C67.5183 145.465 -1.71368 213.533 0.0323239 294.4Z" fill="currentColor"/>
            <path d="M546.63 146.615L452.955 372.355L359.284 146.615H310.994L428.524 421.227L413.397 454.972C398.852 489.298 379.07 500.353 349.397 500.353C341.252 500.353 329.616 499.189 315.071 497.444V535.261C329.281 539.192 343.963 541.15 358.706 541.079C402.341 541.079 433.177 518.97 454.706 469.517L594.339 146.617L546.63 146.615Z" fill="currentColor"/>
            <path d="M2380.29 442.753L2269.01 288.299L2371.77 146.614H2317.66L2241.64 255.462L2166.24 146.614H2112.12L2213.06 288.299L2103 442.753H2157.73L2241.64 321.135L2326.17 442.753H2380.29Z" fill="currentColor"/>
            <path d="M2620.16 397.628C2605.31 400.003 2592.84 401.191 2581.56 401.191C2541.78 401.191 2520.41 386.941 2520.41 345.972V188.033H2610.66V147.06H2520.41V68.0909H2474.69V147.06H2426V188.029H2474.69V348.94C2474.69 412.472 2512.09 442.753 2572.06 442.753C2585.72 442.753 2601.75 440.378 2620.16 436.222V397.628Z" fill="currentColor"/>
            <path d="M2053.54 308.357C2055.82 297.253 2056.99 285.948 2057.03 274.612C2057.03 199.559 2001.18 146.612 1927.87 146.612C1847 146.612 1783 212.938 1783 294.972C1783 378.172 1848.74 442.751 1933.1 442.751C1977.9 442.751 2016.89 424.133 2046.56 393.298L2020.38 363.044C1994.78 388.644 1965.69 401.444 1933.69 401.444C1877.83 401.444 1834.78 364.208 1829.54 308.355L2053.54 308.357ZM1831.29 268.794C1841.18 219.922 1879.58 187.341 1926.71 187.341C1973.83 187.341 2010.49 218.177 2011.07 268.794H1831.29Z" fill="currentColor"/>
            <path d="M1245.54 308.357C1247.82 297.253 1248.99 285.948 1249.03 274.612C1249.03 199.559 1193.18 146.612 1119.87 146.612C1039 146.612 974.999 212.938 974.999 294.972C974.999 378.172 1040.74 442.751 1125.1 442.751C1169.9 442.751 1208.89 424.133 1238.56 393.298L1212.38 363.044C1186.78 388.644 1157.69 401.444 1125.69 401.444C1069.83 401.444 1026.78 364.208 1021.54 308.355L1245.54 308.357ZM1023.29 268.794C1033.18 219.922 1071.58 187.341 1118.71 187.341C1165.83 187.341 1202.49 218.177 1203.07 268.794H1023.29Z" fill="currentColor"/>
            <path d="M1736.65 260.789C1736.65 192.404 1696.21 146.615 1629.01 146.615C1592.74 146.615 1561.22 160.292 1539.81 184.078V153.156H1497V442.756H1542.79V266.141C1542.79 220.947 1574.3 188.836 1618.9 188.836C1663.5 188.836 1690.86 220.353 1690.86 266.141V442.754H1736.64L1736.65 260.789Z" fill="currentColor"/>
            <path d="M1451.21 149.027C1444.09 147.396 1436.81 146.586 1429.5 146.614C1393.91 146.614 1359.54 162.296 1338.43 190.643V149.027H1295V442.753H1341.44V276.288C1341.44 222.006 1384.26 190.04 1433.72 190.04H1451.21V149.027Z" fill="currentColor"/>
            <path d="M929.156 294.975C929.156 211.775 868.648 146.615 788.941 146.615C746.469 146.615 707.488 164.651 684.798 194.323V0H639.998V442.354H681.888V391.554C703.415 423.554 745.305 442.754 789.522 442.754C869.23 442.754 929.156 378.173 929.156 294.975ZM883.193 294.393C883.193 355.483 840.139 401.445 782.541 401.445C731.924 401.445 684.216 366.537 684.216 294.975C684.216 222.831 730.179 187.923 782.541 187.923C840.14 187.923 883.194 233.3 883.194 294.393H883.193Z" fill="currentColor"/>
          </svg>
        </div>
      </div>


      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--cn-text-faint)' }}>
          Navigation
        </p>
        {allowedSheets.map(id => {
          const active = selectedSheet === id;
          return (
            <button
              key={id}
              onClick={() => { onSheetChange(id); setMobileOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left cursor-pointer"
              style={{
                background: active ? 'var(--cn-bg-hover)' : 'transparent',
                color:      active ? 'var(--cn-text-primary)' : 'var(--cn-text-muted)',
                fontWeight: active ? '600' : '400',
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--cn-bg-input)';
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <span style={{ color: active ? 'var(--cn-accent)' : 'var(--cn-text-muted)' }}>
                {NAV_ICONS[id]}
              </span>
              <span>{getSheetLabel(id, user.role)}</span>
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--cn-accent)' }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Bottom: user info ─────────────────────────────────────────────── */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid var(--cn-border)' }}>
        <div
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
          style={{ background: 'var(--cn-bg-input)' }}
        >
          {memberPhoto(user.displayName) ? (
            <img src={memberPhoto(user.displayName)} alt={user.displayName} className="w-7 h-7 rounded-full object-cover shrink-0"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ background: 'var(--cn-accent)' }}
            >
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: 'var(--cn-text-primary)' }}>
              {user.displayName}
            </p>
            <p className="text-[10px] truncate" style={{ color: 'var(--cn-text-muted)' }}>
              {getUserDesignation(user.username, user.role)}
            </p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg border cursor-pointer"
        style={{ background: 'var(--cn-bg-card)', borderColor: 'var(--cn-border)', color: 'var(--cn-text-primary)' }}
        onClick={() => setMobileOpen(o => !o)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`lg:hidden fixed top-0 left-0 h-full z-40 w-64 flex flex-col transition-transform duration-300 border-r ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: 'var(--cn-bg-sidebar)', borderColor: 'var(--cn-border)' }}
      >
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col w-56 xl:w-60 shrink-0 sticky top-0 h-screen border-r"
        style={{ background: 'var(--cn-bg-sidebar)', borderColor: 'var(--cn-border)' }}
      >
        {navContent}
      </aside>
    </>
  );
}
