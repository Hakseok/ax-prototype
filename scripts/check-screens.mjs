// Validate config/menu.json, config/terms.json, config/industry-templates.json and every
// config/screens/*.json against each other, the schema and the names the code defines.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Strip a UTF-8 BOM, which some Windows editors add.
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8').replace(/^﻿/, ''));
const exists = (rel) => fs.existsSync(path.join(root, rel));

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

const menu = readJson('config/menu.json');
const terms = readJson('config/terms.json');
const company = readJson('config/company.json');
const templates = readJson('config/industry-templates.json').templates;

const PATTERNS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12'];
const SITE_SCOPES = ['site-or-company', 'site-only', 'company-only', 'common'];
const PERMISSIONS = ['조회', '편집', '관리'];
const ID_RE = /^[A-Z]{3}-\d{3}$/;

// ---- menu.json ----
const groupCodes = new Set(menu.groups.map((g) => g.code));
const allIds = new Map();
for (const s of menu.screens) {
  const where = `menu.json ${s.id}`;
  if (!ID_RE.test(s.id)) err(where, '화면 ID 형식이 아님 (예: EXE-010)');
  else if (!s.parent && Number(s.id.slice(4)) % 10 !== 0) err(where, '메뉴 화면 ID는 10 단위여야 함 (딸린 화면은 parent 지정)');
  if (allIds.has(s.id)) err(where, '화면 ID 중복');
  allIds.set(s.id, s);
  if (!s.id.startsWith(s.group + '-')) err(where, `ID 약어가 대메뉴(${s.group})와 다름`);
  if (!groupCodes.has(s.group)) err(where, `없는 대메뉴 ${s.group}`);
  if (!PATTERNS.includes(s.pattern)) err(where, `알 수 없는 패턴 ${s.pattern}`);
  if (!SITE_SCOPES.includes(s.siteScope)) err(where, `알 수 없는 siteScope ${s.siteScope}`);
  if (!PERMISSIONS.includes(s.view)) err(where, `view 권한 ${s.view}`);
  if (s.edit && !PERMISSIONS.includes(s.edit)) err(where, `edit 권한 ${s.edit}`);
  if (!['now', 'next'].includes(s.phase)) err(where, `phase ${s.phase}`);
  if (!s.name || !s.summary) err(where, 'name 또는 summary 누락');
}
for (const s of menu.screens) if (s.parent && !allIds.has(s.parent)) err(`menu.json ${s.id}`, `parent ${s.parent} 없음`);
for (const c of menu.common) {
  if (allIds.has(c.id)) err(`menu.json ${c.id}`, '화면 ID 중복');
  allIds.set(c.id, c);
}
for (const r of menu.roles) {
  const home = allIds.get(r.home);
  if (!home) err(`menu.json role ${r.id}`, `첫 화면 ${r.home} 없음`);
  else if (home.phase !== 'now') err(`menu.json role ${r.id}`, `첫 화면 ${r.home}이 이번 버전 화면이 아님`);
  const order = [...r.groupOrder].sort().join();
  if (order !== [...groupCodes].sort().join()) err(`menu.json role ${r.id}`, 'groupOrder가 대메뉴 전체와 다름');
}
for (const u of company.users) if (!menu.roles.some((r) => r.id === u.role)) err(`company.json ${u.id}`, `없는 역할 ${u.role}`);
for (const sc of company.scenarios) {
  for (const id of sc.screens) {
    const s = allIds.get(id);
    if (!s) err(`company.json ${sc.id}`, `화면 ${id}가 메뉴에 없음`);
    else if (s.phase !== 'now') err(`company.json ${sc.id}`, `화면 ${id}가 이번 버전 화면이 아님`);
  }
}

// ---- terms.json ----
const allowedButtons = new Set([
  ...terms.buttons.commands,
  ...terms.buttons.auxiliary.map((b) => b.label),
  ...terms.buttons.judgement.map((b) => b.label),
  ...terms.buttons.workflow.map((b) => b.label)
]);
if (terms.buttons.commands.length !== 6) err('terms.json', '명령 버튼은 6개여야 함');

