// Virtual AI engine (docs/ai-engine.md). Results are computed from the mock data with fixed
// formulas — no random numbers, no external calls. A real engine replaces this file's
// implementation behind the same AiEngine interface.
import { company } from '../config';
import type { AiDecision, AiResult, Evidence } from './aiTypes';
import { hourIsProduction } from './calendar';
import { costResolver } from './costs';
import { getEnergy } from './energy';
import { createLocalStore } from './localStore';
import { loadAiResults, loadEquipment, loadLines, loadProducts, loadSensorHourly, loadSensors } from './loaders';
import { getDowntime, getLots, getShifts } from './production';
import { DAY, HOUR, NOW, formatDate, formatDateTime, parseTime, startOfDay } from './time';
import type { AiResultRecord, Equipment, Lot, Sensor } from './types';

const MODEL = {
  health: { name: '설비 건전성 모델', version: 'v1.2', trainedFrom: '2026-04-01', trainedTo: '2026-08-31' },
  rootCause: { name: '불량 원인 비교 모델', version: 'v0.9', trainedFrom: '2025-10-01', trainedTo: '2026-08-31' },
  recommendation: { name: '공정 조건 권장 모델', version: 'v0.9', trainedFrom: '2025-10-01', trainedTo: '2026-08-31' },
  energyWaste: { name: '에너지 낭비 탐지 모델', version: 'v1.0', trainedFrom: '2025-10-01', trainedTo: '2026-08-31' },
  answer: { name: '질의 해석기', version: 'v0.5 (규칙 기반)', trainedFrom: '-', trainedTo: '-' }
};
const stamp = formatDateTime(NOW).replace(' ', 'T');
const hashId = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
};
const resultId = (kind: string, key: string) => `AIR-${formatDate(NOW).slice(2).replace(/-/g, '')}-${hashId(`${kind}|${key}`)}`;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = (s.length - 1) * q;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};

// ---------- decisions (채택·기각) ----------
export const decisionStore = createLocalStore<Record<string, AiDecision>>('ai-decisions', {});
export const decide = (id: string, value: '채택' | '기각', reason: string, userId: string) =>
  decisionStore.set((prev) => ({ ...prev, [id]: { value, reason, by: userId, at: stamp } }));
const withDecision = <T>(r: AiResult<T>): AiResult<T> => {
  const d = decisionStore.get()[r.id];
  return d ? { ...r, decision: d } : r;
};

/** Past AI results with decisions (file) plus decisions made on screens. */
export const aiHistory = async (): Promise<AiResultRecord[]> => {
  const base = await loadAiResults();
  const added = decisionStore.get();
  return base.map((r) => (added[r.id] && !r.decision ? { ...r, decision: added[r.id] } : r));
};

// ---------- 3.1 health and 3.2 remaining life ----------
export interface HealthPayload {
  index: number;
  /** Daily index for the last 30 days (null = idle day). */
  trend: { date: string; index: number | null }[];
  failureMode: string;
  rul: { p10: number; p50: number; p90: number; threshold: number; fitDays: number } | null;
  signals: { signal: string; name: string; unit: string; current: number; reference: [number, number] }[];
}

const SIGNAL_WEIGHT = { vibration: 0.5, temperature: 0.35, current: 0.15 } as const;
const REF_FROM = NOW - 44 * DAY;
const REF_TO = NOW - 30 * DAY;

interface SensorSet {
  eq: Equipment;
  sensors: Sensor[];
  hours: number;
  from: number;
  scale: number;
  series: Record<string, (number | null)[]>;
}

const sensorSet = async (equipmentId: string): Promise<SensorSet | null> => {
  const [eqs, sensors] = await Promise.all([loadEquipment(), loadSensors()]);
  const eq = eqs.find((e) => e.id === equipmentId);
  if (!eq?.monitored) return null;
  const file = await loadSensorHourly(eq.siteId);
  return { eq, sensors: sensors.filter((s) => s.equipmentId === eq.id), hours: file.hours, from: parseTime(file.from), scale: file.scale, series: file.series };
};

