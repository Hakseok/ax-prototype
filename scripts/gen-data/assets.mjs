// Equipment sensors (hourly features, minute detail for SC-01) and maintenance work orders.
// SC-01 (main press bearing), the June precedent, SC-08 (oven sensor offset) are built in here.
import { CURRENT_HOUR, DAY, FROM, GO_LIVE, HOUR, MIN, NOW, SENSOR_FROM, isWorkday, iso, parse, round, stream, write, ymd } from './lib.mjs';

const SCALE = 10;

/** Wear episodes: signal offsets that grow until repaired. */
const EPISODES = [
  { eq: 'ASN-PR1-M01', from: '2026-06-06', to: '2026-06-19T10:00', vib: 2.2, temp: 7, mode: '베어링 마모' },
  { eq: 'ASN-PR1-M01', from: '2026-09-14', to: null, vib: 2.3, temp: 7.5, mode: '베어링 마모', shape: 1.15 },
  { eq: 'GMH-IM1-M02', from: '2026-07-03', to: '2026-07-15T09:00', vib: 1.6, temp: 5, mode: '유압 펌프 마모' },
  { eq: 'ASN-UTL-M02', from: '2026-05-06', to: '2026-05-16T10:00', vib: 1.4, temp: 6, mode: '압축기 베어링 마모' },
  { eq: 'DGU-MC1-M05', from: '2026-07-28', to: '2026-08-08T10:00', vib: 1.5, temp: 4, mode: '주축 베어링 마모' },
  { eq: 'HWS-UTL-M01', from: '2026-08-05', to: '2026-08-14T10:00', vib: 1.2, temp: 5, mode: '압축기 냉각 불량' },
  { eq: 'DGU-MC1-M03', from: '2026-09-10', to: null, vib: 1.5, temp: 4.5, mode: '주축 베어링 마모 초기', shape: 1.2 }
];

const episodeOffset = (eqId, t) => {
  let vib = 0;
  let temp = 0;
  for (const e of EPISODES) {
    if (e.eq !== eqId) continue;
    const from = parse(e.from);
    const to = e.to ? parse(e.to) : NOW + DAY;
    if (t < from || t >= to) continue;
    const span = (e.to ? parse(e.to) : NOW) - from;
    const x = Math.min(1, (t - from) / span);
    vib += e.vib * x ** (e.shape ?? 1.6);
    temp += e.temp * x ** (e.shape ?? 1.4);
  }
  return { vib, temp };
};

export function buildSensors(master, production) {
  const r = stream('sensors');
  const monitored = master.equipment.filter((e) => e.monitored);
  const hours = Math.round((CURRENT_HOUR - SENSOR_FROM) / HOUR);
  const offset = Math.round((SENSOR_FROM - FROM) / HOUR);
  const profile = new Map(monitored.map((e) => [e.id, { vib: r.uniform(2.3, 3.3), temp: e.type === '건조로' ? 140 : r.uniform(46, 54), cur: e.ratedKw * r.uniform(1.05, 1.25) }]));

  const value = (e, t, active, rr) => {
    const p = profile.get(e.id);
    const utility = e.lineId.endsWith('UTL');
    const on = active || utility; // utilities keep running between shifts
    const load = on ? 1 : 0;
    const off = episodeOffset(e.id, t);
    let vib = load ? p.vib + off.vib + rr.gauss(0, 0.12) : rr.uniform(0.2, 0.4);
    let temp = load ? p.temp + off.temp + rr.gauss(0, e.type === '건조로' ? 1.2 : 0.8) : e.type === '건조로' ? rr.uniform(55, 70) : rr.uniform(26, 30);
    const cur = load ? p.cur * (1 + off.vib * 0.03) + rr.gauss(0, p.cur * 0.02) : p.cur * rr.uniform(0.05, 0.1);
    // SC-08: the oven 2 temperature sensor reads high for one day shift (calibration drift).
    if (e.id === 'GMH-PT1-M07' && t >= parse('2026-09-23T07:00') && t < parse('2026-09-23T16:00')) temp += 17.5;
    vib = Math.max(0.1, vib);
    temp = Math.max(15, temp);
    return [vib, temp, cur];
  };

  for (const site of master.sites) {
    const active = production.activeByHour.get(site.id);
    const series = {};
    for (const e of monitored.filter((x) => x.siteId === site.id)) {
      const rr = stream(`sensor|${e.id}`);
      const v = [];
      const tt = [];
      const c = [];
      for (let h = 0; h < hours; h++) {
        const t = SENSOR_FROM + h * HOUR;
        const [a, b, d] = value(e, t, active[offset + h] === 1, rr);
        v.push(Math.round(a * SCALE));
        tt.push(Math.round(b * SCALE));
        c.push(Math.round(d * SCALE));
      }
      series[`${e.id}|vibration`] = v;
      series[`${e.id}|temperature`] = tt;
      series[`${e.id}|current`] = c;
    }
    write(`sensors/hourly-${site.id}.json`, { siteId: site.id, from: iso(SENSOR_FROM), hours, scale: SCALE, series });
  }

  // Minute detail for the SC-01 press, last 24 hours.
  const e = master.equipment.find((x) => x.id === 'ASN-PR1-M01');
  const rr = stream('sensor-minute|ASN-PR1-M01');
  const from = NOW - DAY;
  const out = { vibration: [], temperature: [], current: [] };
  const active = production.activeByHour.get('ASN');
  for (let m = 0; m < 1440; m++) {
    const t = from + m * MIN;
    const h = Math.floor((t - FROM) / HOUR);
    const [a, b, d] = value(e, t, active[h] === 1, rr);
    out.vibration.push(Math.round(a * SCALE));
    out.temperature.push(Math.round(b * SCALE));
    out.current.push(Math.round(d * SCALE));
  }
  write('sensors/minute-ASN-PR1-M01.json', { equipmentId: e.id, from: iso(from), minutes: 1440, scale: SCALE, series: out });
  return { episodes: EPISODES };
}

