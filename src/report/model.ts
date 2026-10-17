// Monthly management report model. The preview (EXE-030) and the PDF are drawn from this one
// object, and the object is built only from the shared calculations, so the numbers match the
// screens (EXE-010, EXE-020) exactly.
import { formatNumber } from '../components/format';
import { formatMoney } from '../components/money';
import { company, terms } from '../config';
import { alertHistory, beforeAfter, kpiValue, monthPeriod, monthlyTrend, riskFeed, siteRows, type KpiValue } from '../data/executive';
import { baselinePeriod } from '../data/baseline';
import { METRICS, displayValue } from '../data/metrics/catalog';
import { buildLedger } from '../data/roi/ledger';
import { DAY, GO_LIVE, NOW, formatDate, formatDateTime, parseTime } from '../data/time';
import { aggregationText, changeText } from '../data/kpiText';

export const REPORT_KPIS = ['plan.attainment', 'oee', 'quality.ppmInternal', 'quality.fpy', 'loss.downtimeCost', 'mnt.mtbf', 'delivery.otd', 'energy.kwhPerUnit'];
export const REPORT_SITE_METRICS = ['plan.attainment', 'oee', 'quality.ppmInternal', 'loss.downtimeCost'];
/** Same rows as the AX 적용 전후 비교 on EXE-020. */
export const REPORT_COMPARE = ['oee', 'oee.availability', 'quality.fpy', 'quality.ppmInternal', 'mnt.mtbf', 'mnt.mttr', 'energy.kwhPerUnit', 'delivery.otd'];
/** Pages of the report (D-39, D-68). */
export const REPORT_PAGES = 5;
/** Alert rows that fit page 5 with the notes. */
const ALERT_ROWS = 9;

export interface ReportKpi {
  label: string;
  value: string;
  unit: string;
  change: string;
  worse: boolean;
  note: string;
}

export interface ReportModel {
  title: string;
  company: string;
  month: string;
  periodLabel: string;
  periodText: string;
  scopeText: string;
  generatedAt: string;
  demo: string;
  messages: string[];
  kpis: ReportKpi[];
  siteHeader: string[];
  siteRows: string[][];
  effect: {
    counted: string;
    confirmed: string;
    estimated: string;
    potential: string;
    monthCounted: string;
    investment: string;
    net: string;
    payback: string;
    rows: string[][];
  };
  risks: string[][];
  riskCount: number;
  compare: { basis: string; rows: string[][] };
  alerts: { summary: string; rows: string[][] };
  trend: { categories: string[]; baseline: (number | null)[]; after: (number | null)[]; baselineAvg: number; unit: string };
  /** investment is null for a single site: the investment is company-wide. */
  cumulative: { categories: string[]; actual: (number | null)[]; projected: (number | null)[]; investment: number | null };
  notes: string[];
}

const show = (id: string, v: number | null) => {
  if (v === null) return '-';
  return METRICS[id].unit === '원' ? formatMoney(v) : formatNumber(displayValue(id, v)!, METRICS[id].digits);
};
const unitOf = (id: string) => (METRICS[id].unit === '원' ? '백만 원' : METRICS[id].unit);

