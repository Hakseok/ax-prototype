// AX effect ledger (docs/roi-method.md). One function builds every effect item with its
// inputs, formula and assumptions; EXE-010, EXE-020, EXE-030 and the PDF read only this.
import { company } from '../../config';
import { costResolver, type CostOf } from '../costs';
import { getEnergy } from '../energy';
import { allClaims as loadClaims, allWorkOrders as loadWorkOrders, claimStore, workOrderStore } from '../workflows';
import type { WorkOrder } from '../types';
import { downtimeCost, METRICS } from '../metrics/catalog';
import { totalsOf } from '../metrics/oee';
import { getShifts, lineMap } from '../production';
import { DAY, GO_LIVE, NOW, addMonths, formatDate, parseTime, startOfMonth } from '../time';
import { decisionStore, energyWaste, recommend } from '../aiEngine';
import type { EffectClass } from '../../components/money';
import { versionStore } from '../versions';
import { baselinePeriod } from '../baseline';
import { recentWindow } from '../period';

export interface EffectInput {
  label: string;
  value: number;
  unit: string;
  note?: string;
}

export interface EffectItem {
  id: string;
  title: string;
  kind: EffectClass | '근거' | '제외';
  /** Won over the ledger period. Evidence-only and excluded items carry their figure but are not added. */
  amount: number;
  formula: string;
  inputs: EffectInput[];
  assumptions: string[];
  overlap?: string;
  source: { label: string; to: string };
  /** Monthly amounts (YYYY-MM -> won) for charts and payback. */
  monthly: Record<string, number>;
  /** Progress of a potential item, e.g. 채택됨 · 실행 전 (D-69). */
  status?: string;
}

export interface Ledger {
  siteIds: string[];
  from: number;
  to: number;
  items: EffectItem[];
  totals: { confirmed: number; estimated: number; potential: number; counted: number };
  investment: { items: { id: string; name: string; amountKrw: number; date: string }[]; total: number; monthlyOperating: number };
  /** Cumulative net effect by month since go-live (counted − operating cost). */
  cumulative: { month: string; effect: number; operating: number; net: number; projected?: boolean }[];
  /** Investment is company-wide, so payback and ROI are computed for the company scope only. */
  payback: { month: string | null; projected: boolean; roi: number; scope: 'company' | 'site' };
}

const months = (from: number, to: number) => {
  const out: [string, number, number][] = [];
  for (let t = startOfMonth(from); t < to; t = addMonths(t, 1)) out.push([formatDate(t).slice(0, 7), Math.max(t, from), Math.min(addMonths(t, 1), to)]);
  return out;
};

/** Rate per planned production hour in the baseline vs a period, both production-normalized. */
const perPptHour = async (siteIds: string[], from: number, to: number, pick: (t: ReturnType<typeof totalsOf>) => number) => {
  const t = totalsOf(await getShifts({ siteIds, from, to }), await lineMap());
  return { value: t.pptMin ? pick(t) / (t.pptMin / 60) : 0, pptHours: t.pptMin / 60, totals: t };
};

