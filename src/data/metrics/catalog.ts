// Metric catalog: every KPI of docs/kpi-dictionary.md, computed by name. Screens, the AI
// engine, the ROI ledger and the PDF all read metrics through here (CLAUDE.md rule 4).
import { costResolver } from '../costs';
import { getEnergy } from '../energy';
import { loadDeliveries } from '../loaders';
import { allClaims as loadClaims, allWorkOrders as loadWorkOrders } from '../workflows';
import { getDowntime, getShifts, lineMap } from '../production';
import { DAY, parseTime } from '../time';
import { oeeOf, totalsOf } from './oee';

export interface MetricScope {
  siteIds: string[];
  from: number;
  to: number;
  lineIds?: string[];
  productIds?: string[];
  shifts?: string[];
}

export type Aggregation = 'sum' | 'time' | 'qty' | 'ratio' | 'min' | 'max';

export interface MetricDef {
  label: string;
  unit: string;
  digits: number;
  /** How company values combine site values (dictionary column "합산"). */
  aggregation: Aggregation;
  higherIsBetter: boolean;
  /** Shown as a percentage: the value is a ratio and the display multiplies by 100. */
  percent?: boolean;
  compute(s: MetricScope): Promise<number | null>;
}

const totals = async (s: MetricScope) => totalsOf(await getShifts(s), await lineMap());
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const inRange = (iso: string | null, s: MetricScope) => {
  if (!iso) return false;
  const t = parseTime(iso);
  return t >= s.from && t < s.to;
};
const siteOk = (siteId: string, lineId: string | null, s: MetricScope) => s.siteIds.includes(siteId) && (!s.lineIds || (lineId !== null && s.lineIds.includes(lineId)));

/** Downtime cost per D-18: constrained lines lose contribution margin, others pay overtime to recover. */
export const downtimeCost = async (s: MetricScope, minutesOf: (r: { breakdownMin: number; changeoverMin: number }) => number = (r) => r.breakdownMin + r.changeoverMin) => {
  const [records, lines, cost] = await Promise.all([getShifts(s), lineMap(), costResolver()]);
  let won = 0;
  for (const r of records) {
    const line = lines.get(r.lineId)!;
    const hours = minutesOf(r) / 60;
    const t = parseTime(r.date);
    won += line.constrained ? hours * cost(`lineLoss.${line.id}`, t) : hours * line.crew * cost('overtimeLaborKrwPerHour', t);
  }
  return won;
};

export const qualityCost = async (s: MetricScope) => {
  const [records, cost, claims] = await Promise.all([getShifts(s), costResolver(), loadClaims()]);
  let internal = 0;
  for (const r of records) {
    const t = parseTime(r.date);
    internal += r.scrapQty * (cost(`material.${r.productId}`, t) + cost(`conversion.${r.productId}`, t)) + r.reworkQty * cost(`rework.${r.productId}`, t);
  }
  const external = claims.filter((c) => siteOk(c.siteId, null, { ...s, lineIds: undefined }) && inRange(c.receivedAt, s) && (!s.productIds || s.productIds.includes(c.productId))).reduce((a, c) => a + c.costKrw, 0);
  return { internal, external, total: internal + external };
};

const energyTotal = (source: 'electricity' | 'compressedAir' | 'lng', s: MetricScope) =>
  getEnergy({ siteIds: s.siteIds, from: s.from, to: s.to, source, lineIds: s.lineIds });

