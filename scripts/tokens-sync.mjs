// Sync design tokens from the source file docs/tokens.css:
//   1. copy it to src/styles/tokens.css (the only file under src/ allowed to hold raw values)
//   2. regenerate docs/tokens.json (DTCG draft) from it
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcCss = path.join(root, 'docs/tokens.css');
const appCss = path.join(root, 'src/styles/tokens.css');
const jsonPath = path.join(root, 'docs/tokens.json');

const raw = fs.readFileSync(srcCss, 'utf8');
fs.mkdirSync(path.dirname(appCss), { recursive: true });
fs.writeFileSync(appCss, raw);

const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const decls = (body) => [...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]);

const r4 = (x) => Math.round(x * 10000) / 10000;
const hexColor = (h) => {
  h = h.toLowerCase();
  const c = [1, 3, 5].map((i) => r4(parseInt(h.slice(i, i + 2), 16) / 255));
  return { $type: 'color', $value: { colorSpace: 'srgb', components: c, hex: h } };
};
const rgbaColor = (v) => {
  const [r, g, b, a] = v.match(/rgba\(([^)]+)\)/)[1].split(',').map(Number);
  return { $type: 'color', $value: { colorSpace: 'srgb', components: [r, g, b].map((x) => r4(x / 255)), alpha: a } };
};
const dim = (v) => ({ $type: 'dimension', $value: { value: parseFloat(v), unit: 'px' } });

const tierOf = {};
let rootIndex = 0;
for (const b of blocks) {
  if (b.sel !== ':root') continue;
  const t = ['primitive', 'semantic', 'component'][rootIndex++];
  for (const [n] of decls(b.body)) tierOf[n] = t;
}
const refOf = (name) => {
  if (!tierOf[name]) throw new Error(`Unknown token reference --${name}`);
  return `{${tierOf[name]}.${name}}`;
};

const convert = (name, v) => {
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  if (ref) return { $value: refOf(ref[1]) };
  if (/^#[0-9a-f]{6}$/i.test(v)) return hexColor(v);
  if (v.startsWith('rgba(')) return rgbaColor(v);
  if (/^-?[\d.]+px$/.test(v)) return dim(v);
  if (name.startsWith('font-family')) {
    return { $type: 'fontFamily', $value: v.split(',').map((s) => s.trim().replace(/^'|'$/g, '')) };
  }
  if (name.startsWith('shadow')) {
    const m = v.match(/^([\d.]+)(?:px)?\s+([\d.]+)px\s+([\d.]+)px\s+var\(--([\w-]+)\)$/);
    if (!m) throw new Error(`Unhandled shadow --${name}: ${v}`);
    return {
      $type: 'shadow',
      $value: {
        color: refOf(m[4]),
        offsetX: { value: +m[1], unit: 'px' },
        offsetY: { value: +m[2], unit: 'px' },
        blur: { value: +m[3], unit: 'px' },
        spread: { value: 0, unit: 'px' }
      }
    };
  }
  throw new Error(`Unhandled value for --${name}: ${v}`);
};

const primitive = {}, semantic = {}, component = {}, dark = {}, standard = {};
rootIndex = 0;
for (const b of blocks) {
  const target =
    b.sel === ':root' ? [primitive, semantic, component][rootIndex++]
    : b.sel.includes('data-theme="dark"') ? dark
    : b.sel.includes('data-density="standard"') ? standard
    : null;
  if (!target) throw new Error(`Unknown selector ${b.sel}`);
  for (const [n, v] of decls(b.body)) target[n] = convert(n, v);
}

const out = {
  $description: '제조 AX 화면 디자인 토큰 (DTCG 형식 초안). 원본은 tokens.css이며 Style Dictionary로 검증 후 사용한다.',
  primitive,
  semantic,
  component,
  $extensions: { overrides: { 'theme-dark': dark, 'density-standard': standard } }
};
fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2) + '\n');
console.log(
  `tokens synced: primitive ${Object.keys(primitive).length}, semantic ${Object.keys(semantic).length}, ` +
  `component ${Object.keys(component).length}, dark ${Object.keys(dark).length}, standard ${Object.keys(standard).length}`
);