/** Effect items of one site. Company ledgers add site ledgers so the company equals the sum of sites. */
const siteItems = async (siteId: string, from: number, to: number): Promise<EffectItem[]> => {
  const { from: BASELINE_FROM, to: BASELINE_TO } = baselinePeriod();
  const siteIds = [siteId];
  const cost = await costResolver();
  const lines = await lineMap();
  const items: EffectItem[] = [];
  const periodMonths = months(Math.max(from, GO_LIVE), to);
  const scope = (f: number, t: number) => ({ siteIds, from: f, to: t });

  // 1. Breakdown reduction (확정): baseline breakdown share of planned time vs now, priced by D-18.
  {
    const base = await perPptHour(siteIds, BASELINE_FROM, BASELINE_TO, (t) => t.loss.breakdown);
    const monthly: Record<string, number> = {};
    let hoursSaved = 0;
    for (const [m, a, b] of periodMonths) {
      const cur = await perPptHour(siteIds, a, b, (t) => t.loss.breakdown);
      const saved = (base.value - cur.value) * cur.pptHours; // breakdown minutes avoided this month
      hoursSaved += saved / 60;
      // Price the avoided minutes like the actual downtime of the month (same line mix).
      const actualMin = cur.totals.loss.breakdown;
      const actualCost = await downtimeCost(scope(a, b), (r) => r.breakdownMin);
      monthly[m] = actualMin > 0 ? (saved * actualCost) / actualMin : 0;
    }
    const pmCost = await extraMaintenanceCost(siteIds, from, to, cost);
    const gross = Object.values(monthly).reduce((x, y) => x + y, 0);
    items.push({
      id: 'fx.breakdown',
      title: '고장 정지 감소',
      kind: '확정',
      amount: gross - pmCost,
      formula: '(기준선 고장 정지 비율 − 현재 비율) × 현재 계획 가동 시간 × 정지 단가 − 늘어난 예지 정비 비용',
      inputs: [
        { label: '기준선 고장 정지', value: round1(base.value), unit: '분/계획 가동 1시간', note: `${formatDate(BASELINE_FROM)}~${formatDate(BASELINE_TO - DAY)}` },
        { label: '줄어든 고장 정지', value: round1(hoursSaved), unit: '시간' },
        { label: '예지 정비 비용', value: Math.round(pmCost / 1000), unit: '천 원' }
      ],
      assumptions: [
        '정지 단가: 납기 제약 라인(김해 도장, 화성 조립)은 시간당 공헌이익, 그 밖의 라인은 투입 인원 × 잔업 단가로 만회 비용만 센다 (D-18)',
        '생산량 변화는 계획 가동 시간당 비율로 보정했다',
        '정지 1시간의 값은 해당 월 실제 정지의 라인 구성으로 가중했다'
      ],
      overlap: '예지 정비 사례(아래 근거 항목)는 이 금액 안에 이미 들어 있으므로 더하지 않는다',
      source: { label: 'OEE·손실 분석', to: '/OPS-020' },
      monthly: subtractEvenly(monthly, pmCost)
    });
  }

  // 1-a. Predictive maintenance cases (근거): avoided downtime per case, not added — the measured
  // breakdown reduction above already contains them. Orders confirmed within the last 30 days have
  // no measured period after them yet; they go to 1-b instead (D-47).
  const pdmOrders = (await loadWorkOrders()).filter(
    (o) => o.type === '예지' && o.avoidedDowntimeMin && siteIds.includes(o.siteId) && o.completedAt && parseTime(o.completedAt) >= from && parseTime(o.completedAt) <= to
  );
  const unmeasured = (o: WorkOrder) => o.stage === '효과 확인' && parseTime(o.completedAt!) > to - PDM_MEASURE_DAYS * DAY;
  const avoidedWon = (o: WorkOrder) => {
    const line = lines.get(o.lineId);
    const perHour = line ? (line.constrained ? cost(`lineLoss.${line.id}`) : line.crew * cost('overtimeLaborKrwPerHour')) : 0;
    return (o.avoidedDowntimeMin! / 60) * perHour;
  };
  {
    const orders = pdmOrders.filter((o) => !unmeasured(o) && parseTime(o.completedAt!) < to);
    let amount = 0;
    const inputs: EffectInput[] = [];
    for (const o of orders) {
      const won = avoidedWon(o);
      amount += won;
      inputs.push({ label: `${o.id} ${o.title}`, value: Math.round(won / 1000), unit: '천 원', note: `피한 정지 ${o.avoidedDowntimeMin}분 (같은 고장 유형 과거 정지 시간의 중앙값)` });
    }
    items.push({
      id: 'fx.pdm.cases', title: '예지 정비로 피한 고장 (사례)', kind: '근거', amount, formula: '사례별 피한 정지 시간 × 정지 단가', inputs,
      assumptions: ['피한 정지 시간은 보수적으로 같은 고장 유형의 중앙값을 썼다'], overlap: '고장 정지 감소(확정)에 포함되어 합계에 더하지 않는다',
      source: { label: '설비 건전성', to: '/MNT-010' }, monthly: {}
    });
  }

  // 1-b. Predictive orders not yet measured (추정): avoided downtime × stop cost.
  {
    const orders = pdmOrders.filter(unmeasured);
    if (orders.length) {
      const monthly: Record<string, number> = {};
      const inputs: EffectInput[] = [];
      for (const o of orders) {
        const won = avoidedWon(o);
        const m = o.completedAt!.slice(0, 7);
        monthly[m] = (monthly[m] ?? 0) + won;
        inputs.push({ label: `${o.id} ${o.title}`, value: Math.round(won / 1000), unit: '천 원', note: `피한 정지 ${o.avoidedDowntimeMin}분 · 효과 확인 ${o.log.slice(-1)[0]?.at.slice(0, 10) ?? ''}` });
      }
      items.push({
        id: 'fx.pdm.recent', title: '예지 정비로 피할 고장 (측정 전)', kind: '추정', amount: sum(monthly), formula: '건별 피한 정지 시간 × 정지 단가', inputs,
        assumptions: [
          `효과 확인 후 ${PDM_MEASURE_DAYS}일이 지나지 않아 고장 정지 실적에 아직 나타나지 않은 건만 넣는다`,
          '피한 정지 시간은 효과 확인 때 기록한 값이다. 기본값은 AI 예상 영향의 하한(없으면 같은 설비 과거 고장 정지 시간의 중앙값)',
          '고장 후 수리에도 같은 부품·작업이 들므로 정비 비용은 늘어난 비용으로 보지 않는다. 고장 때 생길 2차 손상과 긴급 수리비는 세지 않는다',
          `${PDM_MEASURE_DAYS}일이 지나면 고장 정지 감소(확정)의 측정값으로 옮겨 가고 이 항목에서 빠진다`
        ],
        overlap: '고장 정지 감소(확정)는 측정 기간의 실적이라 이 건들과 겹치지 않는다',
        source: { label: '설비 건전성', to: '/MNT-010' }, monthly
      });
    }
  }

  // 2. Performance losses (확정): minor stops and speed, priced as overtime to recover.
  {
    const base = await perPptHour(siteIds, BASELINE_FROM, BASELINE_TO, (t) => t.loss.minorStop + t.loss.speed);
    const monthly: Record<string, number> = {};
    let saved = 0;
    for (const [m, a, b] of periodMonths) {
      const cur = await perPptHour(siteIds, a, b, (t) => t.loss.minorStop + t.loss.speed);
      const minutes = (base.value - cur.value) * cur.pptHours;
      saved += minutes / 60;
      const crewHours = await crewWeightedHours(siteIds, a, b, minutes);
      monthly[m] = crewHours * cost('overtimeLaborKrwPerHour', a);
    }
    items.push({
      id: 'fx.performance', title: '소정지·속도 저하 감소', kind: '확정', amount: sum(monthly),
      formula: '(기준선 성능 손실 비율 − 현재) × 현재 계획 가동 시간 × 투입 인원 × 잔업 단가',
      inputs: [{ label: '줄어든 성능 손실', value: round1(saved), unit: '시간' }, { label: '잔업 단가', value: cost('overtimeLaborKrwPerHour'), unit: '원/시간' }],
      assumptions: ['성능 손실은 잔업으로 만회했다고 보는 보수적 환산이다'], source: { label: 'OEE·손실 분석', to: '/OPS-020' }, monthly
    });
  }

  // 3. Process defects (확정): baseline defect rate vs now × output × unit defect cost.
  {
    const baseRecs = await getShifts(scope(BASELINE_FROM, BASELINE_TO));
    const baseT = totalsOf(baseRecs, lines);
    const baseRate = baseT.totalQty ? (baseT.totalQty - baseT.goodQty) / baseT.totalQty : 0;
    const baseByProduct = new Map<string, [number, number]>();
    for (const r of baseRecs) {
      const x = baseByProduct.get(r.productId) ?? [0, 0];
      baseByProduct.set(r.productId, [x[0] + r.totalQty - r.goodQty, x[1] + r.totalQty]);
    }
    const monthly: Record<string, number> = {};
    let units = 0;
    for (const [m, a, b] of periodMonths) {
      const recs = await getShifts(scope(a, b));
      // Per product: baseline rate of that product vs now, priced with its own unit cost.
      const byProduct = new Map<string, { total: number; defects: number; scrap: number; rework: number }>();
      for (const r of recs) {
        const p = byProduct.get(r.productId) ?? { total: 0, defects: 0, scrap: 0, rework: 0 };
        p.total += r.totalQty;
        p.defects += r.totalQty - r.goodQty;
        p.scrap += r.scrapQty;
        p.rework += r.reworkQty;
        byProduct.set(r.productId, p);
      }
      let won = 0;
      for (const [pid, p] of byProduct) {
        const bp = baseByProduct.get(pid);
        const pb = bp && bp[1] ? bp[0] / bp[1] : baseRate;
        const avoided = Math.max(0, pb * p.total - p.defects);
        units += avoided;
        const scrapShare = p.defects ? p.scrap / p.defects : 0.6;
        won += avoided * (scrapShare * (cost(`material.${pid}`, a) + cost(`conversion.${pid}`, a)) + (1 - scrapShare) * cost(`rework.${pid}`, a));
      }
      monthly[m] = won;
    }
    const adopted = Object.entries(decisionStore.get()).filter(([, d]) => d.value === '채택').length;
    items.push({
      id: 'fx.defect', title: '공정 불량 감소', kind: '확정', amount: sum(monthly),
      formula: 'Σ제품 (기준선 불량률 − 현재 불량률) × 현재 총생산 × 불량 단가(폐기: 재료비+가공비, 재작업: 재작업비)',
      inputs: [{ label: '기준선 불량률', value: round1(baseRate * 1e6), unit: 'PPM' }, { label: '줄어든 불량', value: Math.round(units), unit: '개' }],
      assumptions: ['제품별 기준선 불량률을 써서 제품 구성 변화를 보정했다', '불량률이 기준선보다 나빠진 제품은 0으로 둔다(음수 효과를 다른 제품과 상계하지 않음)'],
      overlap: adopted ? `화면에서 채택한 AI 권장 조건 ${adopted}건의 효과는 이 항목에 포함된다` : 'AI 권장 조건(잠재)을 채택해 개선되면 이 항목에 반영된다',
      source: { label: '품질 원인 분석', to: '/QUA-020' }, monthly
    });
  }

  // 4. Customer claims (추정): too few cases for a measured effect.
  {
    const claims = (await loadClaims()).filter((c) => siteIds.includes(c.siteId));
    const perMonth = (a: number, b: number) => claims.filter((c) => parseTime(c.receivedAt) >= a && parseTime(c.receivedAt) < b).reduce((x, c) => x + c.costKrw, 0) / ((b - a) / (30 * DAY));
    const base = perMonth(BASELINE_FROM, BASELINE_TO);
    const monthly: Record<string, number> = {};
    for (const [m, a, b] of periodMonths) monthly[m] = Math.max(0, base * ((b - a) / (30 * DAY)) - claims.filter((c) => parseTime(c.receivedAt) >= a && parseTime(c.receivedAt) < b).reduce((x, c) => x + c.costKrw, 0));
    items.push({
      id: 'fx.claim', title: '고객 클레임 감소', kind: '추정', amount: sum(monthly), formula: '기준선 월평균 클레임 비용 − 해당 월 클레임 비용 (0 미만은 0)',
      inputs: [{ label: '기준선 월평균 클레임 비용', value: Math.round(base / 1000), unit: '천 원' }],
      assumptions: ['클레임은 건수가 적어 통계적으로 확정하기 어려워 추정으로 둔다'], source: { label: '클레임·로트 추적', to: '/QUA-030' }, monthly
    });
  }

  // 5. Energy (확정): baseline model kWh per good unit and idle kW vs now.
  {
    const kwhPerUnitBase = (await METRICS['energy.kwhPerUnit'].compute(scope(BASELINE_FROM, BASELINE_TO))) ?? 0;
    const monthly: Record<string, number> = {};
    let kwh = 0;
    for (const [m, a, b] of periodMonths) {
      const [e, good] = await Promise.all([getEnergy({ siteIds, from: a, to: b, source: 'electricity' }), METRICS['production.good'].compute(scope(a, b))]);
      const expected = kwhPerUnitBase * (good ?? 0);
      const saved = Math.max(0, expected - e.total);
      kwh += saved;
      monthly[m] = saved * cost('electricityKrwPerKwh', a);
    }
    items.push({
      id: 'fx.energy', title: '에너지 절감', kind: '확정', amount: sum(monthly), formula: '(기준선 전력 원단위 × 현재 양품 − 실제 전력) × 전력 단가',
      inputs: [{ label: '기준선 전력 원단위', value: Math.round(kwhPerUnitBase * 1000) / 1000, unit: 'kWh/개' }, { label: '줄어든 전력', value: Math.round(kwh), unit: 'kWh' }],
      assumptions: ['기준선 기간의 생산량당 전력으로 예상 사용량을 만들고 실제와 비교했다(측정·검증의 일반 방식)', '압축공기는 압축기 전력으로 이미 포함된다'],
      overlap: '비생산 시간 낭비가 새로 생긴 사업장은 그만큼 이 항목이 줄어든다', source: { label: '에너지 현황', to: '/ENG-010' }, monthly
    });
  }

  // 6. Potential (잠재): open AI proposals not yet adopted and acted on.
  {
    const potentials: EffectItem[] = [];
    const waste = await Promise.all(siteIds.map((s) => energyWaste(s)));
    for (const w of waste) {
      if (!w || w.decision?.value === '기각') continue;
      const m = w.payload.monthlyCostKrw;
      potentials.push({
        id: `fx.potential.energy.${w.target.siteId}`, title: `${w.target.label} 비생산 시간 낭비 제거`, kind: '잠재', amount: m * 12,
        formula: '늘어난 비생산 시간 사용량 × 월 비생산 시간 × 단가 × 12개월', inputs: [{ label: '월 낭비 금액', value: Math.round(m / 1000), unit: '천 원' }],
        assumptions: ['누설을 고치면 기준 기간 수준으로 돌아간다고 본다', '채택·조치 전이라 합계에 넣지 않는다'], source: { label: '에너지 현황', to: `/ENG-010?site=${w.target.siteId}` }, monthly: {}
      });
    }
    const sc02 = siteIds.includes('GMH') ? await recommend({ siteIds: ['GMH'], productId: 'HG-FBC-410', lineId: 'GMH-IM1', ...recentWindow(14) }) : null;
    if (sc02 && sc02.decision?.value !== '기각') {
      potentials.push({
        id: 'fx.potential.defect.GMH-IM1', title: '범퍼 커버 권장 조건 적용', kind: '잠재', amount: sc02.payload.monthlySavingKrw * 12,
        formula: '(현재 불량률 − 권장 조건 불량률) × 월 생산량 × 불량 단가 × 12개월',
        inputs: [{ label: '월 불량 감소', value: sc02.payload.monthlyDefectReduction, unit: '개' }, { label: '월 절감', value: Math.round(sc02.payload.monthlySavingKrw / 1000), unit: '천 원' }],
        assumptions: [
          '권장 조건 범위 안에서 생산한 과거 로트의 불량률을 기대값으로 썼다',
          ...(sc02.decision?.value === '채택' ? [`${sc02.decision.at.replace('T', ' ')} 채택. 현장에 적용하고 불량률이 측정되면 공정 불량 감소(확정)로 옮겨 가고 잠재에서 빠진다`] : [])
        ],
        source: { label: '품질 원인 분석', to: '/QUA-020?site=GMH' }, monthly: {},
        status: sc02.decision?.value === '채택' ? '채택됨 · 실행 전' : undefined
      });
    }
    items.push(...potentials);
  }

  return items;
};

