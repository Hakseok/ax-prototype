// OEE·손실 분석 (OPS-020, OPS-010): OEE by site → line → equipment, the six big losses in
// time and money, top causes, and shift / product comparisons. Money follows the same rules as
// the metric catalog (D-18), so the availability loss here equals loss.downtimeCost on EXE-010.
import { company } from '../config';
import { costResolver, type CostOf } from './costs';
import { loadEquipment, loadProducts } from './loaders';
import { emptyTotals, addRecord, oeeOf, LOSS_ORDER, type OeeTotals } from './metrics/oee';
import { getDowntime, getShifts, lineMap, type ProductionQuery } from './production';
import { parseTime } from './time';
import type { DowntimeEvent, Line, ShiftRecord } from './types';

export type LossKey = (typeof LOSS_ORDER)[number];
export type LossMoney = Record<LossKey, number>;

export interface OeeRow {
  id: string;
  level: 'site' | 'line' | 'equipment';
  name: string;
  oee: number | null;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  /** Loss minutes by category (line-minutes; equipment rows carry their share of the line). */
  loss: Record<LossKey, number>;
  lossMin: number;
  lossKrw: number;
  money: LossMoney;
  missingMin: number;
  /** Planned production minutes without missing data (waterfall start). */
  pptMin: number;
  /** Plan attainment (good ÷ planned). */
  plan: number | null;
  /** Equipment rows: stop events and the line-minutes they cost. */
  events?: number;
}

const SHIFT_NAMES = new Map([...company.shifts['3shift'], ...company.shifts['2shift']].map((s) => [s.id, `${s.name} (${s.from.slice(0, 2)}~${s.to.slice(0, 2)}시)`]));

const zeroMoney = (): LossMoney => ({ breakdown: 0, changeover: 0, minorStop: 0, speed: 0, defect: 0, startup: 0 });

/** Money of each loss of one shift record (D-18 for stops, overtime for performance, unit cost for defects). */
export const recordLossMoney = (r: ShiftRecord, line: Line, cost: CostOf): LossMoney => {
  const t = parseTime(r.date);
  const stopPerHour = line.constrained ? cost(`lineLoss.${line.id}`, t) : line.crew * cost('overtimeLaborKrwPerHour', t);
  const overtime = line.crew * cost('overtimeLaborKrwPerHour', t);
  const cycle = 60 / line.idealRatePerHour;
  const operating = r.calendarMin - r.plannedStopMin - r.missingMin - r.breakdownMin - r.changeoverMin;
  const speedMin = Math.max(0, operating - r.minorStopMin - r.totalQty * cycle);
  const defectQty = r.totalQty - r.goodQty;
  const qualityWon = r.scrapQty * (cost(`material.${r.productId}`, t) + cost(`conversion.${r.productId}`, t)) + r.reworkQty * cost(`rework.${r.productId}`, t);
  const startupShare = defectQty > 0 ? r.startupDefectQty / defectQty : 0;
  return {
    breakdown: (r.breakdownMin / 60) * stopPerHour,
    changeover: (r.changeoverMin / 60) * stopPerHour,
    minorStop: (r.minorStopMin / 60) * overtime,
    speed: (speedMin / 60) * overtime,
    defect: qualityWon * (1 - startupShare),
    startup: qualityWon * startupShare
  };
};

const addMoney = (a: LossMoney, b: LossMoney) => {
  for (const k of LOSS_ORDER) a[k] += b[k];
  return a;
};

interface Acc {
  totals: OeeTotals;
  money: LossMoney;
}

const toRow = (id: string, level: OeeRow['level'], name: string, a: Acc): OeeRow => {
  const o = oeeOf(a.totals);
  const lossMin = LOSS_ORDER.reduce((s, k) => s + a.totals.loss[k], 0);
  return {
    id, level, name, ...o, loss: { ...a.totals.loss }, lossMin, money: a.money,
    lossKrw: LOSS_ORDER.reduce((s, k) => s + a.money[k], 0), missingMin: a.totals.missingMin, pptMin: a.totals.pptMin,
    plan: a.totals.plannedQty ? a.totals.goodQty / a.totals.plannedQty : null
  };
};

export interface LossScope extends ProductionQuery {
  equipmentId?: string;
}

export interface LossAnalysis {
  total: OeeRow;
  /** Rows one level below the scope: sites (company), lines (site), equipment (line). */
  children: OeeRow[];
  causes: { causeCode: string; cause: string; category: DowntimeEvent['category']; events: number; lineMin: number }[];
  events: (DowntimeEvent & { durationMin: number; lineMin: number; lineName: string; equipmentName: string })[];
  byShift: OeeRow[];
  byProduct: OeeRow[];
  /** Minor stops are kept per shift, not as events (D-27). */
  minorStops: { count: number; minutes: number };
}

const memo = new Map<string, Promise<LossAnalysis>>();

/** Everything OPS-020 shows for a scope. Cached per scope; unit cost changes give a new key via `costKey`. */
export const lossAnalysis = (q: LossScope, level: 'company' | 'site' | 'line' | 'equipment', costKey: string | number = 0): Promise<LossAnalysis> => {
  const key = JSON.stringify([q, level, costKey]);
  if (!memo.has(key)) memo.set(key, compute(q, level));
  return memo.get(key)!;
};

