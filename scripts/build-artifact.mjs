// Prepares dist/ for publishing as a claude.ai Artifact (dist-artifact/).
// - Drops the .woff font fallbacks (every target browser reads .woff2) to stay under the file limit.
// - Writes the page as a body fragment: the Artifact host adds the document skeleton itself.
// - Writes dist-artifact/files.json, the list of supporting files split into publish batches.
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('dist');
const OUT = path.resolve('dist-artifact');
const BATCH = 250;

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const rel = (f) => path.relative(OUT, f).split(path.sep).join('/');

for (const f of walk(OUT)) {
  if (f.endsWith('.woff')) fs.rmSync(f);
  else if (f.endsWith('.css')) {
    const css = fs.readFileSync(f, 'utf8').replace(/,\s*url\([^)]*?\.woff\)\s*format\(["']woff["']\)/g, '');
    if (/\.woff\)/.test(css)) throw new Error(`.woff reference left in ${rel(f)}`);
    fs.writeFileSync(f, css);
  }
}

const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0].replace(/\s+crossorigin/g, ''));
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const page = [title, ...pick(/<link rel="stylesheet"[^>]*>/g), '<div id="root"></div>', ...pick(/<script type="module"[^>]*><\/script>/g)].join('\n');
fs.writeFileSync(path.join(OUT, 'index.html'), page + '\n');

const files = walk(OUT).map(rel).filter((f) => f !== 'index.html' && f !== 'files.json').sort();
const batches = [];
for (let i = 0; i < files.length; i += BATCH) batches.push(files.slice(i, i + BATCH));
fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify({ count: files.length, batches }, null, 2));
const size = walk(OUT).reduce((a, f) => a + fs.statSync(f).size, 0);
console.log(`dist-artifact: 페이지 1개 + 파일 ${files.length}개 (${batches.length}회로 나눠 게시), ${(size / 1048576).toFixed(1)} MB`);
