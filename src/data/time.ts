// Naive KST wall-clock time helpers. Values are ms on a UTC axis so the browser
// time zone never shifts them. "Now" is fixed by company.json.
import companyJson from '../../config/company.json';

export const MINUTE = 60_000;
export const QUARTER = 15 * MINUTE;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const parseTime = (s: string): number => {
  const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) throw new Error(`Invalid time: ${s}`);
  return Date.UTC(+m[1], +m[2] - 1, +(m[3] ?? 1), +(m[4] ?? 0), +(m[5] ?? 0));
};

/** 'YYYY-MM-DD HH:mm' — the display format of the guide. */
export const formatDateTime = (t: number): string => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
export const formatDate = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const formatTime = (t: number): string => new Date(t).toISOString().slice(11, 16);
export const monthOf = (t: number): string => new Date(t).toISOString().slice(0, 7);
export const startOfDay = (t: number): number => t - (((t % DAY) + DAY) % DAY);
export const startOfMonth = (t: number): number => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
export const addMonths = (t: number, n: number): number => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
};
export const startOfYear = (t: number): number => Date.UTC(new Date(t).getUTCFullYear(), 0, 1);

export const NOW = parseTime(companyJson.now);
export const CURRENT_HOUR = NOW - (NOW % HOUR);
export const PRODUCTION_FROM = parseTime(companyJson.dataPeriod.production.from);
export const ENERGY_FROM = parseTime(companyJson.dataPeriod.energyHourly.from);
export const QUARTER_FROM = parseTime(companyJson.dataPeriod.energyQuarter.from);
export const SENSOR_FROM = parseTime(companyJson.dataPeriod.sensorHourly.from);
export const BASELINE_FROM = parseTime(companyJson.ax.baseline.from);
/** End of the baseline, exclusive (the day after baseline.to). */
export const BASELINE_TO = parseTime(companyJson.ax.baseline.to) + DAY;
export const GO_LIVE = parseTime(companyJson.ax.goLive);

/** Months 'YYYY-MM' that overlap [from, to). */
export const monthsBetween = (from: number, to: number): string[] => {
  const out: string[] = [];
  for (let t = startOfMonth(from); t < to; t = addMonths(t, 1)) out.push(monthOf(t));
  return out;
};