/** Days after an effect check during which a predictive order counts as not yet measured (D-47). */
export const PDM_MEASURE_DAYS = 30;

const SITE_NAMES = new Map(company.sites.map((s) => [s.id, s.name]));
const ADDITIVE_UNITS = new Set(['시간', '개', 'kWh', '천 원']);

/** Add the same effect item of several sites: amounts and months add up, inputs are listed per site. */
const mergeItems = (perSite: [string, EffectItem[]][]): EffectItem[] => {
  if (perSite.length === 1) return perSite[0][1];
  const byId = new Map<string, EffectItem>();
  for (const [siteId, list] of perSite) {
    for (const item of list) {
      const cur = byId.get(item.id);
      const inputs = item.inputs.map((i) => ({ ...i, label: `${SITE_NAMES.get(siteId)} · ${i.label}` }));
      if (!cur) {
        byId.set(item.id, { ...item, inputs, monthly: { ...item.monthly } });
        continue;
      }
      cur.amount += item.amount;
      cur.inputs.push(...inputs);
      for (const [m, v] of Object.entries(item.monthly)) cur.monthly[m] = (cur.monthly[m] ?? 0) + v;
    }
  }
  // A total row per additive input label, after the site rows.
  for (const item of byId.values()) {
    const sums = new Map<string, EffectInput>();
    for (const i of item.inputs) {
      if (!ADDITIVE_UNITS.has(i.unit)) continue;
      const label = i.label.split(' · ').slice(1).join(' · ');
      const s = sums.get(label) ?? { label: `합계 · ${label}`, value: 0, unit: i.unit };
      s.value = Math.round((s.value + i.value) * 10) / 10;
      sums.set(label, s);
    }
    item.inputs.push(...sums.values());
  }
  return [...byId.values()];
};

