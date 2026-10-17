// Data for the executive screens (EXE-010, EXE-020, EXE-030) and the PDF report. Every number
// here comes from the metric catalog, the AI engine or the ROI ledger — nothing is computed twice.
import { company } from '../config';
import { energyWaste, health, recommend } from './aiEngine';
import { mergeAlerts } from './alertStore';
import { loadAlerts } from './loaders';
import { allClaims as loadClaims } from './workflows';
import { METRICS, metric, type MetricScope } from './metrics/catalog';
import { changeRatio, comparisonOf, recentWindow, type Period } from './period';
import { GO_LIVE, NOW, PRODUCTION_FROM, addMonths, formatDate, parseTime, startOfMonth } from './time';
import { baselinePeriod } from './baseline';
import type { Grade } from './types';

export interface KpiValue {
  metric: string;
  value: number | null;
  previous: number | null;
  /** Relative change for amounts and counts, difference in points for ratios. */
  change: number | null;
  changeKind: 'ratio' | 'points';
  basis: string;
  /** Short name of the comparison period, e.g. 전월. */
  label: string;
  improved: boolean | null;
}

/** One KPI with its comparison period (period.ts) — the same call for cards, tables and the PDF. */
export const kpiValue = async (id: string, siteIds: string[], period: Period): Promise<KpiValue> => {
  const def = METRICS[id];
  const cmp = comparisonOf(period);
  const [value, previous] = await Promise.all([metric(id, { siteIds, from: period.from, to: period.to }), metric(id, { siteIds, from: cmp.from, to: cmp.to })]);
  const points = !!def.percent;
  const change = value === null || previous === null ? null : points ? (value - previous) * 100 : changeRatio(value, previous);
  return { metric: id, value, previous, change, changeKind: points ? 'points' : 'ratio', basis: cmp.basis, label: cmp.label, improved: change === null || change === 0 ? null : change > 0 === def.higherIsBetter };
};

export interface SiteRow {
  siteId: string;
  name: string;
  values: Record<string, number | null>;
  risks: number;
  status: Grade | 'normal';
}

/** Per-site values of the given metrics, plus open risks and the worst risk level. */
export const siteRows = async (siteIds: string[], period: Period, metrics: string[]): Promise<SiteRow[]> => {
  const risks = await riskFeed(siteIds);
  return Promise.all(
    siteIds.map(async (s) => {
      const values: Record<string, number | null> = {};
      for (const id of metrics) values[id] = await metric(id, { siteIds: [s], from: period.from, to: period.to });
      const mine = risks.filter((r) => r.siteId === s);
      const status = mine.some((r) => r.level === 'critical') ? 'critical' : mine.some((r) => r.level === 'warning') ? 'warning' : mine.length ? 'info' : 'normal';
      return { siteId: s, name: company.sites.find((x) => x.id === s)!.name, values, risks: mine.length, status };
    })
  );
};

/** Monthly values from the start of the baseline to now, with the baseline average. */
export const monthlyTrend = async (id: string, siteIds: string[]) => {
  const bl = baselinePeriod();
  const points: { month: string; value: number | null; afterGoLive: boolean; inBaseline: boolean; partial: boolean }[] = [];
  for (let t = startOfMonth(PRODUCTION_FROM); t < NOW; t = addMonths(t, 1)) {
    const to = Math.min(addMonths(t, 1), NOW);
    points.push({ month: formatDate(t).slice(0, 7), value: await metric(id, { siteIds, from: t, to }), afterGoLive: t >= GO_LIVE, inBaseline: t >= bl.from && t < bl.to, partial: to === NOW });
  }
  const [baseline, after] = await Promise.all([metric(id, { siteIds, from: bl.from, to: bl.to }), metric(id, { siteIds, from: GO_LIVE, to: NOW })]);
  return { points, baseline, after };
};

export interface Risk {
  id: string;
  siteId: string;
  level: Grade;
  kind: '설비' | '품질' | '납기·고객' | '에너지' | '데이터';
  title: string;
  detail: string;
  /** Expected impact in won: [low, high], or null when it cannot be priced. */
  impactKrw: [number, number] | null;
  impactNote: string;
  link: { label: string; to: string };
  occurredAt: string;
  source: 'AI' | '규칙' | '시스템';
}

/**
 * Open risks of the selected sites: active alerts joined with the engine result that prices them.
 * Ordered by level, then by the high end of the impact.
 */
