// Energy usage from hourly files (complete hours) and 15-minute files (last seven days, the running hour).
// A period edge inside an hour uses 15-minute values where they exist, otherwise a pro-rated hour.
import { hourIsProduction } from './calendar';
import { loadEnergyHourly, loadEnergyQuarter, loadLines } from './loaders';
import { CURRENT_HOUR, HOUR, NOW, QUARTER, QUARTER_FROM, parseTime } from './time';
import type { EnergyHourlyFile, EnergyQuarterFile, EnergySource } from './types';

const hourly = new Map<string, Promise<EnergyHourlyFile>>();
const quarter = new Map<string, Promise<EnergyQuarterFile>>();
const H = (s: string) => (hourly.has(s) ? hourly : hourly.set(s, loadEnergyHourly(s))).get(s)!;
const Q = (s: string) => (quarter.has(s) ? quarter : quarter.set(s, loadEnergyQuarter(s))).get(s)!;

export interface EnergyQuery {
  siteIds: string[];
  from: number;
  to: number;
  source: EnergySource;
  /** Line ids, or "<site>-UTL" for utilities. Default: everything. */
  lineIds?: string[];
}

export type EnergyBucket = 'hour' | 'day' | 'month';

const keyOf = (b: EnergyBucket, t: number) => {
  const iso = new Date(t).toISOString();
  return b === 'hour' ? iso.slice(0, 13) : b === 'day' ? iso.slice(0, 10) : iso.slice(0, 7);
};

export interface EnergyResult {
  total: number;
  /** Usage outside scheduled shifts. */
  idle: number;
  buckets: Map<string, number>;
  byLine: Map<string, number>;
}

/** Sum of usage with optional bucketing. Values are in the source unit (kWh, Nm³). */
export const getEnergy = async (q: EnergyQuery, bucket: EnergyBucket = 'day'): Promise<EnergyResult> => {
  const res: EnergyResult = { total: 0, idle: 0, buckets: new Map(), byLine: new Map() };
  const to = Math.min(q.to, NOW);
  const add = (siteId: string, line: string, t: number, v: number) => {
    res.total += v;
    if (!hourIsProduction(siteId, t - (t % HOUR))) res.idle += v;
    const k = keyOf(bucket, t);
    res.buckets.set(k, (res.buckets.get(k) ?? 0) + v);
    res.byLine.set(line, (res.byLine.get(line) ?? 0) + v);
  };
  for (const siteId of q.siteIds) {
    const [hf, qf] = await Promise.all([H(siteId), Q(siteId)]);
    const hFrom = parseTime(hf.from);
    const qFrom = parseTime(qf.from);
    for (const [key, values] of Object.entries(hf.series)) {
      const [line, source] = key.split('|');
      if (source !== q.source || (q.lineIds && !q.lineIds.includes(line))) continue;
      const scale = hf.scale[q.source];
      const qv = qf.series[key];
      for (let t = q.from - (q.from % HOUR); t < to; t += HOUR) {
        const a = Math.max(t, q.from);
        const b = Math.min(t + HOUR, to);
        if (b <= a) continue;
        const full = a === t && b === t + HOUR;
        const hi = Math.round((t - hFrom) / HOUR);
        if (full && t < CURRENT_HOUR && hi >= 0 && hi < values.length) {
          const v = values[hi];
          if (v !== null) add(siteId, line, t, v / scale);
          continue;
        }
        // Partial hour or the running hour: 15-minute values when available.
        if (t >= QUARTER_FROM && qv) {
          for (let s = t; s < t + HOUR; s += QUARTER) {
            const sa = Math.max(s, a);
            const sb = Math.min(s + QUARTER, b);
            if (sb <= sa) continue;
            const v = qv[Math.round((s - qFrom) / QUARTER)];
            if (v !== null && v !== undefined) add(siteId, line, s, (v / scale) * ((sb - sa) / QUARTER));
          }
        } else if (hi >= 0 && hi < values.length && values[hi] !== null) {
          add(siteId, line, t, ((values[hi] as number) / scale) * ((b - a) / HOUR));
        }
      }
    }
  }
  return res;
};

let lineNames: Promise<Map<string, string>> | null = null;
export const energyLineNames = () =>
  (lineNames ??= loadLines().then((ls) => {
    const m = new Map(ls.map((l) => [l.id, l.name] as [string, string]));
    for (const s of ['ASN', 'GMH', 'DGU', 'HWS']) m.set(`${s}-UTL`, '유틸리티');
    return m;
  }));
