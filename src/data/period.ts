// Periods and comparison periods (docs/screen-guide.md 7). Cards, tables and the PDF all use
// these two functions, so a "직전 기간 대비" means the same thing everywhere (D-05).
import { DAY, GO_LIVE, NOW, addMonths, formatDate, startOfDay, startOfMonth, startOfYear } from './time';
import { baselinePeriod } from './baseline';

export type PeriodKey = 'today' | 'thisWeek' | 'thisMonth' | 'thisYear' | 'last30days' | 'last13weeks' | 'baseline' | 'sinceGoLive';

export interface Period {
  key: PeriodKey | 'custom';
  label: string;
  from: number;
  /** Exclusive end; never later than now. */
  to: number;
}

const startOfWeek = (t: number): number => {
  const d = startOfDay(t);
  const dow = (new Date(d).getUTCDay() + 6) % 7; // Monday = 0
  return d - dow * DAY;
};

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: '오늘',
  thisWeek: '이번 주',
  thisMonth: '이번 달',
  thisYear: '올해',
  last30days: '최근 30일',
  last13weeks: '최근 13주',
  baseline: '기준선',
  sinceGoLive: 'AX 적용 후'
};

export const periodOf = (key: PeriodKey, now = NOW): Period => {
  const label = PERIOD_LABELS[key];
  switch (key) {
    case 'today':
      return { key, label, from: startOfDay(now), to: now };
    case 'thisWeek':
      return { key, label, from: startOfWeek(now), to: now };
    case 'thisMonth':
      return { key, label, from: startOfMonth(now), to: now };
    case 'thisYear':
      return { key, label, from: startOfYear(now), to: now };
    case 'last30days':
      return { key, label, from: startOfDay(now) - 29 * DAY, to: now };
    case 'last13weeks':
      return { key, label, from: startOfWeek(now) - 12 * 7 * DAY, to: now };
    case 'baseline':
      return { key, label, from: baselinePeriod().from, to: baselinePeriod().to };
    case 'sinceGoLive':
      return { key, label, from: GO_LIVE, to: now };
  }
};

/**
 * The comparison period: the same elapsed span one step back.
 *   today → yesterday 00:00 to the same time, this week → last week to the same weekday and time,
 *   this month → last month to the same elapsed day and time, this year → last year same span,
 *   rolling windows → the window right before, AX periods → the baseline.
 */
export const comparisonOf = (p: Period): Period & { basis: string } => {
  const span = p.to - p.from;
  switch (p.key) {
    case 'today':
      return { key: 'custom', label: '전일', basis: '전일 같은 시각까지', from: p.from - DAY, to: p.to - DAY };
    case 'thisWeek':
      return { key: 'custom', label: '전주', basis: '전주 같은 요일·시각까지', from: p.from - 7 * DAY, to: p.to - 7 * DAY };
    case 'thisMonth': {
      const from = addMonths(p.from, -1);
      // A whole month compares with the whole previous month (months differ in length).
      if (p.to >= addMonths(p.from, 1)) return { key: 'custom', label: '전월', basis: '전월', from, to: p.from };
      return { key: 'custom', label: '전월', basis: '전월 같은 경과일·시각까지', from, to: Math.min(from + span, p.from) };
    }
    case 'thisYear':
      return { key: 'custom', label: '전년', basis: '전년 같은 기간', from: addMonths(p.from, -12), to: addMonths(p.to, -12) };
    case 'sinceGoLive':
      return { ...periodOf('baseline'), key: 'custom', label: '기준선', basis: `기준선 ${formatDate(baselinePeriod().from)}~${formatDate(baselinePeriod().to - DAY)}` };
    default:
      return { key: 'custom', label: '직전 기간', basis: '바로 앞 같은 길이', from: p.from - span, to: p.from };
  }
};

/**
 * The last `days` calendar days up to now (today counts as one). Screens with a date-range condition
 * (QUA-020 "최근 14일") and the engine calls behind EXE-010 use this one window, so they agree.
 */
export const recentWindow = (days: number, now = NOW): { from: number; to: number } => ({ from: startOfDay(now) - (days - 1) * DAY, to: now });

/** Change ratio, or null when the comparison has no data. */
export const changeRatio = (cur: number | null, prev: number | null): number | null => (cur === null || prev === null || prev === 0 ? null : cur / prev - 1);
