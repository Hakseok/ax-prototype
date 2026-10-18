// Process views (OPS-060 viewer, SET-080 designer, pattern P13). A view is a drawing the user
// makes: equipment symbols bound to master data, connector lines, zones bound to a line, labels.
// Drawings live in config/hmi/*.json (published v1) with browser-storage overlays for drafts and
// later published versions (D-04). The snapshot computes what the viewer shows at a time: the
// same states as OPS-030 (D-65), the latest hourly sensor value, 15-minute line energy, and the
// day's production — all from the data, nothing generated on screen.
import { company } from '../config';
import { shiftAt } from './calendar';
import { loadCollection, loadEnergyQuarter, loadEquipment, loadSensorHourly, loadSensors } from './loaders';
import type { MachineState } from './lineMonitor';
import { createLocalStore } from './localStore';
import { healthTable } from './maintenance';
import { getDowntime, getShifts, shiftStart } from './production';
import { DAY, HOUR, NOW, QUARTER, formatDateTime, parseTime, startOfDay } from './time';
import type { DowntimeEvent, Equipment, Signal } from './types';

// ---- drawing model ----

export type HmiSymbol =
  | 'press' | 'robot' | 'injection' | 'paintBooth' | 'oven' | 'machining' | 'lathe'
  | 'fastening' | 'inspection' | 'agv' | 'compressor' | 'utility' | 'generic';

export interface HmiEquipmentObject {
  id: string;
  kind: 'equipment';
  symbol: HmiSymbol;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Shown under the symbol; the equipment name when empty. */
  label?: string;
  equipmentId: string | null;
  /** Up to two sensor signals shown next to the symbol. */
  signals?: Signal[];
}
export interface HmiLineObject {
  id: string;
  kind: 'line';
  style: 'conveyor' | 'pipe';
  points: [number, number][];
}
export interface HmiZoneObject {
  id: string;
  kind: 'zone';
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  /** Line id, or "<site>-UTL" for utilities. Drives production (공정) and energy (에너지) figures. */
  lineId: string | null;
}
export interface HmiTextObject {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  text: string;
  size: 'title' | 'body';
}
export type HmiObject = HmiEquipmentObject | HmiLineObject | HmiZoneObject | HmiTextObject;

export interface HmiScreen {
  id: string;
  siteId: string;
  name: string;
  /** Logical canvas size; the viewer scales it to fit. */
  size: [number, number];
  grid: number;
  version: number;
  publishedAt: string | null;
  publishedBy: string | null;
  objects: HmiObject[];
}

export const SYMBOL_NAMES: Record<HmiSymbol, string> = {
  press: '프레스', robot: '용접 로봇', injection: '사출기', paintBooth: '도장 부스', oven: '건조로',
  machining: '머시닝센터', lathe: 'CNC 선반', fastening: '체결 스테이션', inspection: '검사기', agv: 'AGV',
  compressor: '공기 압축기', utility: '유틸리티 설비', generic: '일반 설비'
};

/** The symbol a piece of equipment gets when it is dropped from the equipment list. */
export const symbolFor = (e: Pick<Equipment, 'type' | 'name'>): HmiSymbol => {
  if (e.type === '프레스') return 'press';
  if (e.type === '용접 로봇') return 'robot';
  if (e.type === '사출기') return 'injection';
  if (e.type === '건조로') return 'oven';
  if (e.type === '도장 설비') return 'paintBooth';
  if (e.type === '공작기계') return e.name.includes('선반') ? 'lathe' : 'machining';
  if (e.type === '체결기') return 'fastening';
  if (e.type === '검사 장비') return 'inspection';
  if (e.type === '물류 장비') return 'agv';
  if (e.type === '공기 압축기') return 'compressor';
  if (e.type === '유틸리티 설비') return 'utility';
  return 'generic';
};

// ---- storage: base drawings + overlays ----

