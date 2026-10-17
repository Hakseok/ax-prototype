// npm run gen:data — builds every mock file in public/mock from config/company.json with a fixed seed.
// Running it twice gives byte-identical output (checked by scripts/hash-mock.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { C, CURRENT_HOUR, FROM, HOUR, NOW, OUT, QUARTER_FROM, SENSOR_FROM, iso, quarterOf, write, writtenFiles } from './lib.mjs';
import { buildMaster } from './master.mjs';
import { buildProduction } from './production.mjs';
import { buildMaintenance, buildSensors } from './assets.mjs';
import { buildQuality } from './quality.mjs';
import { buildEnergy } from './energy.mjs';
import { buildEvents } from './events.mjs';

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const master = buildMaster();
const production = buildProduction(master);
buildSensors(master, production);
buildMaintenance(master, production);
buildQuality(master, production);
const energy = buildEnergy(master, production);
buildEvents(master, production);

const quarters = [...new Set(production.lots.map((l) => quarterOf(Date.parse(l.date + 'T00:00Z'))))].sort();
write('manifest.json', {
  now: C.now,
  seed: C.seed,
  production: { from: C.dataPeriod.production.from, to: C.dataPeriod.production.to },
  sensorHourly: { from: iso(SENSOR_FROM), hours: Math.round((CURRENT_HOUR - SENSOR_FROM) / HOUR) },
  energyHourly: { from: iso(FROM), hours: energy.hourly },
  energyQuarter: { from: iso(QUARTER_FROM), slots: energy.slots },
  sites: master.sites.map((s) => s.id),
  quarters,
  files: writtenFiles().length + 1
});

const files = writtenFiles();
const size = files.reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
console.log(
  `gen:data — 파일 ${files.length}개, ${(size / 1048576).toFixed(1)} MB · 교대 실적 ${production.shifts.length}행 · 로트 ${production.lots.length}개 · ` +
  `비가동 사건 ${production.events.length}건 · 현재 ${iso(NOW)}`
);