/** Values of one signal in running hours of [from, to). */
const running = (set: SensorSet, signal: string, from: number, to: number): number[] => {
  const v = set.series[`${set.eq.id}|${signal}`];
  const vib = set.series[`${set.eq.id}|vibration`];
  const out: number[] = [];
  const utility = set.eq.lineId.endsWith('UTL');
  for (let t = Math.max(from, set.from); t < to; t += HOUR) {
    const i = Math.round((t - set.from) / HOUR);
    if (i < 0 || i >= set.hours || v[i] === null) continue;
    if (!utility && !hourIsProduction(set.eq.siteId, t)) continue;
    if ((vib[i] ?? 0) / set.scale < 1) continue; // machine idle
    out.push((v[i] as number) / set.scale);
  }
  return out;
};

const indexFrom = (dev: Record<string, number>) =>
  Math.round(100 * (1 - clamp(0.27 * Math.max(0, dev.vibration) + 0.7 * Math.max(0, dev.temperature) + 0.2 * Math.max(0, dev.current), 0, 1)));

const deviation = (set: SensorSet, from: number, to: number, ref: Record<string, number>) => {
  const dev: Record<string, number> = {};
  for (const s of Object.keys(SIGNAL_WEIGHT)) {
    const xs = running(set, s, from, to);
    if (!xs.length) return null;
    dev[s] = (mean(xs) - ref[s]) / ref[s];
  }
  return dev;
};

const failureModeOf = (eq: Equipment, dev: Record<string, number>) => {
  if (eq.type === '건조로') return dev.temperature > 0.05 ? '로내 온도 이상' : '정상 범위';
  if (dev.vibration > 0.25 && dev.temperature > 0.06) return '베어링 마모';
  if (dev.vibration > 0.25) return '정렬 불량·체결 풀림';
  if (dev.current > 0.12) return '과부하';
  if (dev.temperature > 0.08) return '냉각 불량';
  return '정상 범위';
};

/** Memo for pure engine computations; decisions are applied on every read. */
const memo = new Map<string, Promise<unknown>>();
const cached = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  if (!memo.has(key)) memo.set(key, fn());
  return memo.get(key) as Promise<T>;
};
const decided = <T>(r: AiResult<T> | null): AiResult<T> | null => (r ? withDecision(r) : null);

export const health = async (equipmentId: string): Promise<AiResult<HealthPayload> | null> => decided(await cached(`health|${equipmentId}`, () => computeHealth(equipmentId)));

