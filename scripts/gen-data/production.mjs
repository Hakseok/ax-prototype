// Production: shift records (line × shift × product), downtime events, lots with process
// conditions. Scenarios SC-02, SC-03, SC-05, SC-06, SC-07 are built in here.
import { C, DAY, DAYS, FROM, GO_LIVE, HOUR, MIN, NOW, date, isWorkday, iso, parse, quarterOf, round, shiftsOf, stream, write, ymd } from './lib.mjs';

const BASE = {
  // breakdowns per shift (serial) or per machine-shift (parallel), mean duration (min)
  press: { bd: 0.8, bdMin: 70, minor: 9, speed: 0.86, defect: 0.007 },
  welding: { bd: 0.75, bdMin: 32, minor: 10, speed: 0.87, defect: 0.005 },
  injection: { bd: 0.14, bdMin: 55, minor: 7, speed: 0.88, defect: 0.011 },
  painting: { bd: 0.65, bdMin: 45, minor: 12, speed: 0.89, defect: 0.019 },
  machining: { bd: 0.1, bdMin: 42, minor: 16, speed: 0.85, defect: 0.006 },
  assembly: { bd: 0.6, bdMin: 30, minor: 14, speed: 0.88, defect: 0.004 }
};
// AX improvement after go-live (conservative): fewer breakdowns, fewer minor stops, slightly faster, fewer defects.
const AX = { bd: 0.76, minor: 0.86, speed: 0.008, defect: 0.83 };

const CAUSES = {
  press: [['P-BRG', '메인 모터 베어링'], ['P-HYD', '유압 누유'], ['P-FEED', '피더 이송 이상'], ['P-DIE', '금형 파손']],
  welding: [['W-TIP', '전극 팁 이상'], ['W-ROB', '로봇 위치 오차'], ['W-CBL', '케이블 단선']],
  injection: [['I-HYD', '유압 펌프 이상'], ['I-HTR', '히터 단선'], ['I-MLD', '금형 냉각 회로 막힘']],
  painting: [['T-CONV', '컨베이어 정지'], ['T-OVEN', '건조로 버너 이상'], ['T-ROB', '도장 로봇 이상']],
  machining: [['M-SPD', '주축 이상'], ['M-ATC', '공구 교환 장치 이상'], ['M-COOL', '절삭유 공급 이상']],
  assembly: [['A-NR', '너트러너 이상'], ['A-VIS', '비전 검사 오류'], ['A-AGV', 'AGV 정지']]
};
const CHANGEOVER = { press: [38, 'C-DIE', '금형 교체'], painting: [14, 'C-COLOR', '품번·색상 교체'], injection: [50, 'C-MOLD', '금형 교체'], welding: [20, 'C-JIG', '지그 교체'], machining: [35, 'C-SETUP', '품번 셋업'], assembly: [18, 'C-MODEL', '모델 교체'] };

const DEFECT_TYPES = readDefectTypes();
function readDefectTypes() {
  return {
    press: ['크랙', '주름', '버', '치수 불량'],
    welding: ['너깃 불량', '용접 누락', '스패터', '위치 불량'],
    injection: ['웰드라인', '싱크마크', '미성형', '변형'],
    painting: ['먼지 부착', '흐름', '도막 두께 불량', '색차'],
    machining: ['치수 불량', '표면 거칠기', '버', '공구 자국'],
    assembly: ['체결 토크 불량', '부품 누락', 'EOL 불합격', '외관 손상']
  };
}

const inSc = (t, from, to = null) => t >= parse(from) && t < (to ? parse(to) : NOW + DAY);

const finalLine = new Map(C.sites.flatMap((s) => s.products.map((p) => [p.id, p.lines[p.lines.length - 1]])));
export const isFinalLine = (productId, lineId) => finalLine.get(productId) === lineId;

/** Products a line makes in a shift: [productId, machineShare, machineIds]. */
function productsFor(line, products, dayIdx, shiftIdx, machines) {
  const mine = products.filter((p) => p.lines.includes(line.id));
  if (line.id === 'GMH-IM1') {
    return [
      ['HG-FBC-410', 4 / 6, machines.slice(0, 4)],
      ['HG-RBC-420', 2 / 6, machines.slice(4)]
    ];
  }
  if (mine.length > 1) {
    const p = mine[(dayIdx + shiftIdx) % 2];
    return [[p.id, 1, machines]];
  }
  return [[mine[0].id, 1, machines]];
}