const modules = import.meta.glob('../../config/hmi/*.json', { eager: true, import: 'default' });
export const baseScreens: HmiScreen[] = Object.values(modules).map((m) => m as HmiScreen);

interface Overlay {
  /** Saved edit, not visible in the viewer until published. */
  draft?: HmiScreen;
  /** Latest published version when it differs from the base file. */
  published?: HmiScreen;
}
export const hmiStore = createLocalStore<Record<string, Overlay>>('hmi-screens', {});

/** Published screens of a site (what the viewer shows), in name order. */
export const publishedScreens = (all: Record<string, Overlay>, siteId: string): HmiScreen[] => {
  const ids = new Set([...baseScreens.map((s) => s.id), ...Object.keys(all)]);
  return [...ids]
    .map((id) => all[id]?.published ?? baseScreens.find((s) => s.id === id) ?? null)
    .filter((s): s is HmiScreen => !!s && s.siteId === siteId)
    .sort((a, b) => a.id.localeCompare(b.id));
};

/** Screens of a site as the designer sees them: the draft when there is one. */
export const editableScreens = (all: Record<string, Overlay>, siteId: string): { screen: HmiScreen; draft: boolean; published: boolean }[] => {
  const ids = new Set([...baseScreens.map((s) => s.id), ...Object.keys(all)]);
  return [...ids]
    .map((id) => {
      const pub = all[id]?.published ?? baseScreens.find((s) => s.id === id) ?? null;
      const draft = all[id]?.draft ?? null;
      const screen = draft ?? pub;
      return screen ? { screen, draft: !!draft, published: !!pub } : null;
    })
    .filter((x): x is { screen: HmiScreen; draft: boolean; published: boolean } => !!x && x.screen.siteId === siteId)
    .sort((a, b) => a.screen.id.localeCompare(b.screen.id));
};

export const saveDraft = (screen: HmiScreen) => hmiStore.set((all) => ({ ...all, [screen.id]: { ...all[screen.id], draft: screen } }));

/** Publish the draft (or the given screen) as the next version; the draft is cleared. */
export const publish = (screen: HmiScreen, userName: string) =>
  hmiStore.set((all) => {
    const prev = all[screen.id]?.published ?? baseScreens.find((s) => s.id === screen.id);
    const next: HmiScreen = { ...screen, version: (prev?.version ?? 0) + 1, publishedAt: formatDateTime(NOW).replace(' ', 'T'), publishedBy: userName };
    return { ...all, [screen.id]: { published: next } };
  });

export const newScreenId = (all: Record<string, Overlay>, siteId: string): string => {
  const used = new Set([...baseScreens.map((s) => s.id), ...Object.keys(all)]);
  for (let n = 2; ; n++) {
    const id = `HMI-${siteId}-${String(n).padStart(2, '0')}`;
    if (!used.has(id)) return id;
  }
};

// ---- checks before publishing ----

export interface HmiIssue {
  objectId: string | null;
  text: string;
}

export const checkScreen = (screen: HmiScreen, equipment: Equipment[]): HmiIssue[] => {
  const issues: HmiIssue[] = [];
  const seen = new Map<string, string>();
  const lineIds = new Set([...(company.sites.find((s) => s.id === screen.siteId)?.lines.map((l) => l.id) ?? []), `${screen.siteId}-UTL`]);
  for (const o of screen.objects) {
    if (o.kind === 'equipment') {
      if (!o.equipmentId) issues.push({ objectId: o.id, text: `${o.label || SYMBOL_NAMES[o.symbol]}: 연결한 설비가 없습니다` });
      else {
        const e = equipment.find((x) => x.id === o.equipmentId);
        if (!e) issues.push({ objectId: o.id, text: `${o.label || o.equipmentId}: 기준정보에 없는 설비입니다` });
        else if (e.siteId !== screen.siteId) issues.push({ objectId: o.id, text: `${e.name}: 다른 사업장 설비입니다` });
        if (seen.has(o.equipmentId)) issues.push({ objectId: o.id, text: `${e?.name ?? o.equipmentId}: 같은 설비가 두 번 연결되었습니다` });
        seen.set(o.equipmentId, o.id);
      }
    }
    if (o.kind === 'zone' && o.lineId && !lineIds.has(o.lineId)) issues.push({ objectId: o.id, text: `${o.label}: 이 사업장의 라인이 아닙니다` });
    if (o.kind === 'line' && o.points.length < 2) issues.push({ objectId: o.id, text: '선의 점이 2개보다 적습니다' });
  }
  return issues;
};