const compute = async (q: LossScope, level: 'company' | 'site' | 'line' | 'equipment'): Promise<LossAnalysis> => {
  const [records, lines, cost, equipment, products, events] = await Promise.all([getShifts(q), lineMap(), costResolver(), loadEquipment(), loadProducts(), getDowntime(q)]);
  const eqById = new Map(equipment.map((e) => [e.id, e]));
  const acc = (): Acc => ({ totals: emptyTotals(), money: zeroMoney() });
  const add = (a: Acc, r: ShiftRecord) => {
    const line = lines.get(r.lineId)!;
    addRecord(a.totals, r, line);
    addMoney(a.money, recordLossMoney(r, line, cost));
  };

  const total = acc();
  const groups = new Map<string, Acc>();
  const shifts = new Map<string, Acc>();
  const prods = new Map<string, Acc>();
  const child = level === 'company' ? (r: ShiftRecord) => r.siteId : (r: ShiftRecord) => r.lineId;
  for (const r of records) {
    add(total, r);
    if (level === 'company' || level === 'site') {
      const k = child(r);
      if (!groups.has(k)) groups.set(k, acc());
      add(groups.get(k)!, r);
    }
    if (!shifts.has(r.shift)) shifts.set(r.shift, acc());
    add(shifts.get(r.shift)!, r);
    if (!prods.has(r.productId)) prods.set(r.productId, acc());
    add(prods.get(r.productId)!, r);
  }

  // Line-minutes of an event: a machine of a parallel line stops 1/machines of the line.
  const lineMin = (e: DowntimeEvent) => {
    const line = lines.get(e.lineId)!;
    const d = (parseTime(e.end) - parseTime(e.start)) / 60_000;
    return line.parallel ? d / line.machines : d;
  };
  const scoped = q.equipmentId ? events.filter((e) => e.equipmentId === q.equipmentId) : events;

  let children: OeeRow[];
  if (level === 'company') {
    children = company.sites.filter((s) => groups.has(s.id)).map((s) => toRow(s.id, 'site', s.name, groups.get(s.id)!));
  } else if (level === 'site') {
    children = [...groups.entries()].sort((a, b) => lines.get(a[0])!.order - lines.get(b[0])!.order).map(([id, a]) => toRow(id, 'line', lines.get(id)!.name, a));
  } else {
    // Equipment rows: stop losses from events, priced like the line. OEE and its factors are only
    // measured per line (shift records are per line), so they stay empty here (D-48).
    const lineIds = q.lineIds ?? [];
    const line = lines.get(lineIds[0]);
    children = line
      ? equipment
          .filter((e) => e.lineId === line.id)
          .map((e) => {
            const mine = events.filter((x) => x.equipmentId === e.id);
            const loss = { breakdown: 0, changeover: 0, minorStop: 0, speed: 0, defect: 0, startup: 0 };
            const money = zeroMoney();
            for (const x of mine) {
              const m = lineMin(x);
              loss[x.category] += m;
              const t = parseTime(x.start);
              money[x.category] += (m / 60) * (line.constrained ? cost(`lineLoss.${line.id}`, t) : line.crew * cost('overtimeLaborKrwPerHour', t));
            }
            const lossMin = loss.breakdown + loss.changeover;
            return {
              id: e.id, level: 'equipment' as const, name: `${e.id.split('-').pop()} ${e.name}`, oee: null, availability: null, performance: null, quality: null,
              loss, lossMin, money, lossKrw: money.breakdown + money.changeover, missingMin: 0, pptMin: 0, plan: null, events: mine.length
            };
          })
          .sort((a, b) => b.lossMin - a.lossMin)
      : [];
  }

  const causeMap = new Map<string, LossAnalysis['causes'][number]>();
  for (const e of scoped) {
    const c = causeMap.get(e.causeCode) ?? { causeCode: e.causeCode, cause: e.cause, category: e.category, events: 0, lineMin: 0 };
    c.events++;
    c.lineMin += lineMin(e);
    causeMap.set(e.causeCode, c);
  }
  const shiftOrder = ['A', 'B', 'C', 'D', 'N'];
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const scopeName = level === 'equipment' ? eqById.get(q.equipmentId ?? '')?.name ?? '' : '';
  return {
    total: toRow('total', 'line', scopeName || '합계', total),
    children,
    causes: [...causeMap.values()].sort((a, b) => b.lineMin - a.lineMin),
    events: scoped
      .map((e) => ({ ...e, durationMin: (parseTime(e.end) - parseTime(e.start)) / 60_000, lineMin: lineMin(e), lineName: lines.get(e.lineId)?.name ?? e.lineId, equipmentName: eqById.get(e.equipmentId)?.name ?? e.equipmentId }))
      .sort((a, b) => (a.start < b.start ? 1 : -1)),
    byShift: [...shifts.entries()].sort((a, b) => shiftOrder.indexOf(a[0]) - shiftOrder.indexOf(b[0])).map(([id, a]) => toRow(id, 'line', SHIFT_NAMES.get(id) ?? id, a)),
    byProduct: [...prods.entries()].map(([id, a]) => toRow(id, 'line', `${id} ${productName.get(id) ?? ''}`, a)).sort((a, b) => b.lossMin - a.lossMin),
    minorStops: { count: total.totals.minorStopCount, minutes: total.totals.loss.minorStop }
  };
};
