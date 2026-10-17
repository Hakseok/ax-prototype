// Equipment health and maintenance data for MNT-010 and MNT-011 (orders are CMMS data, D-66).
import { aiHistory, health } from './aiEngine';
import { costResolver } from './costs';
import { loadCollection, loadEquipment, loadSensorHourly, loadSensors } from './loaders';
import { getDowntime, lineMap } from './production';
import { DAY, HOUR, NOW, PRODUCTION_FROM, formatDate, formatDateTime, parseTime } from './time';
import type { DowntimeEvent, Equipment, WorkOrder } from './types';
import { allWorkOrders } from './workflows';

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const durationMin = (e: DowntimeEvent) => (parseTime(e.end) - parseTime(e.start)) / 60_000;

/**
 * Downtime a predictive order avoids. With an AI remaining-life result: the low end of its expected
 * downtime if the equipment fails (the same figure EXE-010 shows). Otherwise the median of past
 * breakdowns of the equipment (the line when it has fewer than three). Conservative (roi-method 3, D-47).
 */
export const avoidedDowntimeEstimate = async (equipmentId: string): Promise<{ minutes: number; basis: string; cases: number }> => {
  const eq = (await loadEquipment()).find((e) => e.id === equipmentId);
  if (!eq) return { minutes: 0, basis: '설비 없음', cases: 0 };
  const h = await health(equipmentId);
  if (h?.impact?.downtimeHours) {
    return { minutes: h.impact.downtimeHours[0] * 60, basis: `AI 예상 영향(고장 시 정지 ${h.impact.downtimeHours[0]}~${h.impact.downtimeHours[1]}시간)의 하한`, cases: 0 };
  }
  const lines = await lineMap();
  const line = lines.get(eq.lineId)!;
  const all = (await getDowntime({ siteIds: [eq.siteId], from: PRODUCTION_FROM, to: NOW, lineIds: [eq.lineId] })).filter((e) => e.category === 'breakdown');
  const own = all.filter((e) => e.equipmentId === equipmentId);
  const use = own.length >= 3 ? own : all;
  const share = line.parallel ? 1 / line.machines : 1;
  return {
    minutes: Math.round(median(use.map(durationMin)) * share),
    basis: own.length >= 3 ? `이 설비 과거 고장 ${own.length}건의 정지 시간 중앙값` : `같은 라인 과거 고장 ${all.length}건의 정지 시간 중앙값`,
    cases: use.length
  };
};

/** Won per line-hour of a stop on the equipment's line (D-18). */
export const stopCostPerHour = async (lineId: string, t = NOW) => {
  const [lines, cost] = await Promise.all([lineMap(), costResolver()]);
  const line = lines.get(lineId)!;
  return line.constrained ? cost(`lineLoss.${line.id}`, t) : line.crew * cost('overtimeLaborKrwPerHour', t);
};

/** Remaining-life range as calendar dates from "now", e.g. 10-07~10-14 (expected failure window). */
export const rulDates = (rul: { p10: number; p90: number }): string => `${formatDate(NOW + rul.p10 * DAY).slice(5)}~${formatDate(NOW + rul.p90 * DAY).slice(5)}`;

export interface HealthRow {
  id: string;
  siteId: string;
  lineId: string;
  lineName: string;
  name: string;
  type: string;
  /** null = sensor data not received (SC-07). */
  index: number | null;
  level: 'critical' | 'warning' | 'info' | 'normal' | null;
  failureMode: string;
  rul: string;
  rulP10: number | null;
  openOrder: string | null;
}

