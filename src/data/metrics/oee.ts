// OEE time model (docs/kpi-dictionary.md 1, 3). Every quantity is in line-minutes, so
// records add up across products, shifts, lines and sites by plain sums.
import type { Line, ShiftRecord } from '../types';

export interface OeeTotals {
  records: number;
  calendarMin: number;
  plannedStopMin: number;
  missingMin: number;
  /** Planned production time excluding minutes without data. */
  pptMin: number;
  operatingMin: number;
  fullyProductiveMin: number;
  loss: { breakdown: number; changeover: number; minorStop: number; speed: number; defect: number; startup: number };
  minorStopCount: number;
  plannedQty: number;
  totalQty: number;
  goodQty: number;
  scrapQty: number;
  reworkQty: number;
  startupDefectQty: number;
  defects: Record<string, number>;
}

export const emptyTotals = (): OeeTotals => ({
  records: 0, calendarMin: 0, plannedStopMin: 0, missingMin: 0, pptMin: 0, operatingMin: 0, fullyProductiveMin: 0,
  loss: { breakdown: 0, changeover: 0, minorStop: 0, speed: 0, defect: 0, startup: 0 },
  minorStopCount: 0, plannedQty: 0, totalQty: 0, goodQty: 0, scrapQty: 0, reworkQty: 0, startupDefectQty: 0, defects: {}
});

/** Add one shift record. idealCycleMin = 60 / idealRatePerHour of its line. */
export const addRecord = (t: OeeTotals, r: ShiftRecord, line: Line): OeeTotals => {
  const cycle = 60 / line.idealRatePerHour;
  const ppt = r.calendarMin - r.plannedStopMin - r.missingMin;
  const operating = ppt - r.breakdownMin - r.changeoverMin;
  const defectQty = r.totalQty - r.goodQty;
  t.records++;
  t.calendarMin += r.calendarMin;
  t.plannedStopMin += r.plannedStopMin;
  t.missingMin += r.missingMin;
  t.pptMin += ppt;
  t.operatingMin += operating;
  t.fullyProductiveMin += r.goodQty * cycle;
  t.loss.breakdown += r.breakdownMin;
  t.loss.changeover += r.changeoverMin;
  t.loss.minorStop += r.minorStopMin;
  t.loss.speed += operating - r.minorStopMin - r.totalQty * cycle;
  t.loss.defect += (defectQty - r.startupDefectQty) * cycle;
  t.loss.startup += r.startupDefectQty * cycle;
  t.minorStopCount += r.minorStopCount;
  t.plannedQty += r.plannedQty;
  t.totalQty += r.totalQty;
  t.goodQty += r.goodQty;
  t.scrapQty += r.scrapQty;
  t.reworkQty += r.reworkQty;
  t.startupDefectQty += r.startupDefectQty;
  for (const [k, v] of Object.entries(r.defects)) t.defects[k] = (t.defects[k] ?? 0) + v;
  return t;
};

export const totalsOf = (records: ShiftRecord[], lines: Map<string, Line>): OeeTotals => records.reduce((t, r) => addRecord(t, r, lines.get(r.lineId)!), emptyTotals());

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/**
 * OEE and its three factors. Quality here is time-based (good units × ideal cycle over all units × ideal
 * cycle) so OEE = availability × performance × quality also holds for mixed lines; for one line it equals
 * good ÷ total. The count-based figure is quality.fpy.
 */
export const oeeOf = (t: OeeTotals) => {
  const net = t.operatingMin - t.loss.minorStop - t.loss.speed;
  return {
    oee: ratio(t.fullyProductiveMin, t.pptMin),
    availability: ratio(t.operatingMin, t.pptMin),
    performance: ratio(net, t.operatingMin),
    quality: ratio(t.fullyProductiveMin, net)
  };
};

export const LOSS_LABELS: Record<keyof OeeTotals['loss'], string> = {
  breakdown: '고장',
  changeover: '금형·품번 교체',
  minorStop: '소정지',
  speed: '속도 저하',
  defect: '공정 불량·재작업',
  startup: '초기 불량'
};
export const LOSS_ORDER = Object.keys(LOSS_LABELS) as (keyof OeeTotals['loss'])[];
