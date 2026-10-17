// Step 5: the executive screens and the PDF read the same numbers.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { setJsonReader } from '../data/reader';
import { formatMoney } from '../components/money';
import { kpiValue, monthPeriod, riskFeed } from '../data/executive';
import { metric } from '../data/metrics/catalog';
import { periodOf } from '../data/period';
import { buildLedger } from '../data/roi/ledger';
import { buildReport } from './model';

const MOCK = path.resolve(__dirname, '../../public/mock');
const SITES = ['ASN', 'GMH', 'DGU', 'HWS'];

beforeAll(() => {
  setJsonReader(async (p) => JSON.parse(fs.readFileSync(path.join(MOCK, p), 'utf8')));
});

describe('경영 현황 · AX 성과 · 보고서 수치 일치', () => {
  it('AX 효과: 경영 현황 카드 = AX 성과 합계 = 보고서(PDF) 합계', async () => {
    const ledger = await buildLedger(SITES);
    const report = await buildReport(SITES, '2026-09');
    const items = ledger.items.filter((i) => i.kind === '확정' || i.kind === '추정').reduce((a, i) => a + i.amount, 0);
    expect(ledger.totals.counted).toBeCloseTo(items, 3);
    expect(report.effect.counted).toBe(formatMoney(ledger.totals.counted));
    expect(report.effect.confirmed).toBe(formatMoney(ledger.totals.confirmed));
  });

  it('보고서 이번 달 지표 = 경영 현황 이번 달 카드', async () => {
    const report = await buildReport(SITES, '2026-09');
    const card = await kpiValue('oee', SITES, periodOf('thisMonth'));
    expect(report.kpis.find((k) => k.label === 'OEE')!.value).toBe(((card.value as number) * 100).toFixed(1));
    const total = report.siteRows[report.siteRows.length - 1];
    expect(total[0]).toBe('전사');
    expect(total[2]).toBe(((card.value as number) * 100).toFixed(1));
  });

  it('지난달 보고서는 전월 전체와 비교한다', async () => {
    const p = monthPeriod('2026-08');
    const k = await kpiValue('oee', SITES, p);
    expect(k.basis).toBe('전월');
    expect(k.previous).toBeCloseTo((await metric('oee', { siteIds: SITES, from: Date.UTC(2026, 6, 1), to: Date.UTC(2026, 7, 1) }))!, 9);
  });

  it('리스크 목록에 시나리오 리스크가 금액과 함께 나온다', async () => {
    const risks = await riskFeed(SITES);
    const titles = risks.map((r) => r.title);
    expect(titles).toContain('메인 프레스 이상 징후');
    expect(titles).toContain('공정 PPM 상한 초과');
    expect(titles).toContain('고객 클레임 접수');
    expect(risks.find((r) => r.title === '메인 프레스 이상 징후')!.impactKrw).not.toBeNull();
    expect(risks[0].level).toBe('critical');
  });
});