export const METRICS: Record<string, MetricDef> = {
  'plan.attainment': {
    label: '계획 달성률', unit: '%', digits: 1, aggregation: 'ratio', higherIsBetter: true, percent: true,
    compute: async (s) => {
      const t = await totals(s);
      return ratio(t.goodQty, t.plannedQty);
    }
  },
  'oee': { label: 'OEE', unit: '%', digits: 1, aggregation: 'time', higherIsBetter: true, percent: true, compute: async (s) => oeeOf(await totals(s)).oee },
  'oee.availability': { label: '가용성', unit: '%', digits: 1, aggregation: 'time', higherIsBetter: true, percent: true, compute: async (s) => oeeOf(await totals(s)).availability },
  'oee.performance': { label: '성능', unit: '%', digits: 1, aggregation: 'time', higherIsBetter: true, percent: true, compute: async (s) => oeeOf(await totals(s)).performance },
  'oee.quality': { label: '품질', unit: '%', digits: 1, aggregation: 'qty', higherIsBetter: true, percent: true, compute: async (s) => oeeOf(await totals(s)).quality },
  'loss.sixBig': {
    label: '6대 손실', unit: '시간', digits: 1, aggregation: 'sum', higherIsBetter: false,
    compute: async (s) => {
      const t = await totals(s);
      return Object.values(t.loss).reduce((a, b) => a + b, 0) / 60;
    }
  },
  'loss.downtimeCost': { label: '비가동 손실 금액', unit: '원', digits: 0, aggregation: 'sum', higherIsBetter: false, compute: (s) => downtimeCost(s) },
  'quality.fpy': {
    label: '직행률', unit: '%', digits: 1, aggregation: 'qty', higherIsBetter: true, percent: true,
    compute: async (s) => {
      const t = await totals(s);
      return ratio(t.goodQty, t.totalQty);
    }
  },
  'quality.ppmInternal': {
    label: '공정 PPM', unit: 'PPM', digits: 0, aggregation: 'qty', higherIsBetter: false,
    compute: async (s) => {
      const t = await totals(s);
      const r = ratio(t.totalQty - t.goodQty, t.totalQty);
      return r === null ? null : r * 1e6;
    }
  },
  'quality.ppmCustomer': {
    label: '고객 PPM', unit: 'PPM', digits: 0, aggregation: 'qty', higherIsBetter: false,
    compute: async (s) => {
      const rows = (await loadDeliveries()).filter((d) => s.siteIds.includes(d.siteId) && inRange(d.date, s) && (!s.productIds || s.productIds.includes(d.productId)));
      const r = ratio(rows.reduce((a, d) => a + d.returnedQty, 0), rows.reduce((a, d) => a + d.qty, 0));
      return r === null ? null : r * 1e6;
    }
  },
  'quality.cost': { label: '품질 비용', unit: '원', digits: 0, aggregation: 'sum', higherIsBetter: false, compute: async (s) => (await qualityCost(s)).total },
  'mnt.mtbf': {
    label: '평균 고장 간격', unit: '시간', digits: 1, aggregation: 'ratio', higherIsBetter: true,
    compute: async (s) => {
      const [t, events] = await Promise.all([totals(s), getDowntime(s)]);
      const n = events.filter((e) => e.category === 'breakdown' && (parseTime(e.end) - parseTime(e.start)) / 60_000 >= 10).length;
      return n ? t.operatingMin / 60 / n : null;
    }
  },
  'mnt.mttr': {
    label: '평균 수리 시간', unit: '분', digits: 0, aggregation: 'ratio', higherIsBetter: false,
    compute: async (s) => {
      const events = (await getDowntime(s)).filter((e) => e.category === 'breakdown' && (parseTime(e.end) - parseTime(e.start)) / 60_000 >= 10);
      return events.length ? events.reduce((a, e) => a + (parseTime(e.end) - parseTime(e.start)) / 60_000, 0) / events.length : null;
    }
  },
  'mnt.pmCompliance': {
    label: '예방 정비 준수율', unit: '%', digits: 1, aggregation: 'ratio', higherIsBetter: true, percent: true,
    compute: async (s) => {
      const orders = (await loadWorkOrders()).filter((o) => o.type !== '사후' && siteOk(o.siteId, o.lineId, s) && inRange(o.approvedAt, s));
      const onTime = orders.filter((o) => o.startedAt && parseTime(o.startedAt) - parseTime(o.approvedAt!) <= 10 * DAY);
      return ratio(onTime.length, orders.length);
    }
  },
  'delivery.otd': {
    label: '납기 준수율', unit: '%', digits: 1, aggregation: 'ratio', higherIsBetter: true, percent: true,
    compute: async (s) => {
      const rows = (await loadDeliveries()).filter((d) => s.siteIds.includes(d.siteId) && inRange(d.date, s));
      const shipments = rows.reduce((a, d) => a + d.shipments, 0);
      return shipments ? 1 - rows.reduce((a, d) => a + d.lateShipments, 0) / shipments : null;
    }
  },
  'energy.kwhPerUnit': {
    label: '전력 원단위', unit: 'kWh/개', digits: 3, aggregation: 'ratio', higherIsBetter: false,
    compute: async (s) => ratio((await energyTotal('electricity', s)).total, (await totals(s)).goodQty)
  },
  'energy.airPerUnit': {
    label: '압축공기 원단위', unit: 'Nm³/개', digits: 3, aggregation: 'ratio', higherIsBetter: false,
    compute: async (s) => ratio((await energyTotal('compressedAir', s)).total, (await totals(s)).goodQty)
  },
  'energy.idleShare': {
    label: '비생산 시간 사용 비중', unit: '%', digits: 1, aggregation: 'ratio', higherIsBetter: false, percent: true,
    compute: async (s) => {
      const e = await energyTotal('electricity', s);
      return ratio(e.idle, e.total);
    }
  },
  'energy.electricity': { label: '전력 사용량', unit: 'kWh', digits: 0, aggregation: 'sum', higherIsBetter: false, compute: async (s) => (await energyTotal('electricity', s)).total },
  'energy.compressedAir': { label: '압축공기 사용량', unit: 'Nm³', digits: 0, aggregation: 'sum', higherIsBetter: false, compute: async (s) => (await energyTotal('compressedAir', s)).total },
  'energy.lng': { label: 'LNG 사용량', unit: 'Nm³', digits: 0, aggregation: 'sum', higherIsBetter: false, compute: async (s) => (await energyTotal('lng', s)).total },
  'energy.cost': {
    label: '에너지 비용', unit: '원', digits: 0, aggregation: 'sum', higherIsBetter: false,
    compute: async (s) => {
      // Compressed air is made by the utility compressors whose power is already in electricity.
      const [e, g, cost] = await Promise.all([energyTotal('electricity', s), energyTotal('lng', s), costResolver()]);
      return e.total * cost('electricityKrwPerKwh', s.to) + g.total * cost('lngKrwPerNm3', s.to);
    }
  },
  'production.good': { label: '양품 수량', unit: '개', digits: 0, aggregation: 'sum', higherIsBetter: true, compute: async (s) => (await totals(s)).goodQty },
  'production.planned': { label: '계획 수량', unit: '개', digits: 0, aggregation: 'sum', higherIsBetter: true, compute: async (s) => (await totals(s)).plannedQty },
  'ax.effect': {
    label: 'AX 효과 금액', unit: '원', digits: 0, aggregation: 'sum', higherIsBetter: true,
    compute: async (s) => {
      const { buildLedger } = await import('../roi/ledger');
      return (await buildLedger(s.siteIds, s.from, s.to)).totals.counted;
    }
  },
  'mnt.health': {
    label: '설비 건전성 지수(최저)', unit: '', digits: 0, aggregation: 'min', higherIsBetter: true,
    compute: async (s) => {
      const { healthOverview } = await import('../aiEngine');
      const list = await healthOverview(s.siteIds);
      return list.length ? Math.min(...list.map((h) => h.payload.index)) : null;
    }
  }
};

export const metric = async (id: string, scope: MetricScope): Promise<number | null> => {
  const def = METRICS[id];
  if (!def) throw new Error(`알 수 없는 지표: ${id}`);
  return def.compute(scope);
};

/** Display value: percentages ×100, rounded to the metric's digits. */
export const displayValue = (id: string, v: number | null): number | null => {
  if (v === null) return null;
  const def = METRICS[id];
  const x = def.percent ? v * 100 : v;
  const f = 10 ** def.digits;
  return Math.round(x * f) / f;
};
