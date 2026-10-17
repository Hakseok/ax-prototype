// Step 8 fixes: the alert detail (COM-020) links and closes alerts like the risk list does.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { setJsonReader } from './reader';
import { alertActions } from './alertStore';
import { alertLink, riskFeed } from './executive';
import { loadAlerts } from './loaders';
import { allClaims } from './workflows';

const MOCK = path.resolve(__dirname, '../../public/mock');
const SITES = ['ASN', 'GMH', 'DGU', 'HWS'];

beforeAll(() => {
  setJsonReader(async (p) => JSON.parse(fs.readFileSync(path.join(MOCK, p), 'utf8')));
});

describe('알림 상세', () => {
  it('리스크 목록의 링크와 알림 상세의 원래 화면 링크가 같다', async () => {
    const [risks, alerts, claims] = await Promise.all([riskFeed(SITES), loadAlerts(), allClaims()]);
    for (const r of risks) expect(alertLink(alerts.find((a) => a.id === r.id)!, claims), r.title).toEqual(r.link);
    const sc07 = alerts.find((a) => a.scenario === 'SC-07')!;
    expect(alertLink(sc07, claims).to).toContain('/COM-020');
  });

  it('조치 완료로 닫으면 리스크 목록에서 빠진다', async () => {
    alertActions.reset();
    const before = await riskFeed(SITES);
    const sc07 = (await loadAlerts()).find((a) => a.scenario === 'SC-07')!;
    alertActions.recordAction(sc07, 'u-admin', '수집 장치 재시작', true);
    const after = await riskFeed(SITES);
    expect(after.length).toBe(before.length - 1);
    expect(after.some((r) => r.id === sc07.id)).toBe(false);
    alertActions.reset();
  });
});