const computeHealth = async (equipmentId: string): Promise<AiResult<HealthPayload> | null> => {
  const set = await sensorSet(equipmentId);
  if (!set) return null;
  const ref: Record<string, number> = {};
  const refSd: Record<string, number> = {};
  for (const s of Object.keys(SIGNAL_WEIGHT)) {
    const xs = running(set, s, REF_FROM, REF_TO);
    ref[s] = mean(xs) || 1;
    refSd[s] = sd(xs) || ref[s] * 0.05;
  }
  // Current state: the last 24 running hours.
  const recentFrom = NOW - 3 * DAY;
  const dev = deviation(set, recentFrom, NOW, ref);
  if (!dev) return null;
  const index = indexFrom(dev);
  const trend: HealthPayload['trend'] = [];
  for (let d = startOfDay(NOW) - 29 * DAY; d <= startOfDay(NOW); d += DAY) {
    const dd = deviation(set, d, d + DAY, ref);
    trend.push({ date: formatDate(d), index: dd ? indexFrom(dd) : null });
  }
  // Remaining life: straight line through the last 14 daily indexes, to 40.
  const pts = trend.slice(-14).map((p, i) => [i, p.index] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  let rul: HealthPayload['rul'] = null;
  let r2 = 0;
  if (pts.length >= 6) {
    const mx = mean(pts.map((p) => p[0]));
    const my = mean(pts.map((p) => p[1]));
    const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
    const resid = pts.map((p) => p[1] - (my + slope * (p[0] - mx)));
    const se = Math.sqrt(resid.reduce((a, e) => a + e * e, 0) / Math.max(1, pts.length - 2) / sxx);
    r2 = 1 - resid.reduce((a, e) => a + e * e, 0) / Math.max(1e-9, pts.reduce((a, p) => a + (p[1] - my) ** 2, 0));
    if (slope < -0.4 && index > 40) {
      const days = (s: number) => (index - 40) / -s;
      // Band: fit uncertainty plus a ±30% allowance for how wear speeds up or slows down.
      const fast = Math.min(-0.05, slope * 1.3 - 1.28 * se);
      const slow = Math.min(-0.05, slope * 0.7 + 1.28 * se);
      rul = { p10: Math.max(1, Math.round(days(fast))), p50: Math.round(days(slope)), p90: Math.round(Math.min(120, days(slow))), threshold: 40, fitDays: 14 };
    }
  }
  const signals = set.sensors.map((s) => ({
    signal: s.signal,
    name: s.name,
    unit: s.unit,
    current: Math.round(ref[s.signal] * (1 + dev[s.signal]) * 10) / 10,
    reference: [Math.round((ref[s.signal] - 2 * refSd[s.signal]) * 10) / 10, Math.round((ref[s.signal] + 2 * refSd[s.signal]) * 10) / 10] as [number, number]
  }));
  const evidence: Evidence[] = [...signals]
    .sort((a, b) => (b.current - b.reference[1]) / b.reference[1] - (a.current - a.reference[1]) / a.reference[1])
    .map((s) => ({
      label: s.name,
      value: s.current,
      normalRange: s.reference,
      unit: s.unit,
      delta: Math.round((s.current > s.reference[1] ? s.current - s.reference[1] : s.current < s.reference[0] ? s.current - s.reference[0] : 0) * 10) / 10,
      chartRef: `/MNT-011?id=${set.eq.id}&signal=${s.signal}`
    }));
  const mode = failureModeOf(set.eq, dev);
  const level = index < 50 ? 'critical' : index < 70 ? 'warning' : index < 80 ? 'info' : undefined;
  const lines = await loadLines();
  const line = lines.find((l) => l.id === set.eq.lineId);
  let impact: AiResult['impact'];
  if (rul && line) {
    // Downtime if it fails: middle half of past breakdowns on the same line (minutes → hours).
    const ev = (await getDowntime({ siteIds: [set.eq.siteId], from: parseTime(company.dataPeriod.production.from), to: NOW, lineIds: [line.id] })).filter((e) => e.category === 'breakdown');
    const mins = ev.map((e) => (parseTime(e.end) - parseTime(e.start)) / 60_000);
    const lo = Math.max(2, Math.round(quantile(mins, 0.5) / 60 * 4)) ;
    const hi = Math.max(lo + 2, Math.round(quantile(mins, 0.9) / 60 * 6));
    const cost = await costResolver();
    // Same stop price as the metric catalog and the ROI ledger (D-18, D-49).
    const perHour = line.constrained ? cost(`lineLoss.${line.id}`) : line.crew * cost('overtimeLaborKrwPerHour');
    impact = { downtimeHours: [lo, hi], costKrw: [Math.round(lo * perHour), Math.round(hi * perHour)] };
  }
  const name = `${(await loadLines()).find((l) => l.id === set.eq.lineId)?.name ?? '유틸리티'} · ${set.eq.name}`;
  const conclusion =
    mode === '정상 범위'
      ? `건전성 ${index}. 정상 범위`
      : rul
        ? `${mode} 징후. 잔여수명 ${rul.p10}~${rul.p90}일, 중앙값 ${rul.p50}일`
        : `${mode} 징후. 건전성 ${index}, 잔여수명은 추세가 약해 예측하지 않음`;
  return withDecision({
    id: resultId('health', set.eq.id),
    kind: rul ? 'rul' : 'health',
    target: { siteId: set.eq.siteId, lineId: set.eq.lineId, equipmentId: set.eq.id, label: name },
    generatedAt: stamp,
    model: MODEL.health,
    level,
    confidence: Math.round(clamp(0.55 + 0.4 * Math.max(0, r2), 0.5, 0.93) * 100) / 100,
    conclusion,
    evidence,
    impact,
    payload: { index, trend, failureMode: mode, rul, signals }
  });
};

export const healthOverview = async (siteIds: string[]): Promise<AiResult<HealthPayload>[]> => {
  const eqs = (await loadEquipment()).filter((e) => e.monitored && siteIds.includes(e.siteId));
  const out = await Promise.all(eqs.map((e) => health(e.id)));
  return out.filter((x): x is AiResult<HealthPayload> => !!x).sort((a, b) => a.payload.index - b.payload.index);
};

// ---------- 3.3 root cause and 3.4 recommendation ----------
export interface CauseCandidate {
  variable: string;
  label: string;
  unit: string;
  /** Standardized difference (problem − normal) / sd(normal). */
  effect: number;
  direction: '높음' | '낮음' | '넓음';
  problemRange: [number, number];
  normalRange: [number, number];
  confidence: number;
}
export interface GroupFinding {
  field: 'equipmentId' | 'moldId' | 'materialLot' | 'shift';
  label: string;
  value: string;
  problemShare: number;
  normalShare: number;
}
export interface RootCausePayload {
  problemLots: string[];
  normalLots: number;
  medianRate: number;
  problemRate: number;
  candidates: CauseCandidate[];
  groups: GroupFinding[];
  scatter: { variable: string; points: { lotId: string; x: number; y: number; problem: boolean }[] };
}

export interface CauseQuery {
  siteIds: string[];
  productId: string;
  lineId?: string;
  from: number;
  to: number;
  defectType?: string;
}

const lotRate = (l: Lot, defectType?: string) => (l.qty ? (defectType ? l.defects[defectType] ?? 0 : l.defectQty) / l.qty : 0);

const paramMeta = () => Object.fromEntries(Object.values(company.processParameters).flat().map((p) => [p.id, p]));

const lotVariables = (l: Lot) => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(l.params)) {
    out[k] = v[0];
    if (v[2] - v[1] > 0 && k !== 'tipCount' && k !== 'toolLife' && k !== 'eolPass') out[`${k}:spread`] = Math.round((v[2] - v[1]) * 100) / 100;
  }
  return out;
};

