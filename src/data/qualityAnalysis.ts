// Inputs and lot details for 품질 원인 분석 (QUA-020). The cause ranking itself is the AI engine's
// (rootCause, recommend); this file only picks the target and lays out lots for comparison.
import { company } from '../config';
import { loadProducts } from './loaders';
import { getLots, getShifts } from './production';
import type { Lot } from './types';

const ratesBy = async (siteIds: string[], from: number, to: number, productId?: string | null, lineId?: string | null) => {
  const records = await getShifts({ siteIds, from, to, productIds: productId ? [productId] : undefined, lineIds: lineId ? [lineId] : undefined });
  const by = new Map<string, { total: number; defects: number; productId: string; lineId: string }>();
  for (const r of records) {
    const k = `${r.productId}|${r.lineId}`;
    const x = by.get(k) ?? { total: 0, defects: 0, productId: r.productId, lineId: r.lineId };
    x.total += r.totalQty;
    x.defects += r.totalQty - r.goodQty;
    by.set(k, x);
  }
  return by;
};

/**
 * Product and line to analyze, unless the user chose them: the one whose defect rate rose most
 * (in points) against the window of the same length right before. A line that is always high
 * (e.g. painting) is not a "급증"; a jump is what the cause comparison can explain.
 */
export const causeTarget = async (siteIds: string[], from: number, to: number, productId?: string | null, lineId?: string | null) => {
  const [now, before] = await Promise.all([ratesBy(siteIds, from, to, productId, lineId), ratesBy(siteIds, from - (to - from), from, productId, lineId)]);
  const rate = (x?: { total: number; defects: number }) => (x && x.total ? x.defects / x.total : 0);
  const ranked = [...now.entries()]
    .filter(([, x]) => x.total > 0)
    .map(([k, x]) => ({ ...x, rate: rate(x), rise: rate(x) - rate(before.get(k)) }))
    .sort((a, b) => b.rise - a.rise);
  const pick = ranked[0];
  if (!pick) return null;
  const product = (await loadProducts()).find((p) => p.id === pick.productId)!;
  return { productId: pick.productId, lineId: pick.lineId, siteId: product.siteId, rate: pick.rate, rise: pick.rise };
};

export interface LotParam {
  id: string;
  name: string;
  unit: string;
  digits: number;
  value: [number, number, number];
  /** 10–90% range of the lot means of normal lots. */
  normal: [number, number];
  outside: boolean;
}

const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = (s.length - 1) * q;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};

/** Process conditions of one lot against the normal lots of the same analysis. */
export const lotParams = (lot: Lot, normalLots: Lot[]): LotParam[] => {
  const meta = Object.fromEntries(Object.values(company.processParameters).flat().map((p) => [p.id, p]));
  return Object.entries(lot.params).map(([id, value]) => {
    const xs = normalLots.map((l) => l.params[id]?.[0]).filter((x): x is number => x !== undefined);
    const d = meta[id]?.digits ?? 1;
    const r = (x: number) => Math.round(x * 10 ** d) / 10 ** d;
    const normal: [number, number] = [r(quantile(xs, 0.1)), r(quantile(xs, 0.9))];
    return { id, name: meta[id]?.name ?? id, unit: meta[id]?.unit ?? '', digits: d, value, normal, outside: value[0] < normal[0] || value[0] > normal[1] };
  });
};

/** Lots of the analysis with their defect rate, for the lot table. */
export const analysisLots = async (siteIds: string[], from: number, to: number, productId: string, lineId?: string) =>
  (await getLots({ siteIds, from, to, productIds: [productId], lineIds: lineId ? [lineId] : undefined })).filter((l) => l.qty > 0);
