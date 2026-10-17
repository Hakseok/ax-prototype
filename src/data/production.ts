// Access to production data: shift records, downtime events and lots, decoded once per site.
import { loadDowntime, loadLines, loadLots, loadManifest, loadProduction } from './loaders';
import { DAY, parseTime } from './time';
import type { DowntimeEvent, Line, Lot, ShiftRecord } from './types';

const shiftCache = new Map<string, Promise<ShiftRecord[]>>();
const eventCache = new Map<string, Promise<DowntimeEvent[]>>();
const lotCache = new Map<string, Promise<Lot[]>>();

const decode = async (siteId: string): Promise<ShiftRecord[]> => {
  const f = await loadProduction(siteId);
  return f.rows.map((row) => {
    const r = Object.fromEntries(f.fields.map((k, i) => [k, row[i]])) as Record<string, unknown>;
    r.running = r.running === 1 || r.running === true;
    return r as unknown as ShiftRecord;
  });
};

export const siteShifts = (siteId: string) => {
  if (!shiftCache.has(siteId)) shiftCache.set(siteId, decode(siteId));
  return shiftCache.get(siteId)!;
};

export interface ProductionQuery {
  siteIds: string[];
  /** [from, to) in ms; records are kept when their shift date is inside. */
  from: number;
  to: number;
  lineIds?: string[];
  productIds?: string[];
  shifts?: string[];
}

/** Shift start in ms for a record (date + shift start time). */
export const shiftStart = (r: Pick<ShiftRecord, 'date' | 'shift'>): number =>
  parseTime(r.date) + ({ A: 6, B: 14, C: 22, D: 7, N: 16 } as Record<string, number>)[r.shift] * 3_600_000;

const SHIFT_HOURS: Record<string, number> = { A: 8, B: 8, C: 8, D: 9, N: 9 };

const SCALED: (keyof ShiftRecord)[] = [
  'calendarMin', 'plannedStopMin', 'missingMin', 'breakdownMin', 'changeoverMin', 'minorStopMin', 'minorStopCount',
  'plannedQty', 'totalQty', 'goodQty', 'scrapQty', 'reworkQty', 'startupDefectQty'
];

/**
 * A finished shift that runs past the end of the query is cut to the elapsed share, so a period
 * that ends "now" compares with the same elapsed time a day, week or month earlier (D-05).
 * The data is per shift, so the cut is proportional.
 */
const clip = (r: ShiftRecord, to: number): ShiftRecord => {
  const start = shiftStart(r);
  const len = SHIFT_HOURS[r.shift] * 3_600_000;
  if (r.running || start + len <= to) return r;
  const f = Math.max(0, (to - start) / len);
  const out = { ...r, defects: Object.fromEntries(Object.entries(r.defects).map(([k, v]) => [k, v * f])) } as ShiftRecord;
  for (const k of SCALED) (out[k] as number) = (r[k] as number) * f;
  return out;
};

export const getShifts = async (q: ProductionQuery): Promise<ShiftRecord[]> => {
  const all = (await Promise.all(q.siteIds.map(siteShifts))).flat();
  return all
    .filter((r) => {
      const t = shiftStart(r);
      return t >= q.from && t < q.to && (!q.lineIds || q.lineIds.includes(r.lineId)) && (!q.productIds || q.productIds.includes(r.productId)) && (!q.shifts || q.shifts.includes(r.shift));
    })
    .map((r) => clip(r, q.to));
};

export const siteDowntime = (siteId: string) => {
  if (!eventCache.has(siteId)) eventCache.set(siteId, loadDowntime(siteId));
  return eventCache.get(siteId)!;
};

export const getDowntime = async (q: ProductionQuery): Promise<DowntimeEvent[]> =>
  (await Promise.all(q.siteIds.map(siteDowntime)))
    .flat()
    .filter((e) => {
      const t = parseTime(e.start);
      return t >= q.from && t < q.to && (!q.lineIds || q.lineIds.includes(e.lineId));
    });

const quartersBetween = (from: number, to: number): string[] => {
  const out = new Set<string>();
  for (let t = from; t < to; t += 28 * DAY) {
    const d = new Date(t);
    out.add(`${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`);
  }
  const d = new Date(to - 1);
  out.add(`${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`);
  return [...out];
};

export const getLots = async (q: ProductionQuery): Promise<Lot[]> => {
  const { quarters } = await loadManifest();
  const wanted = quartersBetween(q.from, q.to).filter((x) => quarters.includes(x));
  const lists = await Promise.all(
    q.siteIds.flatMap((s) =>
      wanted.map((qq) => {
        const key = `${s}-${qq}`;
        if (!lotCache.has(key)) lotCache.set(key, loadLots(s, qq).catch(() => []));
        return lotCache.get(key)!;
      })
    )
  );
  return lists.flat().filter((l) => {
    const t = parseTime(l.date);
    return t >= q.from && t < q.to && (!q.lineIds || q.lineIds.includes(l.lineId)) && (!q.productIds || q.productIds.includes(l.productId));
  });
};

let linesPromise: Promise<Map<string, Line>> | null = null;
export const lineMap = () => (linesPromise ??= loadLines().then((ls) => new Map(ls.map((l) => [l.id, l]))));
