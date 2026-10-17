// Check licenses of every installed package.
//   - Packages that ship with the app (production dependency tree) must use an allowed license.
//   - Build tools (dev tree) must not use a copyleft or commercial license; other notices are reported.
//   - AG Grid Enterprise must not be installed or imported.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(root, 'node_modules');

// BlueOak-1.0.0 and Zlib added by the user on 2026-10-17 (PDF report dependencies, decisions.md D-46).
const ALLOWED = ['MIT', 'MIT-0', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'ISC', 'OFL-1.1', 'BlueOak-1.0.0', 'Zlib'];
const FORBIDDEN = /\b(A?GPL|LGPL|SSPL|BUSL|Commercial|UNLICENSED|Proprietary)\b/i;

const pkgJson = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
};
// Packages whose package.json has no license field, checked by hand against the LICENSE file they ship.
const VERIFIED = { 'png-js@1.1.0': 'MIT' };

const licenseOf = (j) => {
  if (VERIFIED[`${j.name}@${j.version}`]) return VERIFIED[`${j.name}@${j.version}`];
  if (typeof j.license === 'string') return j.license;
  if (j.license && j.license.type) return j.license.type;
  if (Array.isArray(j.licenses)) return j.licenses.map((l) => l.type ?? l).join(' OR ');
  return 'UNKNOWN';
};
// "(MIT OR Apache-2.0)" passes if any alternative is allowed; "A AND B" needs all.
const isAllowed = (expr) => {
  const clean = expr.replace(/[()]/g, '').trim();
  if (/ OR /.test(clean)) return clean.split(/ OR /).some((p) => isAllowed(p));
  if (/ AND /.test(clean)) return clean.split(/ AND /).every((p) => isAllowed(p));
  return ALLOWED.includes(clean);
};

// Resolve a dependency the way Node does: nested node_modules first, then upwards.
const resolve = (name, fromDir) => {
  let dir = fromDir;
  while (true) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (dir === root) return null;
    dir = path.dirname(dir);
    if (!dir.startsWith(root)) return null;
  }
};

const rootPkg = pkgJson(root);
const walkTree = (deps) => {
  const seen = new Map();
  const stack = Object.keys(deps).map((n) => [n, root]);
  while (stack.length) {
    const [name, from] = stack.pop();
    const dir = resolve(name, from);
    if (!dir || seen.has(dir)) continue;
    const j = pkgJson(dir);
    seen.set(dir, { name: j.name, version: j.version, license: licenseOf(j) });
    for (const d of Object.keys({ ...j.dependencies, ...j.optionalDependencies })) stack.push([d, dir]);
    for (const d of Object.keys(j.peerDependencies ?? {})) if (resolve(d, dir)) stack.push([d, dir]);
  }
  return [...seen.values()];
};

const prod = walkTree(rootPkg.dependencies ?? {});
const prodKeys = new Set(prod.map((p) => `${p.name}@${p.version}`));
const dev = walkTree(rootPkg.devDependencies ?? {}).filter((p) => !prodKeys.has(`${p.name}@${p.version}`));

const failures = [];
const notices = [];
for (const p of prod) {
  if (!isAllowed(p.license)) failures.push(`[배포] ${p.name}@${p.version} — ${p.license}`);
}
for (const p of dev) {
  if (FORBIDDEN.test(p.license) || p.license === 'UNKNOWN') failures.push(`[개발] ${p.name}@${p.version} — ${p.license}`);
  else if (!isAllowed(p.license)) notices.push(`[개발 도구, 배포 안 됨] ${p.name}@${p.version} — ${p.license}`);
}

// AG Grid Enterprise: neither installed nor imported.
if (fs.existsSync(path.join(nm, 'ag-grid-enterprise'))) failures.push('ag-grid-enterprise 패키지가 설치되어 있음');
const srcDir = path.join(root, 'src');
const scanSrc = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) scanSrc(full);
    else if (/\.tsx?$/.test(e.name) && /ag-grid-enterprise|@ag-grid-enterprise/.test(fs.readFileSync(full, 'utf8'))) {
      failures.push(`${path.relative(root, full)}에서 AG Grid Enterprise를 가져옴`);
    }
  }
};
scanSrc(srcDir);

const summary = (list) => {
  const counts = {};
  for (const p of list) counts[p.license] = (counts[p.license] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join(', ');
};
console.log(`배포 패키지 ${prod.length}개: ${summary(prod)}`);
console.log(`개발 전용 패키지 ${dev.length}개: ${summary(dev)}`);
for (const n of notices) console.log('  참고 ' + n);

if (failures.length) {
  console.error(`check:licenses 실패 — ${failures.length}건`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log('check:licenses 통과');
