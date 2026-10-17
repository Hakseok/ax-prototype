// Natural-language questions for the AI assistant (docs/ai-engine.md 3.6). No language model:
// a question is matched to a supported intent and answered from metrics and engine results,
// with the numbers, period, sites and screen links. Unmatched questions get the supported list.
import { company } from '../config';
import type { AiResult, Evidence } from './aiTypes';
import { energyWaste, healthOverview, rootCause } from './aiEngine';
import { loadLines, loadProducts } from './loaders';
import { causeTarget } from './qualityAnalysis';
import { allClaims as loadClaims } from './workflows';
import { METRICS, displayValue, metric } from './metrics/catalog';
import { comparisonOf, periodOf, recentWindow, type PeriodKey } from './period';
import { buildLedger } from './roi/ledger';
import { LOSS_LABELS, totalsOf } from './metrics/oee';
import { getShifts, lineMap } from './production';
import { DAY, NOW, formatDateTime } from './time';

export interface AnswerLink {
  label: string;
  to: string;
}
export interface AnswerPayload {
  intent: string | null;
  question: string;
  params: Record<string, string>;
  rows?: { label: string; value: string }[];
  links: AnswerLink[];
  supported?: string[];
}

export const EXAMPLE_QUESTIONS = [
  '이번 달 OEE가 가장 낮은 라인과 이유는?',
  '지난주 불량이 늘어난 원인은?',
  '정비가 필요한 설비는?',
  '이번 달 AX 효과는 얼마야?',
  '고객 클레임 관련 로트는?',
  '압축공기 낭비가 있는 곳은?',
  '오늘 아산공장 OEE는?'
];

const SUPPORTED = [
  '지표 값: "오늘 아산공장 OEE는?", "이번 달 공정 PPM은?"',
  '가장 낮은·높은 대상: "이번 달 OEE가 가장 낮은 라인은?"',
  '불량 원인: "지난주 불량이 늘어난 원인은?"',
  '정비 필요 설비: "정비가 필요한 설비는?"',
  'AX 효과: "이번 달 AX 효과는?"',
  '클레임 추적: "고객 클레임 관련 로트는?"',
  '에너지 낭비: "압축공기 낭비가 있는 곳은?"'
];

const norm = (q: string) => q.toLowerCase().replace(/[\s?!.,·]/g, '');
const has = (q: string, ...words: string[]) => words.some((w) => q.includes(w));

const PERIOD_WORDS: [string[], PeriodKey][] = [
  [['오늘', '금일'], 'today'],
  [['이번주', '금주'], 'thisWeek'],
  [['지난주', '최근일주일', '최근7일'], 'thisWeek'],
  [['이번달', '금월', '당월'], 'thisMonth'],
  [['올해', '금년', '연간'], 'thisYear'],
  [['최근30일', '한달'], 'last30days']
];
const periodFrom = (q: string, fallback: PeriodKey) => {
  const hit = PERIOD_WORDS.find(([ws]) => has(q, ...ws));
  if (hit && has(q, '지난주', '최근일주일', '최근7일')) return { key: 'last7' as const, from: NOW - 7 * DAY, to: NOW, label: '최근 7일' };
  const p = periodOf(hit ? hit[1] : fallback);
  return { key: p.key, from: p.from, to: p.to, label: p.label };
};

const siteMentioned = (q: string) => company.sites.find((x) => q.includes(norm(x.name)) || q.includes(norm(x.name).replace('공장', '')));
const siteFrom = (q: string, allowed: string[]) => {
  const s = siteMentioned(q);
  return s && allowed.includes(s.id) ? [s.id] : allowed;
};

/** Korean particle after a word: 은/는, 이/가. Words ending in a Latin letter (OEE, PPM) read with a vowel. */
const josa = (word: string, withBatchim: string, without: string) => {
  const c = word.charCodeAt(word.length - 1);
  const batchim = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return word + (batchim ? withBatchim : without);
};

const METRIC_WORDS: [string[], string][] = [
  [['oee', '종합설비효율'], 'oee'],
  [['가용성'], 'oee.availability'],
  [['성능'], 'oee.performance'],
  [['계획달성', '달성률'], 'plan.attainment'],
  [['고객ppm'], 'quality.ppmCustomer'],
  [['ppm', '불량률'], 'quality.ppmInternal'],
  [['직행률', 'fpy'], 'quality.fpy'],
  [['품질비용'], 'quality.cost'],
  [['비가동손실', '정지손실'], 'loss.downtimeCost'],
  [['mtbf', '고장간격'], 'mnt.mtbf'],
  [['mttr', '수리시간'], 'mnt.mttr'],
  [['납기'], 'delivery.otd'],
  [['전력원단위'], 'energy.kwhPerUnit'],
  [['전력', '전기'], 'energy.electricity'],
  [['에너지비용'], 'energy.cost']
];

