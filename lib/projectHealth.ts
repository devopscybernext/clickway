// Project Health — the PM Projects rows for the current month, one health
// reading per project: hours used against the project's total, how much of the
// month has gone, the target end date, follow-ups and any at-risk hours. Grouped
// by the PM who owns the project.

import type { DocCell, DocSection, DocTable, ReportDoc, Tone } from './reportDoc';
import { byRoster, plural } from './reportDoc';
import { fmtDuration, parseSheetDate } from './productivity';
import { timeToMinutes } from './copyTotals';
import { PM_BANDWIDTH_SHEET_ID } from './config';
import { isFlaggedStatus } from './statusFlags';
import { daysBetween, fmtDate, isoDate, startOfDay } from './reportTasks';

export interface HealthIssue { text: string; tone: 'bad' | 'warn' }
export interface HealthProject {
  pm: string;
  project: string;
  client: string;
  dept: string;
  status: string;
  phase: string;
  payment: string;
  totalMin: number;
  usedMin: number;
  riskMin: number;
  usedPct: number | null;
  target: Date | null;
  targetRaw: string;
  followUpDays: number | null;
  done: boolean;
  issues: HealthIssue[];
  health: Tone;
}

const FOLLOWUP_DAYS = 7;
const BURN_GAP = 25;

export const departmentsOf = (rows: Record<string, unknown>[], headers: string[]): string[] => {
  const col = headers.find(h => h.trim().toLowerCase() === 'department');
  if (!col) return [];
  return [...new Set(rows.map(r => String(r[col] ?? '').trim()).filter(Boolean))].sort();
};

export function buildHealth(
  rows: Record<string, unknown>[],
  headers: string[],
  opts: { dept: string | null; pms: Set<string> | null; today: Date },
): HealthProject[] {
  const col = (name: string) => headers.find(h => h.trim().toLowerCase() === name);
  const c = {
    project: col('project name'), client: col('client name'), dept: col('department'), status: col('status'), phase: col('phase'),
    payment: col('payment status'), total: col('total hours'), used: col('ac hours'), risk: col('risk month hours'),
    target: col('target end date'), follow: col('last (project) follow-up date'),
  };
  const today = startOfDay(opts.today);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const elapsedPct = Math.round((today.getDate() / daysInMonth) * 100);
  const str = (r: Record<string, unknown>, k?: string) => (k ? String(r[k] ?? '').trim() : '');
  const mins = (r: Record<string, unknown>, k?: string) => (k && /^\s*\d/.test(str(r, k)) ? timeToMinutes(str(r, k)) : 0);

  const out: HealthProject[] = [];
  for (const r of rows) {
    if (r['__sheetId'] !== PM_BANDWIDTH_SHEET_ID) continue; // current month only
    const project = str(r, c.project);
    if (!project) continue;
    const pm = String(r['__pm'] ?? '').trim() || 'Unassigned';
    const dept = str(r, c.dept);
    if (opts.dept && dept.toLowerCase() !== opts.dept.toLowerCase()) continue;
    if (opts.pms && !opts.pms.has(pm)) continue;

    const status = str(r, c.status);
    const sl = status.toLowerCase();
    const done = sl.includes('completed') || sl.startsWith('closed');
    const totalMin = mins(r, c.total), usedMin = mins(r, c.used), riskMin = mins(r, c.risk);
    const usedPct = totalMin > 0 ? Math.round((usedMin / totalMin) * 100) : null;
    const targetRaw = str(r, c.target);
    const target = targetRaw ? parseSheetDate(targetRaw, 'mdy') : null;
    const daysLeft = target ? daysBetween(today, target) : null;
    const followRaw = str(r, c.follow);
    const follow = followRaw ? parseSheetDate(followRaw, 'mdy') : null;
    const followUpDays = follow ? daysBetween(follow, today) : null;

    const issues: HealthIssue[] = [];
    if (sl === 'escalated') issues.push({ text: 'Escalated', tone: 'bad' });
    else if (!done && isFlaggedStatus(status)) issues.push({ text: status, tone: 'warn' });
    if (totalMin > 0 && usedMin > totalMin) issues.push({ text: `Used ${fmtDuration(usedMin - totalMin)} more than the total hours`, tone: 'bad' });
    else if (usedPct !== null && usedMin > 0 && !done && usedPct - elapsedPct >= BURN_GAP) issues.push({ text: `${usedPct}% of hours used, ${elapsedPct}% of the month gone`, tone: 'warn' });
    if (!done && daysLeft !== null) {
      if (daysLeft < 0) issues.push({ text: `Target end date passed ${plural(-daysLeft, 'day')} ago`, tone: 'bad' });
      else if (daysLeft <= 7) issues.push({ text: daysLeft === 0 ? 'Ends today' : `Ends in ${plural(daysLeft, 'day')}`, tone: 'warn' });
    }
    if (!done && (followUpDays === null || followUpDays > FOLLOWUP_DAYS)) issues.push({ text: followUpDays === null ? 'No follow-up recorded' : `Follow-up due (${plural(followUpDays, 'day')} ago)`, tone: 'warn' });
    if (riskMin > 0) issues.push({ text: `${fmtDuration(riskMin)} at risk`, tone: 'warn' });

    out.push({
      pm, project, client: str(r, c.client), dept, status, phase: str(r, c.phase), payment: str(r, c.payment),
      totalMin, usedMin, riskMin, usedPct, target, targetRaw, followUpDays, done, issues,
      health: issues.some(i => i.tone === 'bad') ? 'bad' : issues.length ? 'warn' : 'good',
    });
  }
  return out;
}

