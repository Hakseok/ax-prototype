// Step 6: OEE·loss analysis, maintenance flow and claim tracing agree with the executive screens.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { setJsonReader } from './reader';
import { metric } from './metrics/catalog';
import { lossAnalysis } from './lossAnalysis';
import { avoidedDowntimeEstimate, healthTable } from './maintenance';
import { periodOf } from './period';
import { buildLedger } from './roi/ledger';
import { traceClaim } from './traceability';
import { allClaims, allWorkOrders, workOrderActions, workOrderStore } from './workflows';

const MOCK = path.resolve(__dirname, '../../public/mock');
const SITES = ['ASN', 'GMH', 'DGU', 'HWS'];

beforeAll(() => {
  setJsonReader(async (p) => JSON.parse(fs.readFileSync(path.join(MOCK, p), 'utf8')));
});

describe('OEE·손실 분석', () => {
  it('OEE와 비가동 손실 금액이 경영 현황 지표와 같다', async () => {
    const p = periodOf('thisMonth');
    const scope = { siteIds: SITES, from: p.from, to: p.to };
    const a = await lossAnalysis(scope, 'company');
    expect(a.total.oee).toBeCloseTo((await metric('oee', scope))!, 9);
    expect(a.total.money.breakdown + a.total.money.changeover).toBeCloseTo((await metric('loss.downtimeCost', scope))!, 0);
    // Company = sum of sites
    expect(a.children.reduce((s, r) => s + r.lossKrw, 0)).toBeCloseTo(a.total.lossKrw, 0);
  });

  it('SC-03 대구 가공 라인: 소정지·속도 저하가 고장보다 크다', async () => {
    const p = periodOf('thisMonth');
    const a = await lossAnalysis({ siteIds: ['DGU'], from: p.from, to: p.to, lineIds: ['DGU-MC1'] }, 'line');
    const t = a.total.loss;
    expect(t.minorStop + t.speed).toBeGreaterThan(t.breakdown);
    expect(a.children.length).toBeGreaterThan(0);
  });
});

describe('설비 정비 흐름', () => {
  it('SC-01 요청 → 승인 → 작업 → 완료 → 효과 확인이 AX 효과(추정)에 반영된다', async () => {
    workOrderStore.reset();
    const before = await buildLedger(SITES);
    const wo = (await allWorkOrders()).find((o) => o.id === 'WO-260922-5055')!;
    expect(wo.stage).toBe('요청');
    const est = await avoidedDowntimeEstimate(wo.equipmentId);
    expect(est.minutes).toBeGreaterThan(0);
    workOrderActions.approve(wo, 'u-plant-asn');
    workOrderActions.start((await allWorkOrders()).find((o) => o.id === wo.id)!, 'u-me');
    workOrderActions.complete((await allWorkOrders()).find((o) => o.id === wo.id)!, 'u-me', 10, 6_000_000, '베어링 교체');
    workOrderActions.confirmEffect((await allWorkOrders()).find((o) => o.id === wo.id)!, 'u-me', est.minutes, '진동·온도 정상 복귀');
    const done = (await allWorkOrders()).find((o) => o.id === wo.id)!;
    expect(done.stage).toBe('효과 확인');
    expect(done.log.map((l) => l.action)).toEqual(['요청', '승인', '작업 시작', '완료', '효과 확인']);
    const after = await buildLedger(SITES);
    const item = after.items.find((i) => i.id === 'fx.pdm.recent')!;
    expect(item.kind).toBe('추정');
    expect(item.amount).toBeGreaterThan(0);
    expect(after.totals.estimated - before.totals.estimated).toBeCloseTo(item.amount, 0);
    expect(after.totals.confirmed).toBeCloseTo(before.totals.confirmed, 0);
    console.log('avoided', est, 'item', Math.round(item.amount / 1000), '천 원', 'before', Math.round(before.totals.counted / 1e5) / 10, 'after', Math.round(after.totals.counted / 1e5) / 10);
    workOrderStore.reset();
  });

  it('설비 건전성 표: 위험 설비가 먼저, 진행 중인 정비가 연결된다', async () => {
    const rows = await healthTable(SITES);
    expect(rows[0].id).toBe('ASN-PR1-M01');
    expect(rows[0].level).toBe('warning');
    expect(rows[0].openOrder).toBe('WO-260922-5055');
  });
});

describe('클레임 역추적', () => {
  it('SC-05 고객사 B 클레임: 같은 용접건, 전극 팁 타점, 출하 범위', async () => {
    const claim = (await allClaims()).find((c) => c.id === 'CLM-260928-01')!;
    const t = (await traceClaim(claim))!;
    expect(t.claimLots).toHaveLength(3);
    expect(t.factors.find((f) => f.field === 'equipmentId')!.value).toBe('ASN-WD1-M07');
    console.log('params', t.params.map((p) => `${p.name} ${p.effect}`).join(', '), 'suspect', t.suspectLots.map((l) => l.id).join(','), 'shipped', t.shipped, 'stock', t.inStock);
    expect(t.params[0].id).toBe('tipCount');
    expect(t.shipped.qty).toBeGreaterThan(0);
  });
});
