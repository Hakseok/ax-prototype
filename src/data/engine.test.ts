// Step 4: metrics, the virtual AI engine and the ROI ledger.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { setJsonReader } from './reader';
import { METRICS, metric } from './metrics/catalog';
import { oeeOf, totalsOf } from './metrics/oee';
import { getShifts, lineMap } from './production';
import { comparisonOf, periodOf, recentWindow } from './period';
import { aiHistory, energyWaste, health, healthOverview, recommend, rootCause } from './aiEngine';
import { buildLedger } from './roi/ledger';
import { EXAMPLE_QUESTIONS, answer } from './assistant';
import { DAY, parseTime } from './time';

const MOCK = path.resolve(__dirname, '../../public/mock');
const SITES = ['ASN', 'GMH', 'DGU', 'HWS'];

beforeAll(() => {
  setJsonReader(async (p) => JSON.parse(fs.readFileSync(path.join(MOCK, p), 'utf8')));
});

describe('지표', () => {
  it('OEE = 가용성 × 성능 × 품질', async () => {
    const p = periodOf('thisMonth');
    const t = totalsOf(await getShifts({ siteIds: SITES, from: p.from, to: p.to }), await lineMap());
    const o = oeeOf(t);
    expect(o.oee!).toBeCloseTo(o.availability! * o.performance! * o.quality!, 6);
  });

  it('전사 OEE는 사업장 값의 시간 가중이고, 금액 지표는 합이다', async () => {
    const p = periodOf('thisMonth');
    const scope = { siteIds: SITES, from: p.from, to: p.to };
    const lines = await lineMap();
    let full = 0;
    let ppt = 0;
    let cost = 0;
    for (const s of SITES) {
      const t = totalsOf(await getShifts({ ...scope, siteIds: [s] }), lines);
      full += t.fullyProductiveMin;
      ppt += t.pptMin;
      cost += (await metric('loss.downtimeCost', { ...scope, siteIds: [s] }))!;
    }
    expect((await metric('oee', scope))!).toBeCloseTo(full / ppt, 9);
    expect((await metric('loss.downtimeCost', scope))!).toBeCloseTo(cost, 3);
  });

  it('비교 기간: 오늘은 전일 같은 시각, 이번 달은 전월 같은 경과일', () => {
    const today = periodOf('today');
    const c = comparisonOf(today);
    expect(c.to - c.from).toBe(today.to - today.from);
    expect(today.from - c.from).toBe(DAY);
    const month = comparisonOf(periodOf('thisMonth'));
    expect(month.from).toBe(parseTime('2026-08-01'));
    expect(month.to).toBe(parseTime('2026-08-30T14:30'));
  });

  it('비교 기간 증감은 진행 중 교대 때문에 한쪽으로 기울지 않는다', async () => {
    const today = periodOf('today');
    const c = comparisonOf(today);
    const cur = (await metric('production.planned', { siteIds: SITES, from: today.from, to: today.to }))!;
    const prev = (await metric('production.planned', { siteIds: SITES, from: c.from, to: c.to }))!;
    expect(Math.abs(cur / prev - 1)).toBeLessThan(0.06);
  });

  it('지표 사전의 모든 지표가 값을 낸다', async () => {
    const p = periodOf('thisMonth');
    for (const id of Object.keys(METRICS).filter((k) => !['ax.effect', 'mnt.health'].includes(k))) {
      const v = await metric(id, { siteIds: SITES, from: p.from, to: p.to });
      expect(v, id).not.toBeNull();
    }
  });
});