/** Every monitored equipment of the sites, worst first; equipment without recent data shows 미수신. */
export const healthTable = async (siteIds: string[]): Promise<HealthRow[]> => {
  const [eqs, lines, orders, collection] = await Promise.all([loadEquipment(), lineMap(), allWorkOrders(), loadCollection()]);
  const stopped = new Set(collection.filter((c) => c.status === '중단').map((c) => c.collectorId));
  const rows = await Promise.all(
    eqs
      .filter((e) => e.monitored && siteIds.includes(e.siteId))
      .map(async (e): Promise<HealthRow> => {
        const h = stopped.has(e.collectorId) ? null : await health(e.id);
        const open = orders.find((o) => o.equipmentId === e.id && o.stage !== '효과 확인' && o.stage !== '완료');
        const rul = h?.payload.rul;
        return {
          id: e.id, siteId: e.siteId, lineId: e.lineId, lineName: lines.get(e.lineId)?.name ?? '유틸리티', name: e.name, type: e.type,
          index: h?.payload.index ?? null,
          level: h ? h.level ?? 'normal' : null,
          failureMode: h ? h.payload.failureMode : '수집 중단',
          rul: rul ? `${rul.p10}~${rul.p90}일 (${rulDates(rul)})` : '',
          rulP10: rul?.p10 ?? null,
          openOrder: open?.id ?? null
        };
      })
  );
  const rank = (r: HealthRow) => (r.index === null ? -1 : r.index);
  return rows.sort((a, b) => rank(a) - rank(b));
};

export interface SignalSeries {
  signal: string;
  name: string;
  unit: string;
  normal: [number, number];
  times: string[];
  values: (number | null)[];
}

/** Hourly sensor values of the last `days` days (null = not received or idle hour kept as is). */
export const signalSeries = async (equipmentId: string, days = 21): Promise<SignalSeries[]> => {
  const eq = (await loadEquipment()).find((e) => e.id === equipmentId);
  if (!eq?.monitored) return [];
  const [file, sensors, h] = await Promise.all([loadSensorHourly(eq.siteId), loadSensors(), health(equipmentId)]);
  const from = parseTime(file.from);
  const start = Math.max(from, NOW - days * DAY);
  const i0 = Math.round((start - from) / HOUR);
  const i1 = Math.min(file.hours, Math.round((NOW - from) / HOUR));
  const times: string[] = [];
  for (let i = i0; i < i1; i++) times.push(formatDateTime(from + i * HOUR));
  return sensors
    .filter((s) => s.equipmentId === equipmentId)
    .map((s) => {
      const raw = file.series[`${equipmentId}|${s.signal}`] ?? [];
      const ref = h?.payload.signals.find((x) => x.signal === s.signal)?.reference ?? s.normal;
      return {
        signal: s.signal, name: s.name, unit: s.unit, normal: ref,
        times, values: raw.slice(i0, i1).map((v) => (v === null ? null : v / file.scale))
      };
    });
};

export interface EquipmentDetail {
  eq: Equipment;
  lineName: string;
  orders: WorkOrder[];
  /** A past predictive order of the same equipment and failure mode, shown as a precedent. */
  precedent: WorkOrder | null;
  breakdowns: (DowntimeEvent & { durationMin: number })[];
  history: Awaited<ReturnType<typeof aiHistory>>;
  collectionStopped: boolean;
}

export const equipmentDetail = async (equipmentId: string): Promise<EquipmentDetail | null> => {
  const [eqs, lines, orders, history, collection] = await Promise.all([loadEquipment(), lineMap(), allWorkOrders(), aiHistory(), loadCollection()]);
  const eq = eqs.find((e) => e.id === equipmentId);
  if (!eq) return null;
  const mine = orders.filter((o) => o.equipmentId === equipmentId).sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
  const h = await health(equipmentId);
  const precedent = mine.find((o) => o.type === '예지' && o.stage === '효과 확인' && (!h || o.failureMode === h.payload.failureMode)) ?? null;
  const breakdowns = (await getDowntime({ siteIds: [eq.siteId], from: NOW - 90 * DAY, to: NOW, lineIds: [eq.lineId] }))
    .filter((e) => e.equipmentId === equipmentId && e.category === 'breakdown')
    .map((e) => ({ ...e, durationMin: durationMin(e) }))
    .sort((a, b) => (a.start < b.start ? 1 : -1));
  return {
    eq, lineName: lines.get(eq.lineId)?.name ?? '유틸리티', orders: mine, precedent, breakdowns,
    history: history.filter((r) => r.equipmentId === equipmentId).sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1)),
    collectionStopped: collection.some((c) => c.status === '중단' && c.collectorId === eq.collectorId)
  };
};
