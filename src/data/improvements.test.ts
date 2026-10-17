// Pre-demo improvements: saving card, before/after rows, alert history, failure dates, adoption marker.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { setJsonReader } from './reader';
import { alertHistory, beforeAfter } from './executive';
import { metric } from './metrics/catalog';
import { periodOf } from './period';
import { buildLedger, SAVING_ITEMS } from './roi/ledger';
import { rulDates } from './maintenance';
import { decide, decisionStore, recommend } from './aiEngine';
import { recentWindow } from './period';
import { buildReport } from '../report/model';

const MOCK = path.resolve(__dirname, '../../public/mock');
const SITES = ['ASN', 'GMH', 'DGU', 'HWS'];

beforeAll(() => {
  setJsonReader(async (p) => JSON.parse(fs.readFileSync(path.join(MOCK, p), 'utf8')));
});

describe('경영 현황 카드', () => {
  it('이번 달 절감액 = 효과 원장의 에너지 + 공정 불량 + 클레임 9월 금액', async () => {
    const p = periodOf('thisMonth');
    const saving = await metric('ax.saving', { siteIds: SITES, from: p.from, to: p.to });
    const ledger = await buildLedger(SITES);
    const sept = ledger.items.filter((i) => SAVING_ITEMS.includes(i.id)).reduce((a, i) => a + (i.monthly['2026-09'] ?? 0), 0);
    expect(saving).toBeCloseTo(sept, 0);
  }, 60000);
});

describe('보고서', () => {
  it('전후 비교 표가 AX 성과 화면과 같은 행이고 종합수율(직행률)을 포함한다', async () => {
    const rows = await beforeAfter(SITES, ['quality.fpy', 'oee']);
    expect(rows[1].change).toBe('+2.4%p');
    const r = await buildReport(SITES, '2026-09');
    expect(r.compare.rows.some((x) => x[0].startsWith('직행률'))).toBe(true);
    expect(r.riskCount).toBe(r.risks.length);
    expect(r.alerts.rows.length).toBeGreaterThan(0);
  }, 60000);

  it('알림 이력은 기간 안 알림을 최근 순으로, 조치 내용과 함께', async () => {
    const p = periodOf('thisMonth');
    const rows = await alertHistory(SITES, p.from, p.to);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].occurredAt >= rows[rows.length - 1].occurredAt).toBe(true);
    expect(rows.some((r) => r.state === '조치 완료' && r.action)).toBe(true);
  });
});

describe('설비 예상 고장 시점', () => {
  it('잔여수명 구간을 날짜로 바꾼다 (기준 09-30)', () => {
    expect(rulDates({ p10: 7, p90: 14 })).toBe('10-07~10-14');
  });
});

describe('권장 조건 채택', () => {
  it('채택하면 잠재 항목에 "채택됨 · 실행 전"이 붙고 합계는 그대로다', async () => {
    decisionStore.reset();
    const before = await buildLedger(SITES);
    const rec = (await recommend({ siteIds: ['GMH'], productId: 'HG-FBC-410', lineId: 'GMH-IM1', ...recentWindow(14) }))!;
    decide(rec.id, '채택', '현장 확인', 'u-qe-gmh');
    const after = await buildLedger(SITES);
    expect(after.items.find((i) => i.id === 'fx.potential.defect.GMH-IM1')!.status).toBe('채택됨 · 실행 전');
    expect(after.totals.counted).toBeCloseTo(before.totals.counted, 0);
    decisionStore.reset();
  }, 60000);
});