export const rootCause = async (q: CauseQuery): Promise<AiResult<RootCausePayload> | null> => decided(await cached(`rc|${JSON.stringify(q)}`, () => computeRootCause(q)));

const computeRootCause = async (q: CauseQuery): Promise<AiResult<RootCausePayload> | null> => {
  const lots = (await getLots({ siteIds: q.siteIds, from: q.from, to: q.to, productIds: [q.productId], lineIds: q.lineId ? [q.lineId] : undefined })).filter((l) => l.qty > 0);
  if (lots.length < 10) return null;
  const rates = lots.map((l) => lotRate(l, q.defectType));
  const median = quantile(rates, 0.5);
  // Problem lots: defect rate at least 1.6 times the period median (and at least 0.5%).
  const cut = Math.max(median * 1.6, 0.005);
  const problem = lots.filter((_, i) => rates[i] >= cut);
  const normal = lots.filter((_, i) => rates[i] < cut);
  if (problem.length < 3 || normal.length < 5) return null;

  const meta = paramMeta();
  const vars = Object.keys(lotVariables(lots[0]));
  const candidates: CauseCandidate[] = vars
    .map((v) => {
      const P = problem.map((l) => lotVariables(l)[v]).filter((x) => x !== undefined);
      const N = normal.map((l) => lotVariables(l)[v]).filter((x) => x !== undefined);
      // Scale floor (5% of the normal mean) keeps tightly controlled variables from dominating the ranking.
      const effect = (mean(P) - mean(N)) / Math.max(sd(N), Math.abs(mean(N)) * 0.05, 1e-9);
      const [base, kind] = v.split(':');
      const m = meta[base];
      const d = m?.digits ?? 1;
      const r = (x: number) => Math.round(x * 10 ** d) / 10 ** d;
      return {
        variable: v,
        label: kind ? `${m?.name ?? base} 편차` : m?.name ?? base,
        unit: m?.unit ?? '',
        effect: Math.round(effect * 100) / 100,
        direction: (kind ? '넓음' : effect > 0 ? '높음' : '낮음') as CauseCandidate['direction'],
        problemRange: [r(quantile(P, 0.1)), r(quantile(P, 0.9))] as [number, number],
        normalRange: [r(quantile(N, 0.1)), r(quantile(N, 0.9))] as [number, number],
        confidence: Math.round(clamp(0.35 + 0.08 * Math.abs(effect) + 0.03 * Math.min(problem.length, 12), 0.3, 0.92) * 100) / 100
      };
    })
    .filter((c) => Math.abs(c.effect) >= 0.5)
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
    .slice(0, 5);
  if (!candidates.length) return null;

  const groups: GroupFinding[] = [];
  const labels: Record<GroupFinding['field'], string> = { equipmentId: '설비', moldId: '금형', materialLot: '자재 로트', shift: '교대' };
  for (const field of Object.keys(labels) as GroupFinding['field'][]) {
    const values = [...new Set(lots.map((l) => String(l[field])))];
    for (const v of values) {
      const ps = problem.filter((l) => String(l[field]) === v).length / problem.length;
      const ns = normal.filter((l) => String(l[field]) === v).length / normal.length;
      if (ps >= 0.4 && ps - ns >= 0.25) groups.push({ field, label: labels[field], value: v, problemShare: Math.round(ps * 100) / 100, normalShare: Math.round(ns * 100) / 100 });
    }
  }
  groups.sort((a, b) => b.problemShare - b.normalShare - (a.problemShare - a.normalShare));

  const top = candidates[0];
  const products = await loadProducts();
  const pname = products.find((p) => p.id === q.productId)?.name ?? q.productId;
  const second = candidates[1];
  return withDecision({
    id: resultId('rootCause', `${q.productId}|${q.lineId}|${q.defectType}|${formatDate(q.from)}|${formatDate(q.to)}`),
    kind: 'rootCause',
    target: { siteId: lots[0].siteId, lineId: q.lineId, productId: q.productId, lotIds: problem.map((l) => l.id), label: `${pname}${q.defectType ? ` · ${q.defectType}` : ''}` },
    generatedAt: stamp,
    model: MODEL.rootCause,
    level: 'warning',
    confidence: top.confidence,
    conclusion: `불량 로트 ${problem.length}개는 정상 로트보다 ${top.label} 값이 ${top.direction === '낮음' ? '낮습니다' : top.direction === '넓음' ? '큽니다' : '높습니다'}${second ? `. 다음 후보는 ${second.label}` : ''}`,
    evidence: candidates.slice(0, 3).map((c) => {
      const cur = c.direction === '낮음' ? c.problemRange[0] : c.problemRange[1];
      return { label: c.label, value: cur, normalRange: c.normalRange, unit: c.unit, delta: Math.round((cur > c.normalRange[1] ? cur - c.normalRange[1] : cur < c.normalRange[0] ? cur - c.normalRange[0] : 0) * 10) / 10 };
    }),
    impact: { defectQty: problem.reduce((a, l) => a + l.defectQty, 0) },
    payload: {
      problemLots: problem.map((l) => l.id),
      normalLots: normal.length,
      medianRate: median,
      problemRate: problem.reduce((a, l) => a + l.defectQty, 0) / Math.max(1, problem.reduce((a, l) => a + l.qty, 0)),
      candidates,
      groups: groups.slice(0, 4),
      scatter: {
        variable: top.variable,
        points: lots.map((l, i) => ({ lotId: l.id, x: lotVariables(l)[top.variable], y: Math.round(rates[i] * 10000) / 100, problem: rates[i] >= cut }))
      }
    }
  });
};