export function buildProduction(master) {
  const { sites, lines, equipment, products, molds } = master;
  const rs = stream('production');
  const rl = stream('lots');
  const eqByLine = new Map(lines.map((l) => [l.id, equipment.filter((e) => e.lineId === l.id)]));
  const params = C.processParameters;
  const hours = DAYS * 24;

  const shifts = []; // ShiftRecord
  const events = []; // DowntimeEvent
  const lots = []; // Lot
  /** units produced per line per hour from FROM (for energy) */
  const outputByHour = new Map(lines.map((l) => [l.id, new Float64Array(hours)]));
  /** whether a shift runs at that hour, per site */
  const activeByHour = new Map(sites.map((s) => [s.id, new Uint8Array(hours)]));
  const lastProduct = new Map();
  const materialLot = new Map();
  let eventSeq = 0;

  for (let d = 0; d < DAYS; d++) {
    const day = FROM + d * DAY;
    if (!isWorkday(day)) continue;
    for (const site of sites) {
      const siteShifts = shiftsOf(site, day);
      siteShifts.forEach((sh, si) => {
        if (sh.start >= NOW) return;
        const running = sh.end > NOW;
        const end = Math.min(sh.end, NOW);
        const shiftMin = (sh.end - sh.start) / MIN;
        const elapsed = (end - sh.start) / MIN;
        const after = sh.start >= GO_LIVE;
        for (let h = sh.start; h < end; h += HOUR) activeByHour.get(site.id)[Math.floor((h - FROM) / HOUR)] = 1;

        for (const line of lines.filter((l) => l.siteId === site.id)) {
          const base = BASE[line.process];
          const machines = eqByLine.get(line.id);
          const M = line.parallel ? line.machines : 1;
          const groups = productsFor(line, products, d, si, machines);
          for (const [productId, share, groupMachines] of groups) {
            const T = elapsed * share;
            const plannedStop = 60 * share * (elapsed / shiftMin);
            const shiftKey = `${date(sh.start)}-${sh.id}`;
            const recEvents = [];
            const addEvent = (category, equipmentId, start, minutes, causeCode, cause) => {
              // Whole minutes, so the stored times add up exactly to the shift's loss minutes.
              const s = Math.max(sh.start, Math.min(Math.round(start / MIN) * MIN, end - MIN));
              const e = Math.min(end, s + Math.round(minutes) * MIN);
              if (e - s < 5 * MIN) return 0;
              recEvents.push({ id: `DT-${site.id}-${String(++eventSeq).padStart(6, '0')}`, siteId: site.id, lineId: line.id, equipmentId, start: iso(s), end: iso(e), category, causeCode, cause, shiftKey });
              return (e - s) / MIN / M;
            };

            // Changeover when the product differs from the line's previous shift, or a mold change on parallel lines.
            let changeover = 0;
            const key = `${line.id}|${share}`;
            const [coMin, coCode, coName] = CHANGEOVER[line.process];
            if (!line.parallel && lastProduct.has(key) && lastProduct.get(key) !== productId) {
              changeover += addEvent('changeover', machines[0].id, sh.start + 5 * MIN, rs.lognormal(coMin, 0.25), coCode, coName);
            }
            if (line.parallel) {
              for (const m of groupMachines) if (rs.chance(line.id === 'GMH-IM2' ? 0.12 : 0.04)) changeover += addEvent('changeover', m.id, sh.start + rs.uniform(10, elapsed - 60) * MIN, rs.lognormal(coMin, 0.3), coCode, coName);
            } else if (line.id === 'ASN-PR2' && rs.chance(0.08)) {
              changeover += addEvent('changeover', machines[0].id, sh.start + rs.uniform(30, 200) * MIN, rs.lognormal(30, 0.2), 'C-DIE', '금형 정비 교체');
            }
            lastProduct.set(key, productId);

            // Breakdowns. SC-01: the main press does not fail; its wear is caught early (June and September).
            let breakdown = 0;
            const lambda = base.bd * (after ? AX.bd : 1) * (elapsed / shiftMin);
            const candidates = line.parallel ? groupMachines : machines;
            const n = rs.poisson(lambda * (line.parallel ? groupMachines.length : 1));
            for (let k = 0; k < n; k++) {
              let m = rs.pick(candidates);
              if (m.id === 'ASN-PR1-M01') m = candidates[1 + rs.int(0, candidates.length - 2)];
              const [code, cause] = rs.pick(CAUSES[line.process]);
              breakdown += addEvent('breakdown', m.id, sh.start + rs.uniform(20, Math.max(25, elapsed - 20)) * MIN, rs.lognormal(base.bdMin, 0.55), code, cause);
            }

            // SC-07: four DGU-MC2 machines stop sending data from 14:05 today.
            let missing = 0;
            if (line.id === 'DGU-MC2' && running && NOW > parse('2026-09-30T14:05')) missing = ((NOW - parse('2026-09-30T14:05')) / MIN) * (4 / 14);

            // Minor stops and speed. SC-03: DGU-MC1 night shift in September, late tool life.
            const sc03 = line.id === 'DGU-MC1' && inSc(sh.start, '2026-09-01') && (sh.id === 'C' || (sh.id === 'B' && rs.chance(0.4)));
            const minorCount = rs.poisson(base.minor * (after ? AX.minor : 1) * (sc03 ? 2.4 : 1) * share * (elapsed / shiftMin));
            let minor = 0;
            for (let k = 0; k < minorCount; k++) minor += rs.uniform(sc03 ? 2 : 1, sc03 ? 4.5 : 3.5);
            const ppt = T - plannedStop;
            const operating = Math.max(0, ppt - missing - breakdown - changeover);
            minor = Math.min(minor, operating * 0.4);
            const net = operating - minor;
            const speed = Math.min(0.995, base.speed + (after ? AX.speed : 0) - (sc03 ? 0.075 : 0) + rs.gauss(0, 0.012));
            const totalQty = Math.max(0, Math.floor((net / 60) * line.idealRatePerHour * speed));
            const plannedQty = Math.round(((T - plannedStop) / 60) * line.idealRatePerHour * 0.86);

            // Lots: one per machine on IM1 (SC-02 needs the machine), else one or two per shift.
            const lotMachines = line.id === 'GMH-IM1' ? groupMachines : running ? [machines[0]] : rs.chance(0.35) ? [machines[0], machines[0]] : [machines[0]];
            const shares = lotMachines.map(() => 1 / lotMachines.length);
            let restQty = totalQty;
            const shiftLots = lotMachines.map((m, li) => {
              const qty = li === lotMachines.length - 1 ? restQty : Math.round(totalQty * shares[li]);
              restQty -= qty;
              return makeLot({ rl, line, site, productId, machine: m, sh, li, qty, after, sc03, molds, params, materialLot, running });
            });
            // Equipment for weld lots: the robot with the gun of SC-05 on WD1.
            let defectQty = 0;
            const defects = {};
            let startup = 0;
            shiftLots.forEach((lot, li) => {
              if (li === 0 && changeover > 0) {
                const s = Math.min(lot.qty, rl.poisson(line.process === 'painting' ? 3 : 6));
                startup = s;
                lot.defectQty += s;
                const t = DEFECT_TYPES[line.process][0];
                lot.defects[t] = (lot.defects[t] ?? 0) + s;
              }
              lot.defectQty = Math.min(lot.defectQty, lot.qty);
              defectQty += lot.defectQty;
              for (const [t, q] of Object.entries(lot.defects)) defects[t] = (defects[t] ?? 0) + q;
              lot.stockQty = lot.shippedOn || !isFinalLine(productId, line.id) ? 0 : lot.qty - lot.defectQty;
              lots.push(lot);
            });
            // Keep the defect breakdown consistent with the capped totals.
            const typed = Object.values(defects).reduce((a, b) => a + b, 0);
            if (typed !== defectQty) {
              const first = Object.keys(defects)[0] ?? DEFECT_TYPES[line.process][0];
              defects[first] = (defects[first] ?? 0) + defectQty - typed;
            }
            const reworkQty = Math.round(defectQty * 0.4);
            const rec = {
              date: date(sh.start), shift: sh.id, siteId: site.id, lineId: line.id, productId,
              calendarMin: round(T, 1), plannedStopMin: round(plannedStop, 1), missingMin: round(missing, 1),
              breakdownMin: round(breakdown, 1), changeoverMin: round(changeover, 1), minorStopMin: round(minor, 1), minorStopCount: minorCount,
              plannedQty, totalQty, goodQty: totalQty - defectQty, scrapQty: defectQty - reworkQty, reworkQty, startupDefectQty: startup, defects
            };
            if (running) rec.running = true;
            shifts.push(rec);
            events.push(...recEvents);

            // Spread the shift's output over its hours for energy.
            const out = outputByHour.get(line.id);
            for (let t = sh.start; t < end; t += HOUR) {
              const overlap = Math.min(end, t + HOUR) - t;
              out[Math.floor((t - FROM) / HOUR)] += totalQty * (overlap / (end - sh.start));
            }
          }
        }
      });
    }
  }

  writeProduction(sites, shifts, events, lots);
  return { shifts, events, lots, outputByHour, activeByHour };
}

