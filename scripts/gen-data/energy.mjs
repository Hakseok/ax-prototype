// Energy per line and site utility: electricity, compressed air, LNG (GMH paint ovens).
// Hourly for the year, 15-minute for the last seven days. SC-04 (HWS idle air) is built in here.
import { CURRENT_HOUR, DAY, DAYS, FROM, GO_LIVE, HOUR, NOW, QUARTER_FROM, iso, parse, stream, write } from './lib.mjs';

const PER_UNIT = {
  // kWh per unit, Nm³ air per unit, Nm³ LNG per unit, idle kW, idle air Nm³/h
  press: { kwh: 0.75, air: 1.4, lng: 0, idleKw: 60, idleAir: 40 },
  welding: { kwh: 4.0, air: 6.0, lng: 0, idleKw: 25, idleAir: 25 },
  injection: { kwh: 5.5, air: 1.8, lng: 0, idleKw: 90, idleAir: 20 },
  painting: { kwh: 1.7, air: 4.0, lng: 0.75, idleKw: 70, idleAir: 30, idleLng: 25 },
  machining: { kwh: 2.3, air: 3.0, lng: 0, idleKw: 30, idleAir: 30 },
  assembly: { kwh: 1.9, air: 5.0, lng: 0, idleKw: 15, idleAir: 35 }
};
const UTL_BASE_KW = { ASN: 380, GMH: 520, DGU: 210, HWS: 140 };
const COMPRESSOR_KWH_PER_NM3 = 0.11;
const SCALE = { electricity: 1, compressedAir: 1, lng: 1 };

export function buildEnergy(master, production) {
  const hoursAll = DAYS * 24;
  const hourly = Math.round((CURRENT_HOUR - FROM) / HOUR);
  const qFromIdx = Math.round((QUARTER_FROM - FROM) / HOUR);
  const slots = Math.round((NOW - QUARTER_FROM) / (HOUR / 4));

  for (const site of master.sites) {
    const r = stream(`energy|${site.id}`);
    const active = production.activeByHour.get(site.id);
    const series = {};
    const airTotal = new Float64Array(hoursAll);
    for (const line of master.lines.filter((l) => l.siteId === site.id)) {
      const k = PER_UNIT[line.process];
      const out = production.outputByHour.get(line.id);
      const elec = [];
      const air = [];
      const lng = [];
      for (let h = 0; h < hoursAll; h++) {
        const t = FROM + h * HOUR;
        const after = t >= GO_LIVE;
        const idleCut = after ? 0.88 : 1; // AX: idle shutdown rules after go-live
        const unitCut = after ? 0.97 : 1;
        const on = active[h] === 1;
        const units = out[h];
        let e = (on ? k.idleKw : k.idleKw * 0.35 * idleCut) + units * k.kwh * unitCut;
        let a = (on ? k.idleAir : k.idleAir * 0.6 * idleCut) + units * k.air * unitCut;
        // SC-04: a leak raises HWS air use at all hours after 09-07, most visible when lines are off.
        if (site.id === 'HWS' && t >= parse('2026-09-07')) a += 70;
        let g = k.lng ? (on ? k.idleLng : k.idleLng * 0.2) + units * k.lng * unitCut : 0;
        e *= 1 + r.gauss(0, 0.025);
        a *= 1 + r.gauss(0, 0.03);
        g *= 1 + r.gauss(0, 0.025);
        elec.push(Math.max(0, Math.round(e)));
        air.push(Math.max(0, Math.round(a)));
        if (k.lng) lng.push(Math.max(0, Math.round(g)));
        airTotal[h] += air[h];
      }
      series[`${line.id}|electricity`] = elec;
      series[`${line.id}|compressedAir`] = air;
      if (k.lng) series[`${line.id}|lng`] = lng;
    }
    // Utilities: HVAC, lighting and the compressors that make the plant air.
    const utl = [];
    for (let h = 0; h < hoursAll; h++) {
      const on = active[h] === 1;
      const base = UTL_BASE_KW[site.id] * (on ? 1 : 0.45);
      utl.push(Math.round((base + airTotal[h] * COMPRESSOR_KWH_PER_NM3) * (1 + r.gauss(0, 0.02))));
    }
    series[`${site.id}-UTL|electricity`] = utl;

    // Hourly file up to the current hour; the running hour lives in the 15-minute file.
    const hourlySeries = Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v.slice(0, hourly)]));
    write(`energy/hourly-${site.id}.json`, { siteId: site.id, from: iso(FROM), hours: hourly, scale: SCALE, series: hourlySeries });

    // 15-minute values split each hour into four parts that add up to the hour exactly.
    const rq = stream(`energy-q|${site.id}`);
    const quarter = {};
    for (const [k, v] of Object.entries(series)) {
      const q = [];
      for (let h = qFromIdx; h < qFromIdx + Math.ceil(slots / 4); h++) {
        const total = v[h];
        const w = [0, 1, 2, 3].map(() => 1 + rq.gauss(0, 0.04));
        const sum = w.reduce((a, b) => a + b, 0);
        let rest = total;
        for (let i = 0; i < 4; i++) {
          const part = i === 3 ? rest : Math.round((total * w[i]) / sum);
          rest -= part;
          q.push(part);
        }
      }
      quarter[k] = q.slice(0, slots);
    }
    write(`energy/quarter-${site.id}.json`, { siteId: site.id, from: iso(QUARTER_FROM), slots, scale: SCALE, series: quarter });
  }
  return { slots, hourly };
}

export { DAY };