export interface RecommendationPayload {
  conditions: { variable: string; label: string; unit: string; range: [number, number] }[];
  currentRate: number;
  expectedRate: number;
  monthlyVolume: number;
  monthlyDefectReduction: number;
  monthlySavingKrw: number;
  basisLots: number;
}

export const recommend = async (q: CauseQuery): Promise<AiResult<RecommendationPayload> | null> => decided(await cached(`rec|${JSON.stringify(q)}`, () => computeRecommend(q)));

const computeRecommend = async (q: CauseQuery): Promise<AiResult<RecommendationPayload> | null> => {
  const cause = await rootCause(q);
  if (!cause) return null;
  const lots = (await getLots({ siteIds: q.siteIds, from: q.from - 60 * DAY, to: q.to, productIds: [q.productId], lineIds: q.lineId ? [q.lineId] : undefined })).filter((l) => l.qty > 0);
  const vars = cause.payload.candidates.slice(0, 2);
  const rates = lots.map((l) => lotRate(l, q.defectType));
  const good = lots.filter((_, i) => rates[i] <= quantile(rates, 0.25));
  const conditions = vars.map((c) => {
    const xs = good.map((l) => lotVariables(l)[c.variable]);
    const d = 10 ** (paramMeta()[c.variable.split(':')[0]]?.digits ?? 1);
    return { variable: c.variable, label: c.label, unit: c.unit, range: [Math.round(quantile(xs, 0.1) * d) / d, Math.round(quantile(xs, 0.9) * d) / d] as [number, number] };
  });
  const inside = lots.filter((l) => conditions.every((c) => {
    const x = lotVariables(l)[c.variable];
    return x >= c.range[0] && x <= c.range[1];
  }));
  const recent = lots.filter((l) => parseTime(l.date) >= q.from);
  const qty = recent.reduce((a, l) => a + l.qty, 0);
  const currentRate = recent.reduce((a, l) => a + l.defectQty, 0) / Math.max(1, qty);
  const expectedRate = inside.reduce((a, l) => a + l.defectQty, 0) / Math.max(1, inside.reduce((a, l) => a + l.qty, 0));
  const days = Math.max(1, (q.to - q.from) / DAY);
  const monthlyVolume = Math.round((qty / days) * 30);
  const monthlyDefectReduction = Math.max(0, Math.round((currentRate - expectedRate) * monthlyVolume));
  const cost = await costResolver();
  const unit = cost(`material.${q.productId}`) + cost(`conversion.${q.productId}`);
  const monthlySavingKrw = Math.round(monthlyDefectReduction * (0.6 * unit + 0.4 * cost(`rework.${q.productId}`)));
  return withDecision({
    id: resultId('recommendation', cause.id),
    kind: 'recommendation',
    target: cause.target,
    generatedAt: stamp,
    model: MODEL.recommendation,
    confidence: Math.round(clamp(cause.confidence - 0.06 + Math.min(inside.length, 40) / 400, 0.3, 0.9) * 100) / 100,
    conclusion: `${conditions.map((c) => `${c.label} ${c.range[0]}~${c.range[1]} ${c.unit}`).join(', ')}로 관리하면 불량률 ${(currentRate * 100).toFixed(1)}% → ${(expectedRate * 100).toFixed(1)}% 예상`,
    evidence: cause.evidence.slice(0, 2),
    impact: { defectQty: monthlyDefectReduction, costKrw: [Math.round(monthlySavingKrw * 0.7), monthlySavingKrw] },
    payload: { conditions, currentRate, expectedRate, monthlyVolume, monthlyDefectReduction, monthlySavingKrw, basisLots: inside.length }
  });
};

