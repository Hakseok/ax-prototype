// Shared helpers for the mock data generator: seeded random streams, naive KST time, file output.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT = path.join(ROOT, 'public/mock');
export const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, ''));
export const C = readJson('config/company.json');

// ---------- random ----------
const hashString = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
/** Independent deterministic stream per name, so adding one stream never shifts another. */
export const stream = (name) => {
  let a = (C.seed ^ hashString(name)) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return {
    next,
    normal,
    gauss: (mean, sd) => mean + sd * normal(),
    uniform: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    poisson: (lambda) => {
      if (lambda <= 0) return 0;
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > L);
      return k - 1;
    },
    lognormal: (mean, cv) => {
      const s2 = Math.log(1 + cv * cv);
      return Math.exp(Math.log(mean) - s2 / 2 + Math.sqrt(s2) * normal());
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p
  };
};

// ---------- time (naive KST on a UTC axis, same as src/data/time.ts) ----------
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const parse = (s) => {
  const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ](\d{2}):(\d{2}))?/);
  return Date.UTC(+m[1], +m[2] - 1, +(m[3] ?? 1), +(m[4] ?? 0), +(m[5] ?? 0));
};
export const iso = (t) => new Date(t).toISOString().slice(0, 16);
export const date = (t) => new Date(t).toISOString().slice(0, 10);
export const ymd = (t) => date(t).slice(2).replace(/-/g, '');
export const NOW = parse(C.now);
export const CURRENT_HOUR = NOW - (NOW % HOUR);
export const FROM = parse(C.dataPeriod.production.from);
export const DAYS = Math.round((parse(C.dataPeriod.production.to) - FROM) / DAY) + 1;
export const GO_LIVE = parse(C.ax.goLive);
export const SENSOR_FROM = parse(C.dataPeriod.sensorHourly.from);
export const QUARTER_FROM = parse(C.dataPeriod.energyQuarter.from);
export const quarterOf = (t) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
};

const holidays = new Set(C.shifts.holidays);
/** Workday: Mon–Fri not a holiday, plus the 1st and 3rd Saturday. */
export const isWorkday = (t) => {
  const d = new Date(t);
  const dow = d.getUTCDay();
  if (holidays.has(date(t))) return false;
  if (dow === 0) return false;
  if (dow === 6) {
    const nth = Math.floor((d.getUTCDate() - 1) / 7) + 1;
    return nth === 1 || nth === 3;
  }
  return true;
};

/** Shifts of a site on a day: { id, name, start, end } in ms, end exclusive. */
export const shiftsOf = (site, day) =>
  C.shifts[site.shiftPattern].map((s) => {
    const start = day + parse(`2000-01-01T${s.from}`) - parse('2000-01-01');
    let end = day + parse(`2000-01-01T${s.to}`) - parse('2000-01-01');
    if (end <= start) end += DAY;
    return { id: s.id, name: s.name, start, end };
  });

// ---------- output ----------
const written = [];
export const write = (rel, data) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  written.push(rel);
};
export const writtenFiles = () => [...written];

export const round = (v, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};