// ---- snapshot at a time ----

export interface SignalValue {
  signal: Signal;
  name: string;
  unit: string;
  /** Hourly mean of the hour before the time; null = not received. */
  value: number | null;
  normal: [number, number];
  hour: string | null;
}

export interface EquipmentView {
  id: string;
  name: string;
  type: string;
  lineId: string;
  state: MachineState;
  /** The stop in progress at the time. */
  stop: DowntimeEvent | null;
  stopsToday: number;
  /** Health from the engine at "now" (the engine runs daily, not per time step). */
  health: { index: number | null; level: 'critical' | 'warning' | 'info' | 'normal' | null; failureMode: string; rul: string } | null;
  signals: SignalValue[];
  monitored: boolean;
}

export interface LineView {
  lineId: string;
  /** 15-minute mean demand in kW for the quarter that ends at or before the time; null = no value. */
  kw: number | null;
  /** Compressed air in Nm³/h for the same quarter. */
  airPerHour: number | null;
  /** Share of today's electricity (to the time) used outside shifts. */
  idleShare: number | null;
  /** Shifts that started today, cut to the time. null for utilities. */
  produced: number | null;
  planned: number | null;
}

export interface HmiSnapshot {
  at: number;
  equipment: Map<string, EquipmentView>;
  lines: Map<string, LineView>;
  counts: Record<MachineState, number>;
  /** Equipment with a health level of 주의 or 긴급. */
  healthAlerts: number;
}

/** Times the viewer can step through: every 15 minutes of today up to now (energy granularity). */
export const playbackTimes = (stepMin = 15): number[] => {
  const out: number[] = [];
  const step = stepMin * 60_000;
  for (let t = startOfDay(NOW); t <= NOW; t += step) out.push(t);
  if (out[out.length - 1] !== NOW) out.push(NOW);
  return out;
};

// Health comes from the engine at "now"; one computation per site serves every time step.
const healthCache = new Map<string, ReturnType<typeof healthTable>>();
const healthOf = (siteId: string) => {
  if (!healthCache.has(siteId)) healthCache.set(siteId, healthTable([siteId]));
  return healthCache.get(siteId)!;
};