const PREDICTIVE = [
  { eq: 'ASN-UTL-M02', ai: 'AIR-20260508-101', req: '2026-05-08T10:20', appr: '2026-05-08T15:00', start: '2026-05-16T08:00', done: '2026-05-16T10:00', mode: '압축기 베어링 마모', labor: 5, parts: 1_850_000, avoided: 240, stage: '효과 확인', by: 'u-me' },
  { eq: 'ASN-PR1-M01', ai: 'AIR-20260610-102', req: '2026-06-10T09:40', appr: '2026-06-11T08:30', start: '2026-06-19T06:00', done: '2026-06-19T10:00', mode: '베어링 마모', labor: 12, parts: 6_400_000, avoided: 600, stage: '효과 확인', by: 'u-me' },
  { eq: 'GMH-IM1-M02', ai: 'AIR-20260707-103', req: '2026-07-07T11:10', appr: '2026-07-08T09:00', start: '2026-07-15T06:00', done: '2026-07-15T09:00', mode: '유압 펌프 마모', labor: 8, parts: 3_900_000, avoided: 360, stage: '효과 확인', by: 'u-me' },
  { eq: 'DGU-MC1-M05', ai: 'AIR-20260731-104', req: '2026-07-31T14:00', appr: '2026-08-01T09:00', start: '2026-08-08T06:00', done: '2026-08-08T10:00', mode: '주축 베어링 마모', labor: 6, parts: 2_700_000, avoided: 300, stage: '효과 확인', by: 'u-me' },
  { eq: 'HWS-UTL-M01', ai: 'AIR-20260809-105', req: '2026-08-09T09:30', appr: '2026-08-10T09:00', start: '2026-08-14T07:00', done: '2026-08-14T10:00', mode: '압축기 냉각 불량', labor: 4, parts: 1_200_000, avoided: 180, stage: '완료', by: 'u-admin' },
  { eq: 'DGU-MC1-M03', ai: 'AIR-20260925-106', req: '2026-09-25T10:15', appr: '2026-09-25T16:00', start: null, done: null, mode: '주축 베어링 마모 초기', labor: 0, parts: 0, avoided: null, stage: '승인', by: 'u-me' },
  { eq: 'ASN-PR1-M01', ai: 'AIR-20260922-107', req: '2026-09-22T11:05', appr: null, start: null, done: null, mode: '베어링 마모', labor: 0, parts: 0, avoided: null, stage: '요청', by: 'u-me' }
];
export const PREDICTIVE_ORDERS = PREDICTIVE;