export const buildReport = async (siteIds: string[], month: string): Promise<ReportModel> => {
  const period = monthPeriod(month);
  const bl = baselinePeriod();
  const [kpis, sites, risks, ledger, trend, compare, alerts] = await Promise.all([
    Promise.all(REPORT_KPIS.map((id) => kpiValue(id, siteIds, period))),
    siteRows(siteIds, period, REPORT_SITE_METRICS),
    riskFeed(siteIds),
    buildLedger(siteIds),
    monthlyTrend('oee', siteIds),
    beforeAfter(siteIds, REPORT_COMPARE),
    alertHistory(siteIds, period.from, period.to)
  ]);
  const siteName = (id: string) => company.sites.find((s) => s.id === id)!.name;
  const gradeName = (g: 'critical' | 'warning' | 'info') => terms.status[{ critical: 0, warning: 1, info: 2 }[g]];
  const at = (s: string | null) => (s ? formatDateTime(parseTime(s)).slice(5) : '-');
  const byId = Object.fromEntries(kpis.map((k) => [k.metric, k])) as Record<string, KpiValue>;
  const siteCount = siteIds.length;
  const scopeText = siteCount > 1 ? `전사 (${siteCount}개 사업장)` : company.sites.find((s) => s.id === siteIds[0])!.name;
  const lastActual = [...ledger.cumulative].reverse().find((c) => !c.projected);
  const monthCounted = ledger.items.filter((i) => i.kind === '확정' || i.kind === '추정').reduce((a, i) => a + (i.monthly[month] ?? 0), 0);
  const payback = ledger.payback.scope === 'site' ? '전사 기준으로만 계산' : ledger.payback.month ? `${ledger.payback.month}${ledger.payback.projected ? ' (예상)' : ''}` : '예측 불가';

  const oee = byId.oee;
  const top = risks.find((r) => r.impactKrw) ?? risks[0];
  const messages = [
    `OEE ${show('oee', oee.value)}%(${changeText(oee)}), 계획 달성률 ${show('plan.attainment', byId['plan.attainment'].value)}%(${changeText(byId['plan.attainment'])}).`,
    ledger.payback.scope === 'site'
      ? `AX 효과는 적용 후 누적 ${formatMoney(ledger.totals.counted)} 백만 원(확정 + 추정)입니다. 투자비와 회수 시점은 전사 기준으로만 계산합니다.`
      : `AX 효과는 적용 후 누적 ${formatMoney(ledger.totals.counted)} 백만 원(확정 + 추정)이고, 운영비를 뺀 순효과는 투자비 ${formatMoney(ledger.investment.total)} 백만 원의 ${formatNumber(((lastActual?.net ?? 0) / ledger.investment.total) * 100, 1)}%입니다. 회수 시점은 ${payback}입니다.`,
    top
      ? `우선 조치할 리스크는 ${company.sites.find((s) => s.id === top.siteId)!.name} ${top.title}${top.impactKrw ? `(예상 영향 ${formatMoney(top.impactKrw[0])}~${formatMoney(top.impactKrw[1])} 백만 원)` : ''}입니다.`
      : '처리 중인 리스크가 없습니다.'
  ];

  return {
    title: '월간 경영 보고서',
    company: company.company.displayName,
    month,
    periodLabel: period.label,
    periodText: `${formatDate(period.from)} ~ ${formatDateTime(period.to - (period.to === NOW ? 0 : 60_000))}`,
    scopeText,
    generatedAt: formatDateTime(NOW),
    demo: `${terms.badges.virtualData} · 금액은 ${terms.badges.demoOnly} 가상 단가`,
    messages,
    kpis: kpis.map((k) => ({
      label: METRICS[k.metric].label,
      value: show(k.metric, k.value),
      unit: unitOf(k.metric),
      change: changeText(k),
      worse: k.improved === false,
      note: aggregationText(k.metric, siteCount)
    })),
    siteHeader: ['사업장', ...REPORT_SITE_METRICS.map((id) => `${METRICS[id].label} (${unitOf(id)})`), '리스크 (건)'],
    siteRows: [
      ...sites.map((r) => [r.name, ...REPORT_SITE_METRICS.map((id) => show(id, r.values[id])), String(r.risks)]),
      [siteCount > 1 ? '전사' : '합계', ...REPORT_SITE_METRICS.map((id) => show(id, byId[id]?.value ?? null)), String(sites.reduce((a, r) => a + r.risks, 0))]
    ],
    effect: {
      counted: formatMoney(ledger.totals.counted),
      confirmed: formatMoney(ledger.totals.confirmed),
      estimated: formatMoney(ledger.totals.estimated),
      potential: formatMoney(ledger.totals.potential),
      monthCounted: formatMoney(monthCounted),
      investment: formatMoney(ledger.investment.total),
      net: formatMoney(lastActual?.net ?? 0),
      payback,
      rows: ledger.items
        .filter((i) => i.kind !== '제외')
        .map((i) => [i.status ? `${i.title} (${i.status})` : i.title, i.kind, i.kind === '잠재' ? `${formatMoney(i.amount)} (연간)` : formatMoney(i.amount), formatMoney(i.monthly[month] ?? 0), i.kind === '확정' || i.kind === '추정' ? '포함' : '제외'])
    },
    riskCount: risks.length,
    compare: {
      basis: `기준선 ${formatDate(bl.from)}~${formatDate(bl.to - DAY)} 대 적용 후 ${formatDate(GO_LIVE)}~${formatDate(NOW)}`,
      rows: compare.map((c) => [`${METRICS[c.id].label} (${unitOf(c.id)})`, show(c.id, c.before), show(c.id, c.after), `${c.change}${c.better === null ? '' : c.better ? ' 개선' : ' 악화'}`])
    },
    alerts: {
      summary: `${alerts.length}건 (긴급 ${alerts.filter((a) => a.grade === 'critical').length} · 주의 ${alerts.filter((a) => a.grade === 'warning').length} · 참고 ${alerts.filter((a) => a.grade === 'info').length}) · 조치 완료 ${alerts.filter((a) => a.state === '조치 완료').length} · 처리 중 ${alerts.filter((a) => a.state !== '조치 완료').length}${alerts.length > ALERT_ROWS ? ` · 최근 ${ALERT_ROWS}건, 전체는 알림 센터(COM-010)` : ''}`,
      rows: alerts.slice(0, ALERT_ROWS).map((a) => [at(a.occurredAt), gradeName(a.grade), siteName(a.siteId), a.title, a.state, at(a.closedAt), a.action || '-'])
    },
    risks: risks.map((r) => [
      gradeName(r.level),
      siteName(r.siteId),
      r.title,
      r.detail,
      r.impactKrw ? `${formatMoney(r.impactKrw[0])}~${formatMoney(r.impactKrw[1])}` : '-'
    ]),
    trend: {
      categories: trend.points.map((p) => `${Number(p.month.slice(5))}월`),
      baseline: trend.points.map((p) => (p.inBaseline ? displayValue('oee', p.value) : null)),
      after: trend.points.map((p) => (p.afterGoLive ? displayValue('oee', p.value) : null)),
      baselineAvg: displayValue('oee', trend.baseline) ?? 0,
      unit: '%'
    },
    cumulative: {
      categories: ledger.cumulative.map((c) => `${c.month.slice(2).replace('-', '.')}${c.projected ? '*' : ''}`),
      actual: ledger.cumulative.map((c) => (c.projected ? null : c.net / 1e6)),
      projected: ledger.cumulative.map((c, i) => (c.projected || ledger.cumulative[i + 1]?.projected ? c.net / 1e6 : null)),
      investment: ledger.payback.scope === 'company' ? ledger.investment.total / 1e6 : null
    },
    notes: [
      '지표 정의와 합산 방식은 지표 사전(kpi-dictionary.md), 효과 산정 방법은 roi-method.md를 따른다.',
      '비교 기간: 지난 달은 그 전월 전체, 이번 달은 전월 같은 경과일·시각까지.',
      'AX 효과는 확정 + 추정만 합계에 넣고, 잠재(채택 전 AI 제안)와 근거 항목은 넣지 않는다.',
      '모든 데이터와 금액은 시연용 가상값이다.'
    ]
  };
};