export const hmiSnapshot = async (siteId: string, at: number): Promise<HmiSnapshot> => {
  const day = startOfDay(at);
  const [eqsAll, collection, healthRows, events, sensors, sensorFile, quarter, shifts] = await Promise.all([
    loadEquipment(), loadCollection(), healthOf(siteId),
    getDowntime({ siteIds: [siteId], from: day - DAY, to: at + 1 }),
    loadSensors(), loadSensorHourly(siteId), loadEnergyQuarter(siteId),
    getShifts({ siteIds: [siteId], from: day, to: at })
  ]);
  const eqs = eqsAll.filter((e) => e.siteId === siteId);
  // A collector counts as stopped from its missingFrom time on.
  const stoppedFrom = new Map(collection.filter((c) => c.status === '중단' && c.missingFrom).map((c) => [c.collectorId, parseTime(c.missingFrom!)]));
  const shift = shiftAt(siteId, at);

  const sFrom = parseTime(sensorFile.from);
  const hourIdx = Math.min(sensorFile.hours - 1, Math.floor((Math.min(at, NOW) - sFrom) / HOUR) - 1);

  const equipment = new Map<string, EquipmentView>();
  const counts: Record<MachineState, number> = { 가동: 0, 정지: 0, '계획 비가동': 0, 미수신: 0 };
  let healthAlerts = 0;
  for (const e of eqs) {
    const utility = e.lineId === `${siteId}-UTL`;
    const mine = events.filter((x) => x.equipmentId === e.id);
    const stop = mine.find((x) => parseTime(x.start) <= at && parseTime(x.end) > at) ?? null;
    const missing = stoppedFrom.has(e.collectorId) && stoppedFrom.get(e.collectorId)! <= at;
    const state: MachineState = missing ? '미수신' : stop ? '정지' : !utility && !shift ? '계획 비가동' : '가동';
    counts[state]++;
    const h = healthRows.find((r) => r.id === e.id) ?? null;
    if (h?.level === 'warning' || h?.level === 'critical') healthAlerts++;
    const signals: SignalValue[] = sensors
      .filter((s) => s.equipmentId === e.id)
      .map((s) => {
        const raw = hourIdx >= 0 ? sensorFile.series[`${e.id}|${s.signal}`]?.[hourIdx] ?? null : null;
        return {
          signal: s.signal, name: s.name, unit: s.unit, normal: s.normal,
          value: missing || raw === null ? null : raw / sensorFile.scale,
          hour: hourIdx >= 0 ? formatDateTime(sFrom + hourIdx * HOUR).slice(11) : null
        };
      });
    equipment.set(e.id, {
      id: e.id, name: e.name, type: e.type, lineId: e.lineId, state, stop,
      stopsToday: mine.filter((x) => parseTime(x.start) >= day && parseTime(x.start) <= at).length,
      health: h ? { index: h.index, level: h.level, failureMode: h.failureMode, rul: h.rul } : null,
      signals, monitored: e.monitored
    });
  }

  // Energy: the last complete quarter at or before the time.
  const qFrom = parseTime(quarter.from);
  const qi = Math.floor((Math.min(at, NOW) - qFrom) / QUARTER) - 1;
  const lineIds = [...(company.sites.find((s) => s.id === siteId)?.lines.map((l) => l.id) ?? []), `${siteId}-UTL`];
  const lines = new Map<string, LineView>();
  for (const lineId of lineIds) {
    const el = quarter.series[`${lineId}|electricity`];
    const air = quarter.series[`${lineId}|compressedAir`];
    const kwh = el && qi >= 0 ? el[qi] : null;
    const nm3 = air && qi >= 0 ? air[qi] : null;
    let total = 0;
    let idle = 0;
    if (el) {
      for (let i = Math.max(0, Math.floor((day - qFrom) / QUARTER)); i <= qi; i++) {
        const v = el[i];
        if (v === null || v === undefined) continue;
        total += v;
        if (!shiftAt(siteId, qFrom + i * QUARTER + QUARTER / 2) && !lineId.endsWith('-UTL')) idle += v;
      }
    }
    const utility = lineId.endsWith('-UTL');
    const recs = shifts.filter((r) => r.lineId === lineId);
    // A running shift record is pro-rated to now; cut it again to the time (D-20).
    const share = (r: (typeof recs)[number]) => {
      if (!r.running || at >= NOW) return 1;
      const s = shiftStart(r);
      return NOW > s ? Math.max(0, Math.min(1, (at - s) / (NOW - s))) : 0;
    };
    lines.set(lineId, {
      lineId,
      kw: kwh === null || kwh === undefined ? null : (kwh / quarter.scale.electricity) * (HOUR / QUARTER),
      airPerHour: nm3 === null || nm3 === undefined ? null : (nm3 / quarter.scale.compressedAir) * (HOUR / QUARTER),
      idleShare: utility || total === 0 ? null : idle / total,
      produced: utility ? null : recs.reduce((a, r) => a + r.totalQty * share(r), 0),
      planned: utility ? null : recs.reduce((a, r) => a + r.plannedQty * share(r), 0)
    });
  }
  return { at, equipment, lines, counts, healthAlerts };
};