const mwon = (won: number) => (won / 1e6).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const fmt = (id: string, v: number | null) => {
  const def = METRICS[id];
  if (v === null) return '데이터 없음';
  if (def.unit === '원') return `${(v / 1e6).toLocaleString('ko-KR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} 백만 원`;
  return `${displayValue(id, v)!.toLocaleString('ko-KR')} ${def.unit}`;
};

const result = (question: string, intent: string | null, conclusion: string, evidence: Evidence[], payload: Omit<AnswerPayload, 'intent' | 'question'>, confidence = 0.9, siteId = 'ALL'): AiResult<AnswerPayload> => ({
  id: `AIR-ANS-${norm(question).length}-${intent ?? 'none'}`,
  kind: 'answer',
  target: { siteId, label: '' },
  generatedAt: formatDateTime(NOW).replace(' ', 'T'),
  model: { name: '질의 해석기', version: 'v0.5 (규칙 기반)', trainedFrom: '-', trainedTo: '-' },
  confidence,
  conclusion,
  evidence,
  payload: { intent, question, ...payload }
});

export const answer = async (question: string, allowedSites: string[]): Promise<AiResult<AnswerPayload>> => {
  const q = norm(question);
  // A site outside the user's permission is not swapped for another site silently.
  const asked = siteMentioned(q);
  if (asked && !allowedSites.includes(asked.id)) {
    return result(question, 'siteScope', `${asked.name}은(는) 이 사용자의 조회 범위가 아니어서 답하지 않습니다. 조회할 수 있는 사업장: ${company.sites.filter((s) => allowedSites.includes(s.id)).map((s) => s.name).join(', ')}.`, [], { params: {}, links: [] }, 1);
  }
  const sites = siteFrom(q, allowedSites);
  const siteText = sites.length > 1 ? `${sites.length}개 사업장` : company.sites.find((s) => s.id === sites[0])!.name;
  const siteParam = sites.length > 1 ? 'ALL' : sites[0];

  // Lowest / highest line by a metric.
  if (has(q, '가장낮', '제일낮', '최저', '가장높', '제일높', '최고') && has(q, '라인')) {
    const id = METRIC_WORDS.find(([ws]) => has(q, ...ws))?.[1] ?? 'oee';
    const p = periodFrom(q, 'thisMonth');
    const lines = (await loadLines()).filter((l) => sites.includes(l.siteId));
    const vals = await Promise.all(lines.map(async (l) => ({ l, v: await metric(id, { siteIds: [l.siteId], lineIds: [l.id], from: p.from, to: p.to }) })));
    const valid = vals.filter((x) => x.v !== null) as { l: (typeof lines)[number]; v: number }[];
    const low = has(q, '가장낮', '제일낮', '최저') === METRICS[id].higherIsBetter;
    valid.sort((a, b) => (low ? a.v - b.v : b.v - a.v));
    const top = valid[0];
    const t = totalsOf(await getShifts({ siteIds: [top.l.siteId], lineIds: [top.l.id], from: p.from, to: p.to }), await lineMap());
    const losses = Object.entries(t.loss).sort((a, b) => b[1] - a[1]);
    const why = losses.slice(0, 2).map(([k, v]) => `${LOSS_LABELS[k as keyof typeof LOSS_LABELS]} ${(v / 60).toFixed(1)}시간`).join(', ');
    return result(
      question, 'rankLine',
      `${p.label} ${josa(METRICS[id].label, '이', '가')} 가장 ${low ? '낮은' : '높은'} 라인은 ${top.l.name}(${fmt(id, top.v)})입니다. ${low ? '손실이 큰 항목은' : '남은 손실 중 큰 항목은'} ${why}입니다.`,
      [],
      {
        params: { period: p.label, metric: METRICS[id].label, sites: siteText },
        rows: valid.slice(0, 5).map((x) => ({ label: x.l.name, value: fmt(id, x.v) })),
        links: [{ label: 'OEE·손실 분석에서 보기', to: `/OPS-020?site=${top.l.siteId}&line=${top.l.id}${p.key === 'last7' ? '' : `&period=${p.key}`}` }, { label: '비가동 이력', to: `/OPS-050?site=${top.l.siteId}` }]
      }
    );
  }

  // Why defects went up: the same target and window as QUA-020 opens with (D-50, D-51).
  if (has(q, '불량', 'ppm') && has(q, '원인', '왜', '이유', '늘어', '증가')) {
    const asked = periodFrom(q, 'last30days');
    // Lot comparison needs at least the 14 days QUA-020 opens with; a shorter question widens to it.
    const w = recentWindow(14);
    const p = asked.from > w.from ? { ...asked, from: w.from, label: `최근 14일(${asked.label} 질문을 로트 비교 최소 기간으로 넓힘)` } : asked;
    const target = await causeTarget(sites, p.from, p.to);
    if (!target) return result(question, 'defectCause', `${p.label} ${siteText}에 생산 실적이 없습니다.`, [], { params: { period: p.label, sites: siteText }, links: [] });
    const products = await loadProducts();
    const lines = await loadLines();
    const pname = products.find((x) => x.id === target.productId)?.name ?? target.productId;
    const lname = lines.find((x) => x.id === target.lineId)?.name ?? target.lineId;
    const rc = await rootCause({ siteIds: [target.siteId], productId: target.productId, lineId: target.lineId, ...w });
    const top = rc?.payload.candidates[0];
    const cause = rc && top ? `원인 후보 1순위는 ${top.label}(영향 크기 ${Math.abs(top.effect).toFixed(2)}, 신뢰도 ${Math.round(top.confidence * 100)}%)입니다` : '원인 후보를 낼 만큼 로트 차이가 뚜렷하지 않습니다';
    return result(
      question, 'defectCause',
      `${p.label} 직전 같은 기간보다 불량률이 가장 크게 오른 곳은 ${pname} · ${lname}(+${(target.rise * 100).toFixed(2)}%p)입니다. 최근 14일 로트 비교에서 ${cause}.`,
      rc?.evidence ?? [],
      {
        params: { period: `${p.label} (변화) · 최근 14일 (원인 비교)`, sites: siteText },
        rows: (rc?.payload.candidates ?? []).slice(0, 3).map((c, i) => ({ label: `${i + 1}순위 ${c.label}`, value: `영향 크기 ${Math.abs(c.effect).toFixed(2)} · 신뢰도 ${Math.round(c.confidence * 100)}%` })),
        links: [{ label: '품질 원인 분석에서 보기', to: `/QUA-020?site=${target.siteId}&f.productId=${target.productId}&f.lineId=${target.lineId}` }]
      },
      rc ? rc.confidence : 0.6,
      target.siteId
    );
  }
  // Equipment that needs maintenance.
  if (has(q, '정비', '고장', '건전성', '예지') && has(q, '설비', '필요', '위험', '어디')) {
    const list = (await healthOverview(sites)).filter((h) => (h.level && h.level !== 'info') || h.payload.rul);
    if (!list.length) return result(question, 'maintenance', `${siteText}에 정비가 필요한 감시 설비가 없습니다.`, [], { params: { sites: siteText }, links: [{ label: '설비 건전성', to: `/MNT-010?site=${siteParam}` }] });
    const top = list[0];
    return result(
      question, 'maintenance',
      `정비가 필요한 설비는 ${list.length}대입니다. 가장 급한 설비는 ${top.target.label}입니다: ${top.conclusion.replace(/\.$/, '')}.`,
      top.evidence,
      {
        params: { sites: siteText },
        rows: list.slice(0, 5).map((h) => ({ label: h.target.label, value: `건전성 ${h.payload.index}${h.payload.rul ? ` · 잔여 ${h.payload.rul.p10}~${h.payload.rul.p90}일` : ''}` })),
        links: [{ label: '설비 진단 상세', to: `/MNT-011?site=${top.target.siteId}&id=${top.target.equipmentId}` }]
      },
      top.confidence,
      top.target.siteId
    );
  }

  // AX effect.
  if (has(q, 'ax', '효과', '절감', 'roi', '회수')) {
    const p = periodFrom(q, 'thisYear');
    const l = await buildLedger(sites);
    const items = l.items.filter((i) => i.kind === '확정' || i.kind === '추정');
    const fromMonth = new Date(p.from).toISOString().slice(0, 7);
    const periodAmount = (i: (typeof items)[number]) => Object.entries(i.monthly).filter(([m]) => m >= fromMonth).reduce((x, [, v]) => x + v, 0);
    const inPeriod = items.reduce((a, i) => a + periodAmount(i), 0);
    const pb = l.payback.scope === 'site' ? '투자비와 회수 시점은 전사 기준으로만 계산합니다' : l.payback.month ? `회수 시점은 ${l.payback.month}${l.payback.projected ? '(예상)' : ''}입니다` : '아직 회수 시점을 예상할 수 없습니다';
    return result(
      question, 'axEffect',
      `${p.label} AX 효과는 ${mwon(inPeriod)} 백만 원(확정 + 추정, 시연용)입니다. 적용 후 누적은 ${mwon(l.totals.counted)} 백만 원이고 ${pb}.`,
      [],
      { params: { period: p.label, sites: siteText }, rows: items.map((i) => ({ label: `${i.title} (${i.kind})`, value: `${p.label} ${mwon(periodAmount(i))} · 누적 ${mwon(i.amount)} 백만 원` })), links: [{ label: 'AX 성과·ROI에서 근거 보기', to: `/EXE-020?site=${siteParam}` }] }
    );
  }

  // Claim → lots.
  if (has(q, '클레임', '반품') ) {
    const claims = (await loadClaims()).filter((c) => sites.includes(c.siteId) && c.stage !== '종결').sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1));
    if (!claims.length) return result(question, 'claimLots', `${siteText}에 처리 중인 클레임이 없습니다.`, [], { params: { sites: siteText }, links: [{ label: '클레임·로트 추적', to: `/QUA-030?site=${siteParam}` }] });
    const c = claims[0];
    return result(
      question, 'claimLots',
      `처리 중인 최근 클레임은 ${c.title}(${c.qty}개)입니다. 관련 로트는 ${c.lotIds.length}개입니다: ${c.lotIds.join(', ')}.`,
      [],
      { params: { sites: siteText }, rows: c.lotIds.map((id) => ({ label: id, value: '' })), links: [{ label: '클레임·로트 추적에서 보기', to: `/QUA-030?site=${c.siteId}&id=${c.id}` }] },
      0.95,
      c.siteId
    );
  }

  // Energy waste.
  if (has(q, '낭비', '누설', '압축공기', '비생산')) {
    const found = (await Promise.all(sites.map((s) => energyWaste(s)))).filter((x): x is NonNullable<typeof x> => !!x);
    if (!found.length) return result(question, 'energyWaste', `${siteText}에서 비생산 시간 에너지 낭비가 탐지되지 않았습니다.`, [], { params: { sites: siteText }, links: [{ label: '에너지 현황', to: `/ENG-010?site=${siteParam}` }] });
    const w = found[0];
    return result(
      question, 'energyWaste', `${w.target.label}: ${w.conclusion.replace(/\.$/, '')}. 월 ${(w.payload.monthlyCostKrw / 1e6).toFixed(1)} 백만 원 규모입니다(시연용).`, w.evidence,
      { params: { sites: siteText }, links: [{ label: '에너지 현황에서 보기', to: `/ENG-010?site=${w.target.siteId}` }] }, w.confidence, w.target.siteId
    );
  }

  // A metric value.
  const m = METRIC_WORDS.find(([ws]) => has(q, ...ws));
  if (m) {
    const id = m[1];
    const p = periodFrom(q, 'today');
    const scope = { siteIds: sites, from: p.from, to: p.to };
    const cur = await metric(id, scope);
    const cmp = comparisonOf({ key: p.key === 'last7' ? 'custom' : (p.key as PeriodKey), label: p.label, from: p.from, to: p.to });
    const prev = await metric(id, { ...scope, from: cmp.from, to: cmp.to });
    return result(
      question, 'metricValue', `${p.label} ${siteText} ${josa(METRICS[id].label, '은', '는')} ${fmt(id, cur)}입니다(${cmp.basis} ${fmt(id, prev)}).`, [],
      { params: { period: p.label, metric: METRICS[id].label, sites: siteText }, links: [{ label: '경영 현황', to: `/EXE-010?site=${siteParam}` }] }
    );
  }

  return result(question, null, '이 질문은 아직 지원하지 않습니다. 아래 형태의 질문을 해 보세요.', [], { params: {}, links: [], supported: SUPPORTED }, 0);
};