// ---------- 3.5 energy waste ----------
export interface EnergyWastePayload {
  source: 'compressedAir' | 'electricity';
  referenceFrom: string;
  referenceTo: string;
  idlePerHourBefore: number;
  idlePerHourNow: number;
  increasePerHour: number;
  monthlyIdleHours: number;
  monthlyCostKrw: number;
  daily: { date: string; idlePerHour: number }[];
}

const idleHourly = async (siteId: string, from: number, to: number) => {
  const r = await getEnergy({ siteIds: [siteId], from, to, source: 'compressedAir' }, 'hour');
  let sum = 0;
  let n = 0;
  for (const [k, v] of r.buckets) {
    const t = parseTime(k.replace('T', ' ') + ':00');
    if (!hourIsProduction(siteId, t)) {
      sum += v;
      n++;
    }
  }
  return { perHour: n ? sum / n : 0, hours: n };
};

export const energyWaste = async (siteId: string): Promise<AiResult<EnergyWastePayload> | null> =>
  decided(await cached(`waste|${siteId}`, () => computeEnergyWaste(siteId)));

const computeEnergyWaste = async (siteId: string): Promise<AiResult<EnergyWastePayload> | null> => {
  const refFrom = NOW - 60 * DAY;
  const refTo = NOW - 30 * DAY;
  const [before, now] = await Promise.all([idleHourly(siteId, refFrom, refTo), idleHourly(siteId, NOW - 14 * DAY, NOW)]);
  const increase = now.perHour - before.perHour;
  if (increase <= before.perHour * 0.2) return null;
  const daily: EnergyWastePayload['daily'] = [];
  for (let d = startOfDay(NOW) - 44 * DAY; d < NOW; d += DAY) {
    const x = await idleHourly(siteId, d, Math.min(d + DAY, NOW));
    daily.push({ date: formatDate(d), idlePerHour: Math.round(x.perHour) });
  }
  const monthlyIdleHours = Math.round((now.hours / 14) * 30);
  const cost = await costResolver();
  const monthlyCostKrw = Math.round(increase * monthlyIdleHours * cost('compressedAirKrwPerNm3'));
  const site = company.sites.find((s) => s.id === siteId)!;
  return withDecision({
    id: resultId('energyWaste', siteId),
    kind: 'energyWaste',
    target: { siteId, label: `${site.name} 압축공기` },
    generatedAt: stamp,
    model: MODEL.energyWaste,
    level: 'info',
    confidence: Math.round(clamp(0.6 + Math.min(0.3, increase / Math.max(1, before.perHour) / 10), 0.6, 0.9) * 100) / 100,
    conclusion: `비생산 시간 압축공기 사용이 시간당 ${Math.round(before.perHour)} → ${Math.round(now.perHour)} Nm³로 늘었습니다(배관 누설 추정)`,
    evidence: [{ label: '비생산 시간 압축공기', value: Math.round(now.perHour), normalRange: [Math.round(before.perHour * 0.8), Math.round(before.perHour * 1.2)], unit: 'Nm³/h', delta: Math.round(now.perHour - before.perHour * 1.2), chartRef: `/ENG-010?site=${siteId}` }],
    impact: { costKrw: [Math.round(monthlyCostKrw * 0.8), monthlyCostKrw] },
    payload: {
      source: 'compressedAir', referenceFrom: formatDate(refFrom), referenceTo: formatDate(refTo - DAY), idlePerHourBefore: Math.round(before.perHour), idlePerHourNow: Math.round(now.perHour),
      increasePerHour: Math.round(increase), monthlyIdleHours, monthlyCostKrw, daily
    }
  });
};

// ---------- convenience for screens ----------
/** Shifts of the last n days for quick checks (used by the assistant). */
export const recentShifts = (siteIds: string[], days: number) => getShifts({ siteIds, from: startOfDay(NOW) - (days - 1) * DAY, to: NOW });

export const AI_MODELS = MODEL;
