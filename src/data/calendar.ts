// Work calendar from company.json (same rules as scripts/gen-data/lib.mjs).
import companyJson from '../../config/company.json';
import { DAY, HOUR, formatDate, parseTime, startOfDay } from './time';

const holidays = new Set(companyJson.shifts.holidays);
const patternOf = new Map(companyJson.sites.map((s) => [s.id, s.shiftPattern as '3shift' | '2shift']));

export const isWorkday = (t: number): boolean => {
  const d = new Date(t);
  const dow = d.getUTCDay();
  if (holidays.has(formatDate(t)) || dow === 0) return false;
  if (dow === 6) {
    const nth = Math.floor((d.getUTCDate() - 1) / 7) + 1;
    return nth === 1 || nth === 3;
  }
  return true;
};

export interface ShiftWindow {
  id: string;
  name: string;
  start: number;
  end: number;
}

export const shiftsOn = (siteId: string, day: number): ShiftWindow[] =>
  companyJson.shifts[patternOf.get(siteId) ?? '3shift'].map((s) => {
    const start = day + (parseTime(`2000-01-01T${s.from}`) - parseTime('2000-01-01'));
    let end = day + (parseTime(`2000-01-01T${s.to}`) - parseTime('2000-01-01'));
    if (end <= start) end += DAY;
    return { id: s.id, name: s.name, start, end };
  });

/** Whether a scheduled shift covers time t at the site. */
export const inShift = (siteId: string, t: number): boolean => {
  for (const day of [startOfDay(t), startOfDay(t) - DAY]) {
    if (!isWorkday(day)) continue;
    if (shiftsOn(siteId, day).some((s) => t >= s.start && t < s.end)) return true;
  }
  return false;
};

/** The shift running at time t, if any. */
export const shiftAt = (siteId: string, t: number): (ShiftWindow & { day: number }) | null => {
  for (const day of [startOfDay(t), startOfDay(t) - DAY]) {
    if (!isWorkday(day)) continue;
    const s = shiftsOn(siteId, day).find((x) => t >= x.start && t < x.end);
    if (s) return { ...s, day };
  }
  return null;
};

export const hourIsProduction = (siteId: string, hourStart: number): boolean => inShift(siteId, hourStart + HOUR / 2);
