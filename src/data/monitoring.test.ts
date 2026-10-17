// OPS-030 line monitoring and ENG-020 energy analysis (D-64, D-65).
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { setJsonReader } from './reader';
import { bottleneckGrid, lineBoard } from './lineMonitor';
import { demandProfile, energySummary, lineEnergy } from './energyAnalysis';
import { metric } from './metrics/catalog';
import { periodOf } from './period';

const MOCK = path.resolve(__dirname, '../../public/mock');

beforeAll(() => {
  setJsonReader(async (p) => JSON.parse(fs.readFileSync(path.join(MOCK, p), 'utf8')));
});

describe('라인 모니터링', () => {
  it('수집 중단 장치의 설비 4대는 미수신으로 보인다 (SC-07)', async () => {
    const board = await lineBoard('DGU');
    const missing = board.flatMap((b) => b.machines).filter((m) => m.state === '미수신');
    expect(missing.map((m) => m.id).sort()).toEqual(['DGU-MC2-M11', 'DGU-MC2-M12', 'DGU-MC2-M13', 'DGU-MC2-M14']);
  });

  it('병목 히트맵의 병목은 그날 가장 낮은 라인이다', async () => {
    const g = await bottleneckGrid('ASN', 'plan.attainment', 14);
    expect(g.days).toHaveLength(14);
    g.bottleneck.forEach((b, j) => {
      if (b === null) return;
      const col = g.values.map((row) => row[j]).filter((v): v is number => v !== null);
      expect(g.values[b][j]).toBe(Math.min(...col));
    });
  });
});

describe('에너지 분석', () => {
  it('김해 최대 수요전력은 계약전력의 85%를 넘는다', async () => {
    const d = await demandProfile('GMH', 0.85);
    expect(d.peak!.ratio).toBeGreaterThan(0.85);
    expect(d.overCaution).toBeGreaterThan(0);
  });

  it('사용량·원단위·비용이 에너지 현황(ENG-010)의 지표와 같고, 라인 합이 전체와 같다', async () => {
    const sites = ['ASN', 'GMH', 'DGU', 'HWS'];
    const p = periodOf('thisMonth');
    const s = await energySummary(sites, 'electricity', p.from, p.to);
    expect(s.usage).toBeCloseTo((await metric('energy.electricity', { siteIds: sites, from: p.from, to: p.to }))!, 3);
    expect(s.perUnit).toBeCloseTo((await metric('energy.kwhPerUnit', { siteIds: sites, from: p.from, to: p.to }))!, 6);
    const rows = await lineEnergy(sites, 'electricity', p.from, p.to);
    expect(rows.reduce((a, r) => a + r.usage, 0)).toBeCloseTo(s.usage, 3);
  }, 60000);
});
