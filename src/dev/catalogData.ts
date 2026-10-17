// Illustrative values for the component catalog only. Derived from company.json with
// fixed formulas (no random numbers) so every number on the page agrees.
import { company } from '../config';
import type { StatusLevel } from '../config';
import type { AiResult } from '../data/aiTypes';

const site = company.sites[0];
const nowHour = Number(company.now.slice(11, 13));
const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

// Hourly good output of the first line: shift pattern with breaks at 12h and 20h.
const outputAt = (h: number, dayOffset: number) => {
  const base = site.lines[0].idealRatePerHour * 0.78;
  const dip = h === 12 || h === 20 ? 0.55 : 1;
  return Math.round(base * dip * (1 + 0.03 * Math.sin((h + dayOffset) / 2.7)));
};

const today = hours.map((_, h) => (h < nowHour ? outputAt(h, 0) : null));
const yesterday = hours.map((_, h) => outputAt(h, 1.1));

export const catalog = {
  siteName: site.name,
  lineName: site.lines[0].name,
  nowLabel: company.now.slice(0, 16).replace('T', ' '),
  chart: { categories: hours, today, yesterday, target: Math.round(site.lines[0].idealRatePerHour * 0.8) }
};

const statusByLine: Record<string, StatusLevel> = { 'ASN-PR1': 'warning' };

// Line rows: OEE = availability × performance × quality, fixed per line index.
export const lineRows = site.lines.map((l, i) => {
  const availability = 0.9 - 0.02 * i;
  const performance = 0.88 + 0.015 * Math.sin(i + 1);
  const quality = 0.985 - 0.004 * i;
  return {
    name: l.name,
    availability,
    performance,
    quality,
    oee: availability * performance * quality,
    lossThousand: Math.round(((1 - availability) * 8 * Number(company.unitCosts.lineLossKrwPerHour[l.id as keyof typeof company.unitCosts.lineLossKrwPerHour])) / 1000),
    status: statusByLine[l.id] ?? ('normal' as StatusLevel)
  };
});

export const lineTotal = {
  name: '합계',
  lossThousand: lineRows.reduce((a, r) => a + r.lossThousand, 0)
};

export const sampleAiResult: AiResult = {
  id: 'AIR-SAMPLE-001',
  kind: 'rul',
  target: { siteId: 'ASN', lineId: 'ASN-PR1', equipmentId: 'ASN-PR1-M01', label: '아산공장 · 탠덤 프레스 1라인 · 메인 프레스' },
  generatedAt: company.now.slice(0, 16),
  model: { name: '설비 건전성 모델', version: 'v1.2 (예시)', trainedFrom: '2026-04-01', trainedTo: '2026-08-31' },
  level: 'warning',
  confidence: 0.82,
  conclusion: '메인 모터 베어링 마모 징후. 잔여수명 7~15일, 중앙값 10일',
  evidence: [
    { label: '진동 RMS', value: 6.8, normalRange: [2.1, 4.5], unit: 'mm/s', delta: 2.3 },
    { label: '베어링 온도', value: 71.4, normalRange: [48, 62], unit: '℃', delta: 9.4 },
    { label: '모터 전류', value: 212, normalRange: [180, 215], unit: 'A', delta: 0 }
  ],
  impact: { downtimeHours: [6, 14], costKrw: [18_000_000, 42_000_000] },
  payload: null
};