function makeLot({ rl, line, site, productId, machine, sh, li, qty, after, sc03, molds, params, materialLot, running }) {
  const t = sh.start;
  // Material lot changes every three workdays per site and process.
  const mkey = `${site.id}|${line.process}`;
  const cur = materialLot.get(mkey);
  if (!cur || t - cur.since >= 3 * DAY) materialLot.set(mkey, { id: `MAT-${site.id}-${ymd(t)}-${'ABCD'[Math.floor(t / DAY) % 4]}`, since: t });
  const mat = materialLot.get(mkey).id;
  const lotMolds = molds.filter((m) => m.productId === productId);
  const mold = lotMolds.length ? lotMolds[(Math.floor(t / DAY) + li + Number(machine.id.slice(-2))) % lotMolds.length].id : null;

  const sc02 = line.id === 'GMH-IM1' && productId === 'HG-FBC-410' && t >= parse('2026-09-21');
  const sc02Machine = sc02 && machine.id === 'GMH-IM1-M04';
  // SC-02 second cause: one resin lot dried too briefly on 09-22.
  const sc02Material = line.id === 'GMH-IM1' && t >= parse('2026-09-22') && t < parse('2026-09-23');
  // SC-05: the B-shift lot on the WD1 robot whose gun tips ran near the dressing limit.
  const sc05 = line.id === 'ASN-WD1' && sh.id === 'B' && li === 0 && t >= parse('2026-09-14') && t < parse('2026-09-17');
  // AX adoption on IM1 (2026-05-12): tighter mold temperature control before SC-02.
  const im1Tuned = line.id === 'GMH-IM1' && t >= parse('2026-05-12');

  const p = {};
  let effect = 0;
  const g = (mean, sd, spread) => {
    const m = rl.gauss(mean, sd);
    const s = Math.abs(rl.gauss(spread, spread * 0.2));
    return [m, m - s / 2, m + s / 2];
  };
  switch (line.process) {
    case 'press': {
      p.tonnage = g(line.id === 'ASN-PR1' ? 1150 : 950, 12, 30);
      p.spm = g(line.id === 'ASN-PR1' ? 12 : 20, 0.3, 0.8);
      p.dieTemp = g(38, 3, 6);
      effect += Math.max(0, Math.abs(p.tonnage[0] - (line.id === 'ASN-PR1' ? 1150 : 950)) / 20 - 0.5) * 0.4;
      break;
    }
    case 'welding': {
      const tip = sc05 ? rl.uniform(2850, 2960) : rl.uniform(300, 2550);
      p.current = g(sc05 ? 8.9 : 9.5, 0.12, 0.4);
      p.weldTime = g(220, 4, 10);
      p.tipCount = [tip, tip - 280, Math.min(2995, tip + 280)];
      effect += tip > 2700 ? 1.6 : 0;
      break;
    }
    case 'injection': {
      const spread = sc02Machine ? 11 : im1Tuned ? 3 : 4.5;
      p.meltTemp = g(235, 1.8, 5);
      p.moldTempFixed = g(sc02Machine ? 61 : 55, 1.2, spread);
      p.moldTempMoving = g(52, 1.2, 4);
      p.injPressure = g(95, 1.8, 5);
      p.holdTime = g(8, 0.2, 0.5);
      p.dryingTime = g(sc02Material ? 2.8 : 3.5, 0.1, 0.3);
      effect += Math.max(0, (p.moldTempFixed[2] - p.moldTempFixed[1] - 4) / 2) * 0.45;
      effect += Math.max(0, (3.2 - p.dryingTime[0]) / 0.3) * 0.8;
      break;
    }
    case 'painting': {
      p.ovenTemp = g(140, 1.4, 4);
      p.boothHumidity = g(60, 4, 6);
      p.filmThickness = g(32, 1.3, 4);
      effect += Math.max(0, (p.boothHumidity[0] - 65) / 5) * 0.8;
      break;
    }
    case 'machining': {
      const life = sc03 ? rl.uniform(84, 98) : rl.uniform(20, 80);
      p.spindleLoad = g(sc03 ? 74 : 62, 3, 8);
      p.toolLife = [life, Math.max(0, life - 25), Math.min(100, life + 15)];
      p.coolantTemp = g(24, 1, 3);
      effect += life > 85 ? 1.1 : 0;
      break;
    }
    case 'assembly': {
      p.torque = g(45, 0.5, 2);
      p.angle = g(120, 2.5, 8);
      p.eolPass = [1, 1, 1];
      effect += Math.max(0, Math.abs(p.torque[0] - 45) - 0.8) * 0.8;
      break;
    }
  }
  const digits = Object.fromEntries((params[line.process] ?? []).map((x) => [x.id, x.digits]));
  const rounded = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.map((x) => round(x, digits[k] ?? 1))]));

  const rate = BASE[line.process].defect * (after ? AX.defect : 1) * (1 + effect) * (sc02Machine ? 1.8 : 1);
  const defectQty = Math.min(qty, rl.poisson(qty * rate));
  const types = DEFECT_TYPES[line.process];
  const defects = {};
  for (let k = 0; k < defectQty; k++) {
    let ti;
    if (sc02Machine || sc02Material) ti = rl.chance(0.8) ? rl.int(0, 1) : rl.int(2, 3);
    else if (sc05) ti = rl.chance(0.7) ? 0 : rl.int(1, 3);
    else ti = rl.int(0, types.length - 1);
    defects[types[ti]] = (defects[types[ti]] ?? 0) + 1;
  }
  const lotEnd = Math.min(sh.end, NOW);
  const ship = lotEnd + DAY + Math.floor(rl.uniform(0, 1.5) * DAY);
  return {
    id: `LOT-${line.id}-${ymd(t)}-${sh.id}-${String(li + 1).padStart(2, '0')}`,
    siteId: site.id, lineId: line.id, productId, date: date(t), shift: sh.id,
    // Weld lots name the robot whose gun made the critical welds that shift.
    equipmentId: line.process === 'welding' ? (sc05 ? 'ASN-WD1-M07' : `${line.id}-M${String(1 + ((Math.floor(t / DAY) + li) % line.machines)).padStart(2, '0')}`) : machine.id,
    moldId: mold, materialLot: mat, qty, defectQty, defects, params: rounded,
    customerId: C.sites.find((s) => s.id === site.id).products.find((x) => x.id === productId).customer,
    // Only the product's last line ships; earlier lines feed the next line.
    shippedOn: !running && ship <= NOW && isFinalLine(productId, line.id) ? date(ship) : null, stockQty: 0
  };
}

function writeProduction(sites, shifts, events, lots) {
  const fields = ['date', 'shift', 'siteId', 'lineId', 'productId', 'calendarMin', 'plannedStopMin', 'missingMin', 'breakdownMin', 'changeoverMin', 'minorStopMin', 'minorStopCount', 'plannedQty', 'totalQty', 'goodQty', 'scrapQty', 'reworkQty', 'startupDefectQty', 'defects', 'running'];
  for (const s of sites) {
    const rows = shifts.filter((r) => r.siteId === s.id).map((r) => fields.map((f) => (f === 'running' ? (r.running ? 1 : 0) : r[f])));
    write(`production/${s.id}.json`, { siteId: s.id, fields, rows });
    write(`events/downtime-${s.id}.json`, events.filter((e) => e.siteId === s.id));
    const byQuarter = new Map();
    for (const l of lots.filter((x) => x.siteId === s.id)) {
      const q = quarterOf(parse(l.date));
      if (!byQuarter.has(q)) byQuarter.set(q, []);
      byQuarter.get(q).push(l);
    }
    for (const [q, list] of [...byQuarter].sort()) write(`lots/${s.id}-${q}.json`, list);
  }
}