// ---- code names: datasets, references, metrics ----
const read = (rel) => (exists(rel) ? fs.readFileSync(path.join(root, rel), 'utf8') : '');
const registrySrc = read('src/data/registry.ts');
const blockKeys = (start) => {
  const from = registrySrc.indexOf(start);
  if (from < 0) return new Set();
  const body = registrySrc.slice(from, registrySrc.indexOf('\n};', from));
  return new Set([...body.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
};
const datasetNames = blockKeys('export const datasets');
const refNames = blockKeys('export const refs');
// Metric ids are the keys of METRICS in src/data/metrics/catalog.ts (step 4).
const metricSrc = read('src/data/metrics/catalog.ts');
const metricIds = new Set([...metricSrc.matchAll(/^ {2}'([\w.]+)':/gm)].map((m) => m[1]));

// ---- industry templates refer to the KPI dictionary ----
const dictionary = read('docs/kpi-dictionary.md');
const dictIds = new Set([...dictionary.matchAll(/\| `([\w.]+)` \|/g)].map((m) => m[1]));
for (const t of templates) {
  for (const k of [...t.kpis, ...t.headlineKpis, ...t.qualityMetrics]) if (!dictIds.has(k)) err(`industry-templates ${t.id}`, `지표 사전에 없는 지표 ${k}`);
  for (const k of t.headlineKpis) if (!t.kpis.includes(k)) err(`industry-templates ${t.id}`, `headlineKpis ${k}가 kpis에 없음`);
}

// ---- screens/*.json ----
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(readJson('config/screen-definition.schema.json'));
const screensDir = path.join(root, 'config/screens');
const files = fs.existsSync(screensDir) ? fs.readdirSync(screensDir).filter((f) => f.endsWith('.json')) : [];
const checkLink = (where, to) => {
  if (!allIds.has(to)) err(where, `링크 대상 ${to}이 menu.json에 없음`);
};
const walk = (node, visit, where = '') => {
  if (Array.isArray(node)) return node.forEach((n, i) => walk(n, visit, `${where}[${i}]`));
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    visit(k, v, `${where}.${k}`);
    walk(v, visit, `${where}.${k}`);
  }
};

for (const file of files) {
  const where = `screens/${file}`;
  let def;
  try {
    def = readJson(`config/screens/${file}`);
  } catch (e) {
    err(where, `JSON 형식 오류: ${e.message}`);
    continue;
  }
  if (!validate(def)) {
    for (const e of validate.errors) err(where, `형식 오류 ${e.instancePath || '/'} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ''}`);
  }
  if (file !== `${def.id}.json`) err(where, `파일명과 id(${def.id})가 다름`);
  const entry = allIds.get(def.id);
  if (!entry) {
    err(where, `id ${def.id}가 menu.json에 없음`);
    continue;
  }
  if (def.pattern !== entry.pattern) err(where, `pattern ${def.pattern}이 menu.json(${entry.pattern})과 다름`);
  if (def.title !== entry.name) err(where, `title "${def.title}"이 메뉴명 "${entry.name}"과 다름`);
  if (entry.view && def.permission?.view !== entry.view) err(where, `permission.view ${def.permission?.view}이 menu.json(${entry.view})과 다름`);
  if (entry.phase === 'next') err(where, '다음 버전 화면에 정의 파일이 있음 (menu.json phase를 now로)');

  walk(def, (k, v, w) => {
    if (k === 'dataSource' && typeof v === 'string' && !datasetNames.has(v)) err(where, `${w} "${v}"가 registry에 없음`);
    if ((k === 'ref' || k === 'options') && typeof v === 'string' && !refNames.has(v)) err(where, `${w} "${v}"가 참조 목록에 없음`);
    if (k === 'metric' && typeof v === 'string' && !metricIds.has(v.split(':')[0])) err(where, `${w} 알 수 없는 지표 "${v}" (src/data/metrics/catalog.ts)`);
    if (k === 'actions' && Array.isArray(v)) for (const a of v) if (!allowedButtons.has(typeof a === 'string' ? a : a.label)) err(where, `${w} 버튼 명칭 "${a}"이 terms.json에 없음`);
    if ((k === 'to') && typeof v === 'string' && ID_RE.test(v)) checkLink(`${where} ${w}`, v);
  });

  const filters = def.filters ?? [];
  const period = filters.findIndex((f) => ['dateRange', 'date', 'month', 'year'].includes(f.control));
  if (period > 0) err(where, '기간 조건은 첫 번째여야 함');
  const visible = filters.filter((f) => !f.collapsed).length;
  if (visible > 5) err(where, `펼친 조회 조건이 ${visible}개 (5개 이하, 나머지는 collapsed)`);
}

if (errors.length) {
  console.error(`check:screens 실패 — ${errors.length}건`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
const now = menu.screens.filter((s) => s.phase === 'now').length;
console.log(
  `check:screens 통과 — 메뉴 화면 ${menu.screens.length}개(이번 버전 ${now}, 다음 버전 ${menu.screens.length - now})·공통 ${menu.common.length}개, ` +
  `화면 정의 ${files.length}개, 업종 템플릿 ${templates.length}개`
);