const ledgerMemo = new Map<string, Promise<Ledger>>();

/** Ledger for the sites and period; recomputed when unit costs or AI decisions change. */
/** Items that make up the monthly saving card (energy + quality losses), confirmed and estimated. */
export const SAVING_ITEMS = ['fx.energy', 'fx.defect', 'fx.claim'];

export const buildLedger = (siteIds: string[], from = GO_LIVE, to = NOW): Promise<Ledger> => {
  const key = [siteIds.join(','), from, to, JSON.stringify(versionStore.get()), JSON.stringify(decisionStore.get()), JSON.stringify(workOrderStore.get()), JSON.stringify(claimStore.get())].join('|');
  if (!ledgerMemo.has(key)) ledgerMemo.set(key, computeLedger(siteIds, from, to));
  return ledgerMemo.get(key)!;
};

const computeLedger = async (siteIds: string[], from: number, to: number): Promise<Ledger> => {
  const perSite = await Promise.all(siteIds.map(async (s) => [s, await siteItems(s, from, to)] as [string, EffectItem[]]));
  const items = mergeItems(perSite);

  // Excluded (제외): changes not caused by AX.
  if (siteIds.includes('ASN')) {
    items.push({
      id: 'fx.excluded.press2', title: '트랜스퍼 프레스 2라인 금형 교체', kind: '제외', amount: 0, formula: '-', inputs: [],
      assumptions: ['2026-06 신규 금형 투입으로 생긴 변화는 AX 효과가 아니므로 원장에서 제외한다 (가상 사례)'], source: { label: '비가동 이력', to: '/OPS-050' }, monthly: {}
    });
  }
  const by = (k: EffectItem['kind']) => items.filter((i) => i.kind === k).reduce((a, i) => a + i.amount, 0);
  const totals = { confirmed: by('확정'), estimated: by('추정'), potential: by('잠재'), counted: by('확정') + by('추정') };

  const inv = company.ax.investment;
  const investment = { items: inv.items, total: inv.items.reduce((a, i) => a + i.amountKrw, 0), monthlyOperating: inv.monthlyOperatingKrw };
  const companyScope = siteIds.length === company.sites.length;
  // Operating cost, like the investment, is company-wide: a single site's ledger does not carry it.
  const operating = companyScope ? investment.monthlyOperating : 0;
  const cumulative: Ledger['cumulative'] = [];
  let acc = 0;
  for (const [m] of months(GO_LIVE, NOW)) {
    const effect = items.filter((i) => i.kind === '확정' || i.kind === '추정').reduce((a, i) => a + (i.monthly[m] ?? 0), 0);
    acc += effect - operating;
    cumulative.push({ month: m, effect, operating, net: acc });
  }
  let paybackMonth = companyScope ? cumulative.find((c) => c.net >= investment.total)?.month ?? null : null;
  let projected = false;
  if (companyScope && !paybackMonth && cumulative.length >= 4) {
    // Not yet paid back: extend with the average net gain of the last three months.
    const n = cumulative.length;
    const avg = (cumulative[n - 1].net - cumulative[n - 4].net) / 3;
    if (avg > 0) {
      projected = true;
      let t = addMonths(parseTime(`${cumulative[n - 1].month}-01`), 1);
      let net = cumulative[n - 1].net;
      for (let i = 0; i < 48 && net < investment.total; i++) {
        net += avg;
        const month = formatDate(t).slice(0, 7);
        cumulative.push({ month, effect: avg + investment.monthlyOperating, operating: investment.monthlyOperating, net, projected: true });
        if (net >= investment.total) paybackMonth = month;
        t = addMonths(t, 1);
      }
    }
  }
  const lastActual = [...cumulative].reverse().find((c) => !c.projected);
  return {
    siteIds, from, to, items, totals, investment, cumulative,
    payback: {
      month: paybackMonth,
      projected,
      roi: companyScope && lastActual ? (lastActual.net - investment.total) / investment.total : Number.NaN,
      scope: companyScope ? 'company' : 'site'
    }
  };
};

