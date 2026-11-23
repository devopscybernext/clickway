import { test, expect } from '@playwright/test';
import { DAILY_HOURS, RETAINER_HOURS, PM_MONTHLY_HOURS, HALF_DAY_HOURS, workloadBandForPct } from '../lib/capacity';
import { periodCapacity, dailyEquivalent, periodInfo } from '../lib/period';

// The capacities and the colour of the workload percentage. Above 100% dark green, 75-100% green, 50-74% orange,
// 25-49% yellow, 0-24% red.

test('capacities: Web and SMM 8 h a day, PPC and SEO 160 h a month, Project Managers 300 h a month', () => {
  expect([DAILY_HOURS, RETAINER_HOURS, PM_MONTHLY_HOURS, HALF_DAY_HOURS]).toEqual([8, 160, 300, 4]);
  const noon = new Date(2026, 10, 18, 12).getTime();          // November 2026: 21 working days
  const today = periodInfo('today', noon, 'dmy'), weekly = periodInfo('weekly', noon, 'dmy'), monthly = periodInfo('monthly', noon, 'dmy');
  expect(monthly.workingDays).toBe(21);
  expect([periodCapacity(today, false), periodCapacity(weekly, false), periodCapacity(monthly, false)]).toEqual([8, 40, 168]);
  expect([periodCapacity(today, true), periodCapacity(weekly, true), periodCapacity(monthly, true)]).toEqual([160, (160 * 5) / 21, 160]);
  // a longer period reads as the same day: half the capacity used is 4 h on a day, whatever the period
  expect(dailyEquivalent(weekly, false, 20)).toBeCloseTo(4);
  expect(dailyEquivalent(monthly, false, 84)).toBeCloseTo(4);
  expect(dailyEquivalent(monthly, true, 80)).toBeCloseTo(80);
});

test('the colour of the percentage: the band edges', () => {
  const dark = '#166534', green = '#22c55e', orange = '#f97316', yellow = '#eab308', red = '#dc2626';
  const cases: [number, string, string][] = [
    [0, red, 'Available'], [24, red, 'Available'],
    [25, yellow, 'Partially Available'], [49, yellow, 'Partially Available'],
    [50, orange, 'Partially Occupied'], [74, orange, 'Partially Occupied'],
    [75, green, 'Occupied'], [100, green, 'Occupied'],
    [101, dark, 'Overload'], [250, dark, 'Overload'],
  ];
  for (const [pct, color, label] of cases) {
    const band = workloadBandForPct(pct);
    expect(band.color, `${pct}%`).toBe(color);
    expect(band.label, `${pct}%`).toBe(label);
  }
});
