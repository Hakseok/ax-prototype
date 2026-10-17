// Step 7: AI assistant answers, industry setting, unit cost and baseline changes.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { setJsonReader } from './reader';
import { EXAMPLE_QUESTIONS, answer } from './assistant';
import { baselinePeriod, BASELINE_ITEM } from './baseline';
import { industryStore, saveIndustry, templateOf } from './industry';
import { buildLedger } from './roi/ledger';
import { addVersion, versionStore } from './versions';
import { metric } from './metrics/catalog';
import { periodOf } from './period';

const MOCK = path.resolve(__dirname, '../../public/mock');
const SITES = ['ASN', 'GMH', 'DGU', 'HWS'];

beforeAll(() => {
  setJsonReader(async (p) => JSON.parse(fs.readFileSync(path.join(MOCK, p), 'utf8')));
});

describe('AI 도우미', () => {
  it('예시 질문은 모두 답·근거·링크를 낸다', async () => {
    for (const q of EXAMPLE_QUESTIONS) {
      const a = await answer(q, SITES);
      expect(a.payload.intent, q).not.toBeNull();
      expect(a.conclusion.length, q).toBeGreaterThan(10);
      expect(a.payload.links.length, q).toBeGreaterThan(0);
      console.log(`${q} → ${a.conclusion}`);
    }
  }, 60000);

  it('같은 질문에는 같은 답', async () => {
    const q = EXAMPLE_QUESTIONS[1];
    expect((await answer(q, SITES)).conclusion).toBe((await answer(q, SITES)).conclusion);
  });

  it('지원하지 않는 질문은 범위를 안내하고 답을 만들지 않는다', async () => {
    const a = await answer('내일 주가는?', SITES);
    expect(a.payload.intent).toBeNull();
    expect(a.payload.supported!.length).toBeGreaterThan(3);
  });

  it('불량 원인 질문은 품질 원인 분석과 같은 대상(대형 사출 1라인)을 가리킨다', async () => {
    const a = await answer('지난주 불량이 늘어난 원인은?', ['GMH']);
    expect(a.payload.links[0].to).toContain('f.lineId=GMH-IM1');
  });
});

describe('단가·기준선 변경', () => {
  it('전력 단가를 올리면 에너지 비용과 에너지 절감 효과가 다시 계산된다', async () => {
    versionStore.reset();
    const p = periodOf('thisMonth');
    const before = await metric('energy.cost', { siteIds: SITES, ...p });
    const l0 = await buildLedger(SITES);
    addVersion('unitCost', 'electricityKrwPerKwh', { validFrom: '2026-09-01', value: 200, userId: 'u-admin', note: '시험' });
    const after = await metric('energy.cost', { siteIds: SITES, ...p });
    const l1 = await buildLedger(SITES);
    expect(after!).toBeGreaterThan(before!);
    const e0 = l0.items.find((i) => i.id === 'fx.energy')!;
    const e1 = l1.items.find((i) => i.id === 'fx.energy')!;
    expect(e1.monthly['2026-09']).toBeGreaterThan(e0.monthly['2026-09']);
    expect(e1.monthly['2026-08']).toBeCloseTo(e0.monthly['2026-08'], 0); // before the start date: old price
    versionStore.reset();
  });

  it('기준선을 3개월로 줄이면 기간이 바뀌고 효과 원장이 다시 계산된다', async () => {
    versionStore.reset();
    expect(baselinePeriod().months).toBe(6);
    const l0 = await buildLedger(SITES);
    addVersion('unitCost', BASELINE_ITEM, { validFrom: '2026-09-30', value: 3, userId: 'u-admin', note: '시험' });
    const b = baselinePeriod();
    expect(b.months).toBe(3);
    expect(new Date(b.from).toISOString().slice(0, 10)).toBe('2026-01-01');
    const l1 = await buildLedger(SITES);
    expect(l1.totals.counted).not.toBeCloseTo(l0.totals.counted, 0);
    console.log('baseline 6 →', Math.round(l0.totals.counted / 1e5) / 10, '/ 3 →', Math.round(l1.totals.counted / 1e5) / 10);
    addVersion('unitCost', BASELINE_ITEM, { validFrom: '2026-09-30', value: 12, userId: 'u-admin', note: '범위 밖' });
    expect(baselinePeriod().months).toBe(6); // clamped to the data start
    versionStore.reset();
  });
});

describe('초기 설정', () => {
  it('업종을 바꾸면 핵심 지표가 그 업종 것으로 저장되고 되돌릴 수 있다', () => {
    industryStore.reset();
    const food = templateOf('food-beverage');
    saveIndustry(food.id, food.headlineKpis, 'u-admin');
    expect(industryStore.get().templateId).toBe('food-beverage');
    expect(industryStore.get().headlineKpis).toContain('yield.material');
    industryStore.reset();
    expect(industryStore.get().templateId).toBe('auto-parts');
  });
});