const rank: Record<Tone, number> = { bad: 0, warn: 1, neutral: 2, good: 3 };
const healthLabel = (t: Tone) => (t === 'bad' ? 'Needs action' : t === 'warn' ? 'Keep an eye' : 'Healthy');

export function buildHealthDoc(projects: HealthProject[], ctx: { dept: string | null; today: Date }): ReportDoc {
  const pms = [...new Set(projects.map(p => p.pm))].sort(byRoster([]));
  const bad = projects.filter(p => p.health === 'bad').length;
  const warn = projects.filter(p => p.health === 'warn').length;
  const totalAll = projects.reduce((s, p) => s + p.totalMin, 0);
  const usedAll = projects.reduce((s, p) => s + p.usedMin, 0);
  const followDue = (list: HealthProject[]) => list.filter(p => !p.done && (p.followUpDays === null || p.followUpDays > FOLLOWUP_DAYS)).length;

  const issueCell = (p: HealthProject): DocCell => ({ text: p.issues.length ? p.issues.map(i => i.text).join('; ') : 'Healthy', tone: p.health });

  const summary: DocTable = {
    head: ['PROJECT MANAGER', 'PROJECTS', 'TOTAL HOURS', 'HOURS USED', 'USED', 'NEEDS ACTION', 'KEEP AN EYE', 'FOLLOW-UPS DUE', 'STATUS'],
    rows: pms.map(pm => {
      const list = projects.filter(p => p.pm === pm);
      const tot = list.reduce((s, p) => s + p.totalMin, 0), used = list.reduce((s, p) => s + p.usedMin, 0);
      const worst: Tone = list.some(p => p.health === 'bad') ? 'bad' : list.some(p => p.health === 'warn') ? 'warn' : 'good';
      const usedPct = tot > 0 ? Math.round((used / tot) * 100) : 0;
      return [
        { text: pm, bold: true }, String(list.length), fmtDuration(tot), fmtDuration(used),
        { text: `${usedPct}%`, bar: { pct: usedPct, tone: usedPct > 100 ? 'bad' as Tone : 'good' as Tone } },
        list.filter(p => p.health === 'bad').length ? { text: String(list.filter(p => p.health === 'bad').length), tone: 'bad' as Tone } : '0',
        list.filter(p => p.health === 'warn').length ? { text: String(list.filter(p => p.health === 'warn').length), tone: 'warn' as Tone } : '0',
        String(followDue(list)),
        { text: healthLabel(worst), tone: worst },
      ];
    }),
    widths: [40, 22, 28, 28, 36, 26, 26, 28, 34],
  };

  const urgent = projects.filter(p => p.health === 'bad').slice(0, 12);
  const extras: DocTable[] = urgent.length ? [{
    title: 'Projects that need action',
    head: ['PROJECT MANAGER', 'PROJECT', 'CLIENT', 'STATUS', 'WHY'],
    rows: urgent.map(p => [{ text: p.pm, bold: true }, p.project, p.client || '-', p.status || '-', { text: p.issues.map(i => i.text).join('; '), tone: 'bad' as Tone }]),
    widths: [34, 50, 34, 30, 100],
  }] : [];

  const sections: DocSection[] = pms.map(pm => {
    const list = projects.filter(p => p.pm === pm).sort((a, b) => rank[a.health] - rank[b.health] || a.project.localeCompare(b.project));
    const worst: Tone = list.some(p => p.health === 'bad') ? 'bad' : list.some(p => p.health === 'warn') ? 'warn' : 'good';
    const tot = list.reduce((s, p) => s + p.totalMin, 0), used = list.reduce((s, p) => s + p.usedMin, 0);
    return {
      title: pm,
      verdict: { label: healthLabel(worst), tone: worst },
      facts: [plural(list.length, 'project'), `Total ${fmtDuration(tot)}`, `Used ${fmtDuration(used)}`, `${list.filter(p => p.health === 'bad').length} need action`, `${list.filter(p => p.health === 'warn').length} to watch`],
      tables: [{
        head: ['#', 'PROJECT', 'CLIENT', 'DEPT', 'STATUS', 'TOTAL', 'USED', 'USED %', 'TARGET END', 'PAYMENT', 'HEALTH'],
        rows: list.map((p, i) => [
          String(i + 1), { text: p.project, bold: true }, p.client || '-', p.dept || '-', p.status || '-',
          p.totalMin ? fmtDuration(p.totalMin) : '-', p.usedMin ? fmtDuration(p.usedMin) : '-',
          p.usedPct === null ? '-' : { text: `${p.usedPct}%`, tone: p.usedPct > 100 ? 'bad' as Tone : 'neutral' as Tone },
          p.target ? fmtDate(p.target, p.targetRaw) : p.targetRaw || '-', p.payment || '-', issueCell(p),
        ]),
        widths: [8, 36, 28, 20, 26, 20, 20, 18, 26, 26, 64],
      }],
    };
  });

  return {
    unit: 'project manager',
    eyebrow: `PROJECT HEALTH${ctx.dept ? `  |  ${ctx.dept.toUpperCase()}` : ''}`,
    title: 'Project Health',
    rangeLabel: `Current month  |  as of ${ctx.today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    stats: [
      { label: 'Projects', value: String(projects.length) },
      { label: 'Needs action', value: String(bad) },
      { label: 'Keep an eye', value: String(warn) },
      { label: 'Hours used', value: totalAll ? `${fmtDuration(usedAll)} of ${fmtDuration(totalAll)}` : '-' },
    ],
    summary,
    legend: [
      'Hours used = AC Hours against Total Hours. Red: escalated, over the total hours, or past the target end date. Amber: paused or on hold, hours used well ahead of the month, ending within 7 days, no follow-up for over 7 days, or hours at risk.',
      'Completed and closed projects are not flagged for dates or follow-ups. Payment status is shown but does not change the health.',
    ],
    extras,
    sections,
    fileName: `Project-Health${ctx.dept ? `-${ctx.dept}` : ''}-${isoDate(ctx.today)}`,
  };
}
