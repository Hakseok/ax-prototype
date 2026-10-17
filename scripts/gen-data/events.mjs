// Alerts, past AI results with their decisions, and collection status.
// Current alerts carry the scenarios; older ones are closed history.
import { DAY, NOW, parse, stream, write } from './lib.mjs';
import { PREDICTIVE_ORDERS } from './assets.mjs';

const MODELS = {
  health: { name: '설비 건전성 모델', version: 'v1.2' },
  rootCause: { name: '불량 원인 비교 모델', version: 'v0.9' },
  recommendation: { name: '공정 조건 권장 모델', version: 'v0.9' },
  energyWaste: { name: '에너지 낭비 탐지 모델', version: 'v1.0' },
  anomaly: { name: '공정 이상 탐지 모델', version: 'v1.1' }
};

export function buildEvents(master, production) {
  const r = stream('events');
  const eqById = new Map(master.equipment.map((e) => [e.id, e]));
  const site = (id) => master.sites.find((s) => s.id === id);

  // ---- AI result history (decisions are what AIX-020 lists) ----
  const ai = [];
  const add = (x) => ai.push({ lineId: null, equipmentId: null, productId: null, level: null, scenario: null, decision: null, ...x, model: MODELS[x.kind] });
  for (const p of PREDICTIVE_ORDERS) {
    const eq = eqById.get(p.eq);
    add({
      id: p.ai, kind: 'health', generatedAt: p.req.slice(0, 10) + 'T09:00', siteId: eq.siteId, lineId: eq.lineId, equipmentId: eq.id, level: 'warning',
      confidence: p.eq === 'DGU-MC1-M03' ? 0.66 : 0.8, conclusion: `${eq.name} ${p.mode} 징후`,
      decision: { value: '채택', reason: '', by: p.by, at: p.req }, scenario: p.ai === 'AIR-20260922-107' ? 'SC-01' : null
    });
  }
  add({ id: 'AIR-20260512-201', kind: 'recommendation', generatedAt: '2026-05-12T09:00', siteId: 'GMH', lineId: 'GMH-IM1', productId: 'HG-FBC-410', confidence: 0.74, conclusion: '금형 고정측 온도 편차를 4℃ 이내로 관리하면 외관 불량 감소', decision: { value: '채택', reason: '', by: 'u-qe-gmh', at: '2026-05-12T14:20' } });
  add({ id: 'AIR-20260514-202', kind: 'energyWaste', generatedAt: '2026-05-14T09:00', siteId: 'ASN', lineId: 'ASN-UTL', confidence: 0.81, conclusion: '주말 압축공기 기저 사용량이 평일 비가동 시간보다 38% 높음 (배관 누설 추정)', decision: { value: '채택', reason: '', by: 'u-plant-asn', at: '2026-05-14T15:00' } });
  add({ id: 'AIR-20260523-203', kind: 'rootCause', generatedAt: '2026-05-23T09:00', siteId: 'DGU', lineId: 'DGU-MC2', productId: 'HG-HHS-620', confidence: 0.58, conclusion: '표면 거칠기 불량은 절삭유 온도와 관련', decision: { value: '기각', reason: '측정 지그 교체 시기와 겹침. 공정 원인 아님', by: 'u-me', at: '2026-05-24T10:00' } });
  add({ id: 'AIR-20260706-204', kind: 'anomaly', generatedAt: '2026-07-06T09:00', siteId: 'HWS', lineId: 'HWS-AS2', confidence: 0.62, conclusion: '체결 토크 분포 이동 감지', decision: { value: '기각', reason: '모델 변경에 따른 정상 사양 변경', by: 'u-admin', at: '2026-07-06T13:00' } });
  // SC-08: oven temperature anomaly rejected as a sensor calibration issue.
  add({ id: 'AIR-20260923-205', kind: 'anomaly', generatedAt: '2026-09-23T10:10', siteId: 'GMH', lineId: 'GMH-PT1', equipmentId: 'GMH-PT1-M07', level: 'warning', confidence: 0.71, conclusion: '건조로 2호 로내 온도가 정상 범위보다 약 17℃ 높음', decision: { value: '기각', reason: '현장 확인 결과 온도 센서 교정 문제. 실제 로내 온도는 정상(휴대용 측정기 141℃)', by: 'u-qe-gmh', at: '2026-09-23T15:30' }, scenario: 'SC-08' });
  // A few more routine results for a realistic history.
  const routine = master.equipment.filter((e) => e.monitored);
  for (let i = 0; i < 14; i++) {
    const eq = routine[(i * 7) % routine.length];
    const t = parse('2026-04-10') + i * 11 * DAY + r.int(0, 3) * DAY;
    const adopted = r.chance(0.7);
    add({
      id: `AIR-${new Date(t).toISOString().slice(2, 10).replace(/-/g, '')}-${String(300 + i)}`, kind: 'health', generatedAt: new Date(t + 9 * 3_600_000).toISOString().slice(0, 16),
      siteId: eq.siteId, lineId: eq.lineId, equipmentId: eq.id, level: 'info', confidence: Math.round(r.uniform(0.6, 0.85) * 100) / 100,
      conclusion: `${eq.name} 진동 소폭 상승`,
      decision: { value: adopted ? '채택' : '기각', reason: adopted ? '' : '점검 결과 이상 없음', by: 'u-me', at: new Date(t + 14 * 3_600_000).toISOString().slice(0, 16) }
    });
  }
  ai.sort((a, b) => (a.generatedAt < b.generatedAt ? -1 : 1));

  // ---- alerts ----
  const alerts = [];
  let seq = 0;
  const alert = (x) =>
    alerts.push({
      id: `ALT-${x.occurredAt.slice(0, 10).replace(/-/g, '')}-${String(++seq).padStart(3, '0')}`, lineId: null, equipmentId: null, value: null, threshold: null, unit: '',
      assignee: null, ackAt: null, closedAt: null, aiResultId: null, scenario: null, state: '미확인', ...x,
      log: [{ at: x.occurredAt, userId: null, action: '발생', note: '' }, ...(x.log ?? [])]
    });
  // History: closed rule alerts over the last 60 days.
  const rules = [
    ['OEE 하한 미달', '%', 65, () => r.uniform(55, 64)],
    ['공정 PPM 상한 초과', 'PPM', 12000, () => r.uniform(12500, 16000)],
    ['진동 상한 초과', 'mm/s', 4.5, () => r.uniform(4.6, 5.4)]
  ];
  for (let t = NOW - 60 * DAY; t < NOW - 3 * DAY; t += DAY) {
    if (!r.chance(0.55)) continue;
    const line = r.pick(master.lines);
    const [title, unit, threshold, val] = r.pick(rules);
    const at = new Date(t + r.int(7, 20) * 3_600_000).toISOString().slice(0, 16);
    const closed = new Date(parse(at) + r.int(2, 30) * 3_600_000).toISOString().slice(0, 16);
    alert({
      occurredAt: at, grade: r.chance(0.2) ? 'warning' : 'info', source: '규칙', siteId: line.siteId, lineId: line.id, target: line.name, title, detail: `${line.name} ${title}`,
      value: Math.round(val() * 10) / 10, threshold, unit, state: '조치 완료', assignee: 'u-me', ackAt: at, closedAt: closed,
      log: [{ at: closed, userId: 'u-me', action: '조치', note: '원인 확인 후 조치' }]
    });
  }
  // Current scenario alerts.
  alert({ occurredAt: '2026-09-22T09:05', grade: 'warning', source: 'AI', siteId: 'ASN', lineId: 'ASN-PR1', equipmentId: 'ASN-PR1-M01', target: '탠덤 프레스 1라인 · 1,200톤 메인 프레스', title: '메인 프레스 이상 징후', detail: '진동·베어링 온도 상승, 잔여수명 예측 범위 진입', aiResultId: 'AIR-20260922-107', scenario: 'SC-01', state: '확인', assignee: 'u-me', ackAt: '2026-09-22T11:00', log: [{ at: '2026-09-22T11:00', userId: 'u-me', action: '확인', note: '정비 요청 등록' }] });
  alert({ occurredAt: '2026-09-22T08:10', grade: 'warning', source: '규칙', siteId: 'GMH', lineId: 'GMH-IM1', target: '대형 사출 1라인 · 프런트 범퍼 커버', title: '공정 PPM 상한 초과', detail: '웰드라인·싱크마크 불량 증가', value: 18400, threshold: 12000, unit: 'PPM', scenario: 'SC-02' });
  alert({ occurredAt: '2026-09-23T10:12', grade: 'warning', source: 'AI', siteId: 'GMH', lineId: 'GMH-PT1', equipmentId: 'GMH-PT1-M07', target: '도장 1라인 · 건조로 2호', title: '건조로 온도 이상', detail: '로내 온도가 정상 범위보다 높음', aiResultId: 'AIR-20260923-205', scenario: 'SC-08', state: '조치 완료', assignee: 'u-qe-gmh', ackAt: '2026-09-23T11:00', closedAt: '2026-09-23T15:30', log: [{ at: '2026-09-23T15:30', userId: 'u-qe-gmh', action: '조치', note: 'AI 결과 기각: 온도 센서 교정 문제' }] });
  alert({ occurredAt: '2026-09-25T09:10', grade: 'info', source: 'AI', siteId: 'DGU', lineId: 'DGU-MC1', equipmentId: 'DGU-MC1-M03', target: '너클 가공 1라인 · 머시닝센터 3호', title: '주축 진동 소폭 상승', detail: '초기 마모 징후', aiResultId: 'AIR-20260925-106', state: '확인', assignee: 'u-me', ackAt: '2026-09-25T10:15', log: [{ at: '2026-09-25T10:15', userId: 'u-me', action: '확인', note: '정비 요청 등록' }] });
  alert({ occurredAt: '2026-09-28T10:25', grade: 'critical', source: '규칙', siteId: 'ASN', lineId: 'ASN-WD1', target: '고객사 B · 프런트 사이드 멤버', title: '고객 클레임 접수', detail: '용접 너깃 불량 18개 반품 (CLM-260928-01)', value: 18, unit: '개', scenario: 'SC-05', state: '확인', assignee: 'u-plant-asn', ackAt: '2026-09-28T13:40', log: [{ at: '2026-09-28T13:40', userId: 'u-plant-asn', action: '확인', note: '로트 역추적 시작' }] });
  alert({ occurredAt: '2026-09-29T07:30', grade: 'info', source: 'AI', siteId: 'HWS', lineId: 'HWS-UTL', target: '화성공장 압축기실', title: '비생산 시간 압축공기 사용 증가', detail: '09-07 이후 비가동 시간 기저 사용량 증가 (누설 추정)', scenario: 'SC-04' });
  alert({ occurredAt: '2026-09-29T06:20', grade: 'info', source: '규칙', siteId: 'DGU', lineId: 'DGU-MC1', target: '너클 가공 1라인', title: '소정지 증가', detail: '3조 소정지 건수가 지난달 평균의 2배 이상', scenario: 'SC-03' });
  alert({ occurredAt: '2026-09-30T14:05', grade: 'critical', source: '시스템', siteId: 'DGU', lineId: 'DGU-MC2', target: '하우징 가공 2라인 수집 장치 2', title: '수집 장치 통신 중단', detail: '14:05부터 설비 4대 데이터 미수신', scenario: 'SC-07' });
  alerts.sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));

  // ---- collection status ----
  const collection = master.collectors.map((c) => {
    const stopped = c.id === 'COL-DGU-MC2-2';
    return { collectorId: c.id, siteId: c.siteId, lineId: c.lineId, status: stopped ? '중단' : '정상', lastSeen: stopped ? '2026-09-30T14:05' : '2026-09-30T14:29', missingFrom: stopped ? '2026-09-30T14:05' : null };
  });

  write('ai/results.json', ai);
  write('events/alerts.json', alerts);
  write('events/collection.json', collection);
  return { ai, alerts, collection, site };
}