describe('가상 AI 엔진', () => {
  it('SC-01: 아산 메인 프레스 건전성 주의, 잔여수명 구간이 있다', async () => {
    const r = (await health('ASN-PR1-M01'))!;
    expect(r.payload.index).toBeLessThan(70);
    expect(r.payload.index).toBeGreaterThan(45);
    expect(r.payload.failureMode).toBe('베어링 마모');
    expect(r.payload.rul).not.toBeNull();
    expect(r.payload.rul!.p10).toBeLessThan(r.payload.rul!.p50);
    expect(r.payload.rul!.p50).toBeLessThan(r.payload.rul!.p90);
    expect(r.evidence[0].label).toMatch(/진동|온도/);
  });

  it('건전한 설비는 정상 범위로 나오고 결과가 결정적이다', async () => {
    const a = (await health('ASN-PR1-M02'))!;
    const b = (await health('ASN-PR1-M02'))!;
    expect(a.payload.index).toBeGreaterThan(85);
    expect(a).toEqual(b);
  });

  it('SC-02: 범퍼 불량 원인 1순위는 금형 고정측 온도 편차, 건조 시간도 후보에 있고 4호기가 관련 집단이다', async () => {
    const q = { siteIds: ['GMH'], productId: 'HG-FBC-410', lineId: 'GMH-IM1', ...recentWindow(14) };
    const r = (await rootCause(q))!;
    expect(r.payload.candidates[0].variable).toBe('moldTempFixed:spread');
    expect(r.payload.candidates.slice(1, 4).map((c) => c.variable)).toContain('dryingTime');
    expect(r.payload.groups.some((g) => g.value === 'GMH-IM1-M04')).toBe(true);
    const rec = (await recommend(q))!;
    expect(rec.payload.expectedRate).toBeLessThan(rec.payload.currentRate);
    expect(rec.payload.monthlySavingKrw).toBeGreaterThan(0);
  });

  it('SC-04: 화성 압축공기 비생산 시간 낭비가 탐지되고 김해는 탐지되지 않는다', async () => {
    const hws = (await energyWaste('HWS'))!;
    expect(hws.payload.increasePerHour).toBeGreaterThan(30);
    expect(await energyWaste('GMH')).toBeNull();
  });

  it('SC-08: 도장 건조로 오탐은 사유와 함께 기각되어 이력에 남아 있다', async () => {
    const r = (await aiHistory()).find((x) => x.scenario === 'SC-08')!;
    expect(r.decision?.value).toBe('기각');
    expect(r.decision?.reason).toMatch(/센서/);
  });

  it('위험 설비 목록은 건전성이 낮은 순서다', async () => {
    const list = await healthOverview(['ASN']);
    expect(list[0].target.equipmentId).toBe('ASN-PR1-M01');
  });
});

describe('AX 효과 원장', () => {
  it('합계 = 확정 + 추정, 잠재와 근거는 합계에 넣지 않는다', async () => {
    const l = await buildLedger(SITES);
    const confirmed = l.items.filter((i) => i.kind === '확정').reduce((a, i) => a + i.amount, 0);
    const estimated = l.items.filter((i) => i.kind === '추정').reduce((a, i) => a + i.amount, 0);
    expect(l.totals.counted).toBeCloseTo(confirmed + estimated, 3);
    expect(l.items.some((i) => i.kind === '근거')).toBe(true);
    expect(l.totals.confirmed).toBeGreaterThan(0);
    expect(l.payback.month).not.toBeNull();
  });

  it('전사 원장 = 사업장 원장의 합 (확정·추정)', async () => {
    const all = await buildLedger(SITES);
    let sum = 0;
    for (const s of SITES) sum += (await buildLedger([s])).totals.counted;
    // Monthly pricing is per scope, so allow a small rounding gap.
    expect(Math.abs(all.totals.counted - sum) / sum).toBeLessThan(0.02);
  });
});

describe('AI 도우미 질의 해석', () => {
  it('예시 질문은 모두 의도와 근거 링크를 가진 답을 낸다', async () => {
    for (const q of EXAMPLE_QUESTIONS) {
      const a = await answer(q, SITES);
      expect(a.payload.intent, q).not.toBeNull();
      expect(a.payload.links.length, q).toBeGreaterThan(0);
    }
  });

  it('같은 질문에는 같은 답, 지원하지 않는 질문에는 지원 범위 안내', async () => {
    expect(await answer('정비가 필요한 설비는?', SITES)).toEqual(await answer('정비가 필요한 설비는?', SITES));
    const a = await answer('내일 날씨 어때?', SITES);
    expect(a.payload.intent).toBeNull();
    expect(a.payload.supported!.length).toBeGreaterThan(3);
  });

  it('OEE가 가장 낮은 라인 질문은 라인 OEE 순위와 손실 항목으로 답한다', async () => {
    const a = await answer('이번 달 OEE가 가장 낮은 라인과 이유는?', SITES);
    expect(a.conclusion).toMatch(/라인/);
    expect(a.payload.rows!.length).toBeGreaterThan(2);
  });
});

export { parseTime };
