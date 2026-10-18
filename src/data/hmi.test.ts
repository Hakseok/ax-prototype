// OPS-060 process view and SET-080 designer data (D-71).
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { company } from '../config';
import { setJsonReader } from './reader';
import { baseScreens, checkScreen, hmiSnapshot, playbackTimes, publishedScreens } from './hmi';
import { lineBoard } from './lineMonitor';
import { loadEquipment } from './loaders';
import { getEnergy } from './energy';
import { NOW, parseTime, startOfDay } from './time';

const MOCK = path.resolve(__dirname, '../../public/mock');

beforeAll(() => {
  setJsonReader(async (p) => JSON.parse(fs.readFileSync(path.join(MOCK, p), 'utf8')));
});

describe('설비 가동 화면 · 시연 화면', () => {
  it('사업장마다 게시된 화면이 1개씩 있다', () => {
    for (const s of company.sites) expect(publishedScreens({}, s.id)).toHaveLength(1);
  });

  it('시연 화면은 게시 전 검사를 통과하고, 설비를 중복 없이 캔버스 안에 그린다', async () => {
    const eqs = await loadEquipment();
    for (const screen of baseScreens) {
      expect(checkScreen(screen, eqs)).toEqual([]);
      const ids = screen.objects.flatMap((o) => (o.kind === 'equipment' && o.equipmentId ? [o.equipmentId] : []));
      expect(new Set(ids).size).toBe(ids.length);
      for (const o of screen.objects) {
        if (o.kind === 'equipment' || o.kind === 'zone') {
          expect(o.x).toBeGreaterThanOrEqual(0);
          expect(o.y).toBeGreaterThanOrEqual(0);
          expect(o.x + o.w).toBeLessThanOrEqual(screen.size[0]);
          expect(o.y + o.h).toBeLessThanOrEqual(screen.size[1]);
        }
      }
    }
  });
});

describe('설비 가동 화면 · 시점 상태', () => {
  it('지금의 설비 상태는 라인 모니터링(OPS-030)과 같다', async () => {
    for (const s of company.sites) {
      const [snap, board] = await Promise.all([hmiSnapshot(s.id, NOW), lineBoard(s.id)]);
      for (const m of board.flatMap((b) => b.machines)) expect(snap.equipment.get(m.id)?.state).toBe(m.state);
    }
  });

  it('수집 중단 전(14:00)에는 미수신이 없고, 중단 뒤(14:30)에는 4대다', async () => {
    const before = await hmiSnapshot('DGU', parseTime('2026-09-30T14:00'));
    const after = await hmiSnapshot('DGU', NOW);
    expect(before.counts['미수신']).toBe(0);
    expect(after.counts['미수신']).toBe(4);
    // A missing machine shows no sensor value (미수신, not 0).
    for (const v of after.equipment.values()) if (v.state === '미수신') for (const s of v.signals) expect(s.value).toBeNull();
  });

  it('라인 전력은 15분 사용량을 kW로 바꾼 값이고, 같은 15분의 사용량 합계와 맞는다', async () => {
    const at = parseTime('2026-09-30T10:00');
    const snap = await hmiSnapshot('GMH', at);
    const kw = snap.lines.get('GMH-IM1')!.kw!;
    const e = await getEnergy({ siteIds: ['GMH'], lineIds: ['GMH-IM1'], source: 'electricity', from: at - 15 * 60_000, to: at });
    expect(kw).toBeCloseTo(e.total * 4, 0);
  });

  it('재생 시각은 오늘 0시부터 지금까지 15분 간격이다', () => {
    const t = playbackTimes(15);
    expect(t[0]).toBe(startOfDay(NOW));
    expect(t[t.length - 1]).toBe(NOW);
    expect(t[1] - t[0]).toBe(15 * 60_000);
  });
});

describe('화면 디자이너 · 게시 전 검사', () => {
  it('연결 안 된 설비, 같은 설비 두 번, 다른 사업장 설비, 다른 사업장 라인을 찾는다', async () => {
    const eqs = await loadEquipment();
    const base = baseScreens.find((s) => s.siteId === 'DGU')!;
    const screen = {
      ...base,
      objects: [
        { id: 'a', kind: 'equipment' as const, symbol: 'generic' as const, x: 0, y: 0, w: 50, h: 50, equipmentId: null },
        { id: 'b', kind: 'equipment' as const, symbol: 'machining' as const, x: 0, y: 0, w: 50, h: 50, equipmentId: 'DGU-MC1-M01' },
        { id: 'c', kind: 'equipment' as const, symbol: 'machining' as const, x: 0, y: 0, w: 50, h: 50, equipmentId: 'DGU-MC1-M01' },
        { id: 'd', kind: 'equipment' as const, symbol: 'press' as const, x: 0, y: 0, w: 50, h: 50, equipmentId: 'ASN-PR1-M01' },
        { id: 'e', kind: 'zone' as const, x: 0, y: 0, w: 50, h: 50, label: '영역', lineId: 'ASN-PR1' }
      ]
    };
    const issues = checkScreen(screen, eqs);
    expect(issues.map((i) => i.objectId)).toEqual(['a', 'c', 'd', 'e']);
  });
});
