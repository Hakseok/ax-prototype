// Energy analysis (ENG-020): peak demand from the 15-minute files and usage per line.
// Demand = electricity of one 15-minute slot × 4 (kW, the 15-minute average used for peak
// demand). The caution limit is a share of the site's contract power (D-64).
import { company } from '../config';
import { hourIsProduction } from './calendar';
import { energyLineNames, getEnergy } from './energy';
import { loadEnergyQuarter } from './loaders';
import { metric } from './metrics/catalog';
import { HOUR, NOW, QUARTER, formatDate, parseTime } from './time';

export interface DemandSlot {
  t: number;
  kw: number | null;
  production: boolean;
}

export interface DailyPeak {
  day: string;
  t: number;
  kw: number;
  ratio: number;
  production: boolean;
}

export interface DemandProfile {
  siteId: string;
  contractKw: number;
  cautionKw: number;
  slots: DemandSlot[];
  peak: DailyPeak | null;
  days: DailyPeak[];
  /** Slots at or above the caution limit. */
  overCaution: number;
}

export const demandProfile = async (siteId: string, cautionRatio: number): Promise<DemandProfile> => {
  const site = company.sites.find((s) => s.id === siteId)!;
  const q = await loadEnergyQuarter(siteId);
  const from = parseTime(q.from);
  const scale = q.scale.electricity;
  const slots: DemandSlot[] = [];
  for (let i = 0; i < q.slots; i++) {
    const t = from + i * QUARTER;
    if (t + QUARTER > NOW) break;
    let sum = 0;
    let any = false;
    for (const [key, values] of Object.entries(q.series)) {
      if (!key.endsWith('|electricity')) continue;
      const v = values[i];
      if (v === null || v === undefined) continue;
      sum += v / scale;
      any = true;
    }
    slots.push({ t, kw: any ? sum * (HOUR / QUARTER) : null, production: hourIsProduction(siteId, t - (t % HOUR)) });
  }
  const contractKw = site.contractPowerKw;
  const cautionKw = contractKw * cautionRatio;
  const byDay = new Map<string, DailyPeak>();
  for (const s of slots) {
    if (s.kw === null) continue;
    const day = formatDate(s.t);
    const cur = byDay.get(day);
    if (!cur || s.kw > cur.kw) byDay.set(day, { day, t: s.t, kw: s.kw, ratio: s.kw / contractKw, production: s.production });
  }
  const days = [...byDay.values()];
  const peak = days.reduce<DailyPeak | null>((a, d) => (!a || d.kw > a.kw ? d : a), null);
  return { siteId, contractKw, cautionKw, slots, peak, days, overCaution: slots.filter((s) => s.kw !== null && s.kw >= cautionKw).length };
};

export type AnalysisSource = 'electricity' | 'compressedAir';

export interface LineEnergyRow {
  id: string;
  siteId: string;
  lineId: string;
  lineName: string;
  usage: number;
  idle: number;
  idleShare: number | null;
  good: number | null;
  perUnit: number | null;
  /** Electricity cost of the line (electricity only). */
  cost: number | null;
}

const PER_UNIT: Record<AnalysisSource, string> = { electricity: 'energy.kwhPerUnit', compressedAir: 'energy.airPerUnit' };

/** Usage, idle share and intensity per line (and the utilities) of the sites. */
export const lineEnergy = async (siteIds: string[], source: AnalysisSource, from: number, to: number): Promise<LineEnergyRow[]> => {
  const names = await energyLineNames();
  const rows: LineEnergyRow[] = [];
  for (const siteId of siteIds) {
    const site = company.sites.find((s) => s.id === siteId)!;
    const lineIds = [...site.lines.map((l) => l.id), `${siteId}-UTL`];
    for (const lineId of lineIds) {
      const e = await getEnergy({ siteIds: [siteId], from, to, source, lineIds: [lineId] }, 'month');
      if (!e.total) continue;
      const utility = lineId.endsWith('-UTL');
      const scope = { siteIds: [siteId], lineIds: [lineId], from, to };
      rows.push({
        id: lineId, siteId, lineId, lineName: names.get(lineId) ?? lineId,
        usage: e.total, idle: e.idle, idleShare: e.total ? e.idle / e.total : null,
        good: utility ? null : await metric('production.good', scope),
        perUnit: utility ? null : await metric(PER_UNIT[source], scope),
        cost: source === 'electricity' ? await metric('energy.cost', scope) : null
      });
    }
  }
  return rows.sort((a, b) => b.usage - a.usage);
};

export interface EnergySummary {
  usage: number;
  idleShare: number | null;
  perUnit: number | null;
  cost: number | null;
}

/** Totals of the sites for the summary cards; intensity and cost come from the metric catalog. */
export const energySummary = async (siteIds: string[], source: AnalysisSource, from: number, to: number): Promise<EnergySummary> => {
  const e = await getEnergy({ siteIds, from, to, source }, 'month');
  const scope = { siteIds, from, to };
  return {
    usage: e.total,
    idleShare: e.total ? e.idle / e.total : null,
    perUnit: await metric(PER_UNIT[source], scope),
    cost: await metric('energy.cost', scope)
  };
};
