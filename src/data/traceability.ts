// Claim → lot → shipment back-tracing (QUA-030). Deterministic rules on the lot data: what the
// claimed lots have in common, which other lots were made under the same condition, and where
// those lots went (shipped to a customer or still in the plant warehouse).
import { company } from '../config';
import { loadCustomers, loadEquipment, loadMolds } from './loaders';
import { getLots } from './production';
import { DAY, parseTime } from './time';
import type { Claim, Lot } from './types';

export interface TraceFactor {
  field: 'equipmentId' | 'materialLot' | 'shift' | 'moldId';
  label: string;
  value: string;
  valueLabel: string;
  /** Share of claimed lots with this value vs. other lots of the product in the window. */
  claimShare: number;
  otherShare: number;
}

export interface TraceParam {
  id: string;
  name: string;
  unit: string;
  digits: number;
  /** Claimed lots: lowest and highest lot mean. */
  claimRange: [number, number];
  /** Other lots: 10th–90th percentile of lot means. */
  normalRange: [number, number];
  effect: number;
  direction: '높음' | '낮음';
}

export interface TraceResult {
  claimLots: Lot[];
  windowFrom: number;
  windowTo: number;
  comparedLots: number;
  factors: TraceFactor[];
  params: TraceParam[];
  /** Lots made under the same suspect condition (common factor + lead parameter in the claimed range). */
  suspectLots: (Lot & { reason: string })[];
  shipped: { qty: number; lots: number; customers: string[] };
  inStock: { qty: number; lots: number };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = (s.length - 1) * q;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

const memo = new Map<string, Promise<TraceResult | null>>();
export const traceClaim = (claim: Claim): Promise<TraceResult | null> => {
  if (!memo.has(claim.id)) memo.set(claim.id, compute(claim));
  return memo.get(claim.id)!;
};

const compute = async (claim: Claim): Promise<TraceResult | null> => {
  const received = parseTime(claim.receivedAt);
  // Window: four weeks before the claim to the claim date, the product's lots on any line.
  const windowFrom = received - 28 * DAY;
  const windowTo = received + DAY;
  const lots = await getLots({ siteIds: [claim.siteId], from: windowFrom, to: windowTo, productIds: [claim.productId] });
  const claimLots = lots.filter((l) => claim.lotIds.includes(l.id));
  if (!claimLots.length) return null;
  const lineId = claimLots[0].lineId;
  const others = lots.filter((l) => l.lineId === lineId && !claim.lotIds.includes(l.id));
  const [eqs, molds, customers] = await Promise.all([loadEquipment(), loadMolds(), loadCustomers()]);
  const labelOf: Record<TraceFactor['field'], (v: string) => string> = {
    equipmentId: (v) => `${v} ${eqs.find((e) => e.id === v)?.name ?? ''}`.trim(),
    materialLot: (v) => v,
    shift: (v) => `${v}조`,
    moldId: (v) => molds.find((m) => m.id === v)?.name ?? v
  };
  const names: Record<TraceFactor['field'], string> = { equipmentId: '설비', materialLot: '자재 로트', shift: '교대', moldId: '금형·지그' };

  const factors: TraceFactor[] = [];
  for (const field of Object.keys(names) as TraceFactor['field'][]) {
    const values = [...new Set(claimLots.map((l) => String(l[field])))];
    for (const v of values) {
      const cs = claimLots.filter((l) => String(l[field]) === v).length / claimLots.length;
      const os = others.length ? others.filter((l) => String(l[field]) === v).length / others.length : 0;
      if (cs >= 0.99 && v !== 'null') factors.push({ field, label: names[field], value: v, valueLabel: labelOf[field](v), claimShare: cs, otherShare: round(os, 2) });
    }
  }
  // Rarer among other lots = more telling.
  factors.sort((a, b) => a.otherShare - b.otherShare);

  const process = Object.values(company.processParameters).find((ps) => ps.some((p) => p.id in claimLots[0].params)) ?? [];
  const params: TraceParam[] = process
    .filter((p) => p.id in claimLots[0].params)
    .map((p) => {
      const c = claimLots.map((l) => l.params[p.id][0]);
      const n = others.map((l) => l.params[p.id][0]);
      const effect = (mean(c) - mean(n)) / Math.max(sd(n), Math.abs(mean(n)) * 0.05, 1e-9);
      return {
        id: p.id, name: p.name, unit: p.unit, digits: p.digits,
        claimRange: [round(Math.min(...c), p.digits), round(Math.max(...c), p.digits)] as [number, number],
        normalRange: [round(quantile(n, 0.1), p.digits), round(quantile(n, 0.9), p.digits)] as [number, number],
        effect: round(effect, 2),
        direction: (effect >= 0 ? '높음' : '낮음') as TraceParam['direction']
      };
    })
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));

  // Suspect lots: same common equipment (when there is one) and the lead parameter inside the claimed range.
  const lead = params[0];
  const eqFactor = factors.find((f) => f.field === 'equipmentId');
  const pool = lots.filter((l) => l.lineId === lineId);
  const inRange = (l: Lot) => {
    if (!lead) return false;
    const x = l.params[lead.id][0];
    return lead.direction === '높음' ? x >= lead.claimRange[0] : x <= lead.claimRange[1];
  };
  const suspectLots = pool
    .filter((l) => claim.lotIds.includes(l.id) || ((!eqFactor || l.equipmentId === eqFactor.value) && inRange(l)))
    .map((l) => ({ ...l, reason: claim.lotIds.includes(l.id) ? '클레임 로트' : `${eqFactor ? '같은 설비 · ' : ''}${lead.name} ${lead.direction === '높음' ? '상한' : '하한'} 쪽` }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const shippedLots = suspectLots.filter((l) => l.shippedOn);
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  return {
    claimLots, windowFrom, windowTo, comparedLots: others.length, factors, params, suspectLots,
    shipped: {
      qty: shippedLots.reduce((a, l) => a + l.qty - l.stockQty, 0),
      lots: shippedLots.length,
      customers: [...new Set(shippedLots.map((l) => customerName.get(l.customerId) ?? l.customerId))]
    },
    inStock: { qty: suspectLots.reduce((a, l) => a + l.stockQty, 0), lots: suspectLots.filter((l) => l.stockQty > 0).length }
  };
};
