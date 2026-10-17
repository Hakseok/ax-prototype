// AX baseline period. It is the N months before go-live; N is a versioned setting on SET-020
// (kind unitCost, item ax.baselineMonths) so a change keeps its start date and history and every
// calculation (ROI ledger, comparisons, PDF) reads the same period from here.
import companyJson from '../../config/company.json';
import { BASELINE_FROM, BASELINE_TO, GO_LIVE, NOW, PRODUCTION_FROM, addMonths, monthsBetween } from './time';
import { valueAt, versionStore } from './versions';

export const BASELINE_ITEM = 'ax.baselineMonths';
export const DEFAULT_BASELINE_MONTHS = monthsBetween(BASELINE_FROM, BASELINE_TO).length;
/** The baseline cannot start before the data does. */
export const MAX_BASELINE_MONTHS = monthsBetween(PRODUCTION_FROM, GO_LIVE).length;
export const MIN_BASELINE_MONTHS = 1;

/** The base version of the setting (company.json), shown in the change history. */
export const baselineBaseVersion = {
  validFrom: companyJson.ax.baseline.from,
  value: DEFAULT_BASELINE_MONTHS,
  changedAt: '2025-09-25T10:00',
  changedBy: 'u-admin',
  note: `초기 설정: ${companyJson.ax.baseline.note}`
};

export const baselinePeriod = (t = NOW): { from: number; to: number; months: number } => {
  const added = versionStore.get().unitCost?.[BASELINE_ITEM] ?? [];
  const raw = valueAt([baselineBaseVersion, ...added], t) ?? DEFAULT_BASELINE_MONTHS;
  const months = Math.min(MAX_BASELINE_MONTHS, Math.max(MIN_BASELINE_MONTHS, Math.round(raw)));
  return { from: addMonths(GO_LIVE, -months), to: GO_LIVE, months };
};