const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
const round1 = (x: number) => Math.round(x * 10) / 10;
const subtractEvenly = (m: Record<string, number>, total: number) => {
  const keys = Object.keys(m);
  return Object.fromEntries(keys.map((k) => [k, m[k] - total / Math.max(1, keys.length)]));
};

/** Crew-weighted hours: each line's share of performance-loss minutes times its crew. */
const crewWeightedHours = async (siteIds: string[], from: number, to: number, minutes: number) => {
  const recs = await getShifts({ siteIds, from, to });
  const lines = await lineMap();
  let w = 0;
  let n = 0;
  for (const r of recs) {
    w += lines.get(r.lineId)!.crew * r.calendarMin;
    n += r.calendarMin;
  }
  return (minutes / 60) * (n ? w / n : 0);
};

/** Extra maintenance cost of predictive orders (labor and parts) in the period. */
const extraMaintenanceCost = async (siteIds: string[], from: number, to: number, cost: CostOf) =>
  (await loadWorkOrders())
    .filter((o) => o.type === '예지' && siteIds.includes(o.siteId) && o.completedAt && parseTime(o.completedAt) >= from && parseTime(o.completedAt) < to)
    .reduce((a, o) => a + o.laborHours * cost('maintenanceLaborKrwPerHour') + o.partsKrw, 0);