export const riskFeed = async (siteIds: string[]): Promise<Risk[]> => {
  const alerts = mergeAlerts(await loadAlerts()).filter((a) => a.state !== '조치 완료' && siteIds.includes(a.siteId));
  const claims = await loadClaims();
  const out: Risk[] = [];
  for (const a of alerts) {
    const base = { id: a.id, siteId: a.siteId, level: a.grade, occurredAt: a.occurredAt, source: a.source, title: a.title };
    if (a.equipmentId && a.source === 'AI') {
      const h = await health(a.equipmentId);
      out.push({
        ...base, kind: '설비', detail: h ? `${h.target.label} · ${h.conclusion}` : a.detail, impactKrw: h?.impact?.costKrw ?? null,
        impactNote: h?.impact?.downtimeHours ? `고장 시 정지 ${h.impact.downtimeHours[0]}~${h.impact.downtimeHours[1]}시간` : '',
        link: { label: '설비 진단', to: `/MNT-011?site=${a.siteId}&id=${a.equipmentId}` }, level: h?.level ?? a.grade
      });
    } else if (a.scenario === 'SC-02' || /PPM/.test(a.title)) {
      const rec = await recommend({ siteIds: [a.siteId], productId: 'HG-FBC-410', lineId: a.lineId ?? undefined, ...recentWindow(14) });
      out.push({
        ...base, kind: '품질', detail: `${a.target} · ${a.detail}`, impactKrw: rec ? [Math.round(rec.payload.monthlySavingKrw * 0.7), rec.payload.monthlySavingKrw] : null,
        impactNote: '월 불량 손실 (권장 조건 미적용 시)', link: { label: '원인 분석', to: `/QUA-020?site=${a.siteId}&f.productId=HG-FBC-410${a.lineId ? `&f.lineId=${a.lineId}` : ''}` }
      });
    } else if (/클레임/.test(a.title)) {
      const c = claims.find((x) => a.detail.includes(x.id));
      out.push({
        ...base, kind: '납기·고객', detail: `${a.target} · ${a.detail}`, impactKrw: c ? [c.costKrw, Math.round(c.costKrw * 2.5)] : null,
        impactNote: '반품·처리비, 추가 반품 가능성 포함', link: { label: '클레임 추적', to: `/QUA-030?site=${a.siteId}${c ? `&id=${c.id}` : ''}` }
      });
    } else if (/압축공기|에너지/.test(a.title)) {
      const w = await energyWaste(a.siteId);
      out.push({
        ...base, kind: '에너지', detail: w?.conclusion ?? a.detail, impactKrw: w ? [Math.round(w.payload.monthlyCostKrw * 0.8), w.payload.monthlyCostKrw] : null,
        impactNote: '월 낭비 금액', link: { label: '에너지 현황', to: `/ENG-010?site=${a.siteId}` }
      });
    } else if (a.source === '시스템') {
      out.push({ ...base, kind: '데이터', detail: `${a.target} · ${a.detail}`, impactKrw: null, impactNote: '해당 구간은 미수신으로 표시', link: { label: '알림 상세', to: `/COM-020?site=${a.siteId}&alertId=${a.id}` } });
    } else {
      out.push({ ...base, kind: '설비', detail: `${a.target} · ${a.detail}`, impactKrw: null, impactNote: '', link: { label: '손실 분석', to: `/OPS-020?site=${a.siteId}${a.lineId ? `&line=${a.lineId}` : ''}&period=thisWeek` } });
    }
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || (b.impactKrw?.[1] ?? 0) - (a.impactKrw?.[1] ?? 0));
};

/** Months that can be reported: from the start of the data to the current month. */
export const reportMonths = (): string[] => {
  const out: string[] = [];
  for (let t = startOfMonth(parseTime(company.dataPeriod.production.from)); t < NOW; t = addMonths(t, 1)) out.push(formatDate(t).slice(0, 7));
  return out.reverse();
};

/** The report period of a month: the whole month, or up to now for the current month. */
export const monthPeriod = (month: string): Period => {
  const from = parseTime(`${month}-01`);
  const to = Math.min(addMonths(from, 1), NOW);
  return { key: 'thisMonth', label: `${month.slice(0, 4)}년 ${Number(month.slice(5))}월${to === NOW ? ' (현재까지)' : ''}`, from, to };
};

export type { MetricScope };
