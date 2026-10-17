// Line monitoring (OPS-030): the state of every machine at "now" and the line × day bottleneck grid.
// States come from the data only: collection status, stop events, the shift calendar and the
// health engine. Shift results are per line (D-48), so the grid is line × day, not hour.
import { company } from '../config';
import { shiftAt } from './calendar';
import { loadCollection, loadCollectors, loadEquipment } from './loaders';
import { healthTable, type HealthRow } from './maintenance';
import { metric } from './metrics/catalog';
import { getDowntime, getShifts, lineMap, shiftStart } from './production';
import { DAY, NOW, formatDate, parseTime, startOfDay } from './time';
import type { DowntimeEvent } from './types';

export type MachineState = '가동' | '정지' | '계획 비가동' | '미수신';

export interface MachineTile {
  id: string;
  name: string;
  type: string;
  state: MachineState;
  /** The stop in progress, or the last stop today. */
  stop: DowntimeEvent | null;
  stopsToday: number;
  stopMinToday: number;
  health: HealthRow | null;
  collector: string;
}

export interface LineBand {
  id: string;
  name: string;
  process: string;
  utility: boolean;
  shiftName: string | null;
  /** Results of the shift running now, pro-rated to now (D-20). null outside a shift. */
  current: { oee: number | null; planned: number; produced: number; good: number } | null;
  machines: MachineTile[];
}

const PROCESS: Record<string, string> = { press: '프레스', welding: '용접', injection: '사출', painting: '도장', machining: '가공', assembly: '조립' };

export const lineBoard = async (siteId: string): Promise<LineBand[]> => {
  const site = company.sites.find((s) => s.id === siteId)!;
  const [eqs, collectors, collection, health, lines, events] = await Promise.all([
    loadEquipment(), loadCollectors(), loadCollection(), healthTable([siteId]), lineMap(),
    getDowntime({ siteIds: [siteId], from: startOfDay(NOW) - DAY, to: NOW })
  ]);
  const stopped = new Set(collection.filter((c) => c.status === '중단').map((c) => c.collectorId));
  const collectorName = new Map(collectors.map((c) => [c.id, c.name]));
  const shift = shiftAt(siteId, NOW);
  const today = startOfDay(NOW);
  const running = await getShifts({ siteIds: [siteId], from: today - DAY, to: NOW });

  const tile = (e: (typeof eqs)[number], utility: boolean): MachineTile => {
    const mine = events.filter((x) => x.equipmentId === e.id);
    const now = mine.find((x) => parseTime(x.start) <= NOW && parseTime(x.end) > NOW) ?? null;
    const todays = mine.filter((x) => parseTime(x.start) >= today);
    const state: MachineState = stopped.has(e.collectorId) ? '미수신' : now ? '정지' : !utility && !shift ? '계획 비가동' : '가동';
    return {
      id: e.id, name: e.name, type: e.type, state,
      stop: now ?? todays[todays.length - 1] ?? null,
      stopsToday: todays.length,
      stopMinToday: todays.reduce((a, x) => a + (Math.min(parseTime(x.end), NOW) - parseTime(x.start)) / 60000, 0),
      health: health.find((h) => h.id === e.id) ?? null,
      collector: collectorName.get(e.collectorId) ?? e.collectorId
    };
  };

  const bands: LineBand[] = [];
  for (const l of site.lines) {
    const recs = running.filter((r) => r.lineId === l.id && r.running);
    const current = recs.length
      ? {
          oee: await metric('oee', { siteIds: [siteId], lineIds: [l.id], from: Math.min(...recs.map(shiftStart)), to: NOW }),
          planned: recs.reduce((a, r) => a + r.plannedQty, 0),
          produced: recs.reduce((a, r) => a + r.totalQty, 0),
          good: recs.reduce((a, r) => a + r.goodQty, 0)
        }
      : null;
    bands.push({
      id: l.id, name: lines.get(l.id)?.name ?? l.name, process: PROCESS[l.process] ?? l.process, utility: false,
      shiftName: shift?.name ?? null, current,
      machines: eqs.filter((e) => e.lineId === l.id).map((e) => tile(e, false))
    });
  }
  const utilities = eqs.filter((e) => e.siteId === siteId && e.lineId === `${siteId}-UTL`);
  if (utilities.length) bands.push({ id: `${siteId}-UTL`, name: '유틸리티', process: '유틸리티', utility: true, shiftName: null, current: null, machines: utilities.map((e) => tile(e, true)) });
  return bands;
};

export type GridMetric = 'plan.attainment' | 'oee' | 'oee.performance';

export interface BottleneckGrid {
  days: string[];
  lines: { id: string; name: string }[];
  /** values[line][day]; null = no production that day. */
  values: (number | null)[][];
  /** Per day, the index of the line with the lowest value (the day's bottleneck). */
  bottleneck: (number | null)[];
}

/** Line × day values of one metric for the last n days (today included, cut at now). */
export const bottleneckGrid = async (siteId: string, id: GridMetric, days = 14): Promise<BottleneckGrid> => {
  const site = company.sites.find((s) => s.id === siteId)!;
  const names = await lineMap();
  const starts = Array.from({ length: days }, (_, i) => startOfDay(NOW) - (days - 1 - i) * DAY);
  const values = await Promise.all(
    site.lines.map((l) => Promise.all(starts.map((d) => metric(id, { siteIds: [siteId], lineIds: [l.id], from: d, to: Math.min(d + DAY, NOW) }))))
  );
  const bottleneck = starts.map((_, j) => {
    let best: number | null = null;
    values.forEach((row, i) => {
      const v = row[j];
      if (v !== null && (best === null || v < (values[best][j] as number))) best = i;
    });
    return best;
  });
  return { days: starts.map((d) => formatDate(d).slice(5)), lines: site.lines.map((l) => ({ id: l.id, name: names.get(l.id)?.name ?? l.name })), values, bottleneck };
};
