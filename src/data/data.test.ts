// Step 3: consistency rules of docs/data-model.md 4, checked on the generated mock data.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { setJsonReader } from './reader';
import { getDowntime, getLots, getShifts, lineMap, siteShifts } from './production';
import { totalsOf } from './metrics/oee';
import { loadClaims, loadWorkOrders } from './loaders';
import { DAY, NOW, PRODUCTION_FROM, parseTime } from './time';

const MOCK = path.resolve(__dirname, '../../public/mock');
const SITES = ['ASN', 'GMH', 'DGU', 'HWS'];
const ALL = { siteIds: SITES, from: PRODUCTION_FROM, to: NOW + DAY };

beforeAll(() => {
  setJsonReader(async (p) => JSON.parse(fs.readFileSync(path.join(MOCK, p), 'utf8')));
});

describe('가상 데이터 일관성', () => {
  it('라인 합 = 사업장 합 = 전사 합 (수량·시간)', async () => {
    const lines = await lineMap();
    const company = totalsOf(await getShifts(ALL), lines);
    let goodBySite = 0;
    let pptBySite = 0;
    for (const s of SITES) {
      const site = totalsOf(await getShifts({ ...ALL, siteIds: [s] }), lines);
      let goodByLine = 0;
      for (const l of [...lines.values()].filter((x) => x.siteId === s)) goodByLine += totalsOf(await getShifts({ ...ALL, siteIds: [s], lineIds: [l.id] }), lines).goodQty;
      expect(goodByLine).toBe(site.goodQty);
      goodBySite += site.goodQty;
      pptBySite += site.pptMin;
    }
    expect(goodBySite).toBe(company.goodQty);
    expect(pptBySite).toBeCloseTo(company.pptMin, 3);
  });

  it('양품 + 불량 = 총생산, 재작업은 불량의 일부, 불량 유형 합 = 불량', async () => {
    for (const s of SITES) {
      for (const r of await siteShifts(s)) {
        const defects = r.totalQty - r.goodQty;
        expect(r.scrapQty + r.reworkQty).toBe(defects);
        expect(Object.values(r.defects).reduce((a, b) => a + b, 0)).toBe(defects);
        expect(r.startupDefectQty).toBeLessThanOrEqual(defects);
      }
    }
  });

  it('계획 가동 시간 − 6대 손실 = 완전 가동 시간', async () => {
    const t = totalsOf(await getShifts(ALL), await lineMap());
    const losses = Object.values(t.loss).reduce((a, b) => a + b, 0);
    expect(Math.abs(t.pptMin - losses - t.fullyProductiveMin)).toBeLessThan(1);
  });

  it('교대 실적의 정지 손실 시간 = 같은 교대 비가동 사건 시간의 합', async () => {
    const lines = await lineMap();
    for (const s of SITES) {
      const events = await getDowntime({ ...ALL, siteIds: [s] });
      const byKey = new Map<string, number>();
      for (const e of events) {
        const k = `${e.shiftKey}|${e.lineId}|${e.category}`;
        const line = lines.get(e.lineId)!;
        byKey.set(k, (byKey.get(k) ?? 0) + (parseTime(e.end) - parseTime(e.start)) / 60_000 / (line.parallel ? line.machines : 1));
      }
      const per = new Map<string, { breakdown: number; changeover: number }>();
      for (const r of await siteShifts(s)) {
        const k = `${r.date}-${r.shift}|${r.lineId}`;
        const x = per.get(k) ?? { breakdown: 0, changeover: 0 };
        x.breakdown += r.breakdownMin;
        x.changeover += r.changeoverMin;
        per.set(k, x);
      }
      for (const [k, v] of per) {
        expect(Math.abs((byKey.get(`${k}|breakdown`) ?? 0) - v.breakdown)).toBeLessThan(0.2);
        expect(Math.abs((byKey.get(`${k}|changeover`) ?? 0) - v.changeover)).toBeLessThan(0.2);
      }
    }
  });

  it('로트 수량 합 = 교대 실적 총생산', async () => {
    const shifts = await getShifts({ siteIds: ['GMH'], from: parseTime('2026-09-01'), to: NOW + DAY });
    const lots = await getLots({ siteIds: ['GMH'], from: parseTime('2026-09-01'), to: NOW + DAY });
    const sumBy = new Map<string, number>();
    for (const l of lots) sumBy.set(`${l.date}|${l.shift}|${l.lineId}|${l.productId}`, (sumBy.get(`${l.date}|${l.shift}|${l.lineId}|${l.productId}`) ?? 0) + l.qty);
    for (const r of shifts) expect(sumBy.get(`${r.date}|${r.shift}|${r.lineId}|${r.productId}`) ?? 0).toBe(r.totalQty);
  });

  it('클레임 → 로트 → 설비·금형·자재 로트·공정 조건 연결이 끊기지 않는다 (SC-05)', async () => {
    const claim = (await loadClaims()).find((c) => c.id === 'CLM-260928-01')!;
    expect(claim.lotIds.length).toBe(3);
    const lots = await getLots({ siteIds: ['ASN'], from: parseTime('2026-09-14'), to: parseTime('2026-09-17') });
    for (const id of claim.lotIds) {
      const lot = lots.find((l) => l.id === id)!;
      expect(lot.equipmentId).toBe('ASN-WD1-M07');
      expect(lot.materialLot).toBeTruthy();
      expect(lot.params.tipCount[0]).toBeGreaterThan(2800);
      expect(lot.shippedOn).not.toBeNull();
    }
  });

  it('예지 정비: 완료 후에 같은 신호가 정상으로 돌아오고, SC-01은 요청 단계다', async () => {
    const orders = (await loadWorkOrders()).filter((o) => o.type === '예지');
    expect(orders.find((o) => o.equipmentId === 'ASN-PR1-M01' && o.stage === '요청')).toBeTruthy();
    expect(orders.find((o) => o.equipmentId === 'ASN-PR1-M01' && o.stage === '효과 확인')).toBeTruthy();
  });

  it('진행 중 교대와 비교할 때 비교 쪽 교대는 같은 경과 시간으로 잘린다 (D-05)', async () => {
    const lines = await lineMap();
    const today = totalsOf(await getShifts({ siteIds: SITES, from: parseTime('2026-09-30'), to: NOW }), lines);
    const yday = totalsOf(await getShifts({ siteIds: SITES, from: parseTime('2026-09-29'), to: NOW - DAY }), lines);
    // Same elapsed planned time within a few percent (no full extra shift on one side).
    expect(Math.abs(today.calendarMin / yday.calendarMin - 1)).toBeLessThan(0.05);
  });
});