export function buildMaintenance(master, production) {
  const r = stream('maintenance');
  const eqById = new Map(master.equipment.map((e) => [e.id, e]));
  const orders = [];
  let seq = 0;
  const id = (t) => `WO-${ymd(t)}-${String(++seq).padStart(4, '0')}`;
  const log = (at, userId, action, note = '') => ({ at, userId, action, note });

  // Preventive: every monitored machine about every five weeks, on a workday morning.
  for (const e of master.equipment.filter((x) => x.monitored)) {
    let t = FROM + r.int(0, 30) * DAY;
    while (t < NOW - 2 * DAY) {
      while (!isWorkday(t)) t += DAY;
      const req = t + 8 * HOUR;
      const done = req + r.int(2, 6) * HOUR;
      if (done > NOW) break;
      orders.push({
        id: id(req), siteId: e.siteId, lineId: e.lineId, equipmentId: e.id, type: '예방', stage: '완료', title: `${e.name} 정기 점검`, failureMode: null,
        requestedAt: iso(req - DAY), requestedBy: 'u-me', approvedAt: iso(req - DAY + 2 * HOUR), startedAt: iso(req), completedAt: iso(done),
        laborHours: round((done - req) / HOUR, 1), partsKrw: r.int(5, 40) * 10_000, aiResultId: null, avoidedDowntimeMin: null,
        log: [log(iso(req - DAY), 'u-me', '요청'), log(iso(req - DAY + 2 * HOUR), 'u-admin', '승인'), log(iso(done), 'u-me', '완료')]
      });
      t += r.int(30, 40) * DAY;
    }
  }

  // Corrective: every breakdown of 30 minutes or more.
  for (const ev of production.events.filter((x) => x.category === 'breakdown')) {
    const s = parse(ev.start);
    const e = parse(ev.end);
    if ((e - s) / MIN < 30) continue;
    const eq = eqById.get(ev.equipmentId);
    orders.push({
      id: id(s), siteId: ev.siteId, lineId: ev.lineId, equipmentId: ev.equipmentId, type: '사후', stage: '완료', title: `${eq.name} ${ev.cause} 수리`, failureMode: ev.cause,
      requestedAt: ev.start, requestedBy: 'u-me', approvedAt: ev.start, startedAt: ev.start, completedAt: ev.end,
      laborHours: round(((e - s) / HOUR) * 1.5, 1), partsKrw: r.int(10, 160) * 10_000, aiResultId: null, avoidedDowntimeMin: null,
      log: [log(ev.start, null, '고장 접수', ev.cause), log(ev.end, 'u-me', '완료')]
    });
  }

  // Predictive (after go-live) from AI results, including SC-01 and its June precedent.
  for (const p of PREDICTIVE) {
    const eq = eqById.get(p.eq);
    const lg = [log(p.req, p.by, '요청', `AI 결과 ${p.ai} 채택`)];
    if (p.appr) lg.push(log(p.appr, 'u-plant-asn', '승인'));
    if (p.start) lg.push(log(p.start, 'u-me', '작업 시작'));
    if (p.done) lg.push(log(p.done, 'u-me', '완료'));
    if (p.stage === '효과 확인') lg.push(log(iso(parse(p.done) + 7 * DAY), 'u-me', '효과 확인', '교체 후 진동·온도 정상 범위 복귀'));
    orders.push({
      id: id(parse(p.req)), siteId: eq.siteId, lineId: eq.lineId, equipmentId: eq.id, type: '예지', stage: p.stage, title: `${eq.name} ${p.mode} 예지 정비`, failureMode: p.mode,
      requestedAt: p.req, requestedBy: p.by, approvedAt: p.appr, startedAt: p.start, completedAt: p.done,
      laborHours: p.labor, partsKrw: p.parts, aiResultId: p.ai, avoidedDowntimeMin: p.avoided, log: lg
    });
  }
  // One predictive order in progress elsewhere so every stage has an example.
  const im2 = eqById.get('GMH-IM2-M05');
  orders.push({
    id: id(parse('2026-09-28T09:00')), siteId: im2.siteId, lineId: im2.lineId, equipmentId: im2.id, type: '예방', stage: '작업 중', title: `${im2.name} 히터 밴드 교체`, failureMode: null,
    requestedAt: '2026-09-28T09:00', requestedBy: 'u-me', approvedAt: '2026-09-28T13:00', startedAt: '2026-09-30T13:00', completedAt: null, laborHours: 0, partsKrw: 0, aiResultId: null, avoidedDowntimeMin: null,
    log: [log('2026-09-28T09:00', 'u-me', '요청'), log('2026-09-28T13:00', 'u-admin', '승인'), log('2026-09-30T13:00', 'u-me', '작업 시작')]
  });

  orders.sort((a, b) => (a.requestedAt < b.requestedAt ? -1 : a.requestedAt > b.requestedAt ? 1 : a.id < b.id ? -1 : 1));
  write('maintenance/work-orders.json', orders);
  return orders;
}

export { GO_LIVE };
