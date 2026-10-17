// Fail when src/ uses raw style values instead of design tokens.
//   - hex / rgb() / hsl() colors
//   - px lengths
//   - numeric size values in inline style objects (React turns them into px)
//   - primitive tokens (--p-*) outside the token file
// src/styles/tokens.css is the only exception and must equal docs/tokens.css.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');
const tokenFile = path.join(srcDir, 'styles', 'tokens.css');
const tokenSource = path.join(root, 'docs', 'tokens.css');

const rules = [
  { name: '색상값(hex)', re: /#[0-9a-fA-F]{3,8}\b(?![-\w])/g },
  { name: '색상 함수', re: /\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\(/g },
  { name: 'px 값', re: /\b\d*\.?\d+px\b/g },
  {
    // TS only: React and most libraries read a bare number as px. Zero is unitless and allowed.
    name: '숫자 크기값(px로 해석됨)',
    tsOnly: true,
    re: /\b(?:width|height|minWidth|maxWidth|minHeight|maxHeight|padding\w*|margin\w*|gap|rowGap|columnGap|top|left|right|bottom|inset|fontSize|borderRadius|borderWidth|outlineWidth|outlineOffset|letterSpacing|flexBasis|itemWidth|itemHeight|itemGap|symbolSize)\s*:\s*-?(?:[1-9]\d*|0?\.\d*[1-9])/g
  },
  { name: '1단(원시) 토큰 직접 참조', re: /var\(\s*--p-/g }
];

const problems = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|css)$/.test(entry.name) && full !== tokenFile) scan(full);
  }
};
const scan = (file) => {
  const isTs = /\.tsx?$/.test(file);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    // Ignore comments so explanations can mention units.
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    for (const rule of rules) {
      if (rule.tsOnly && !isTs) continue;
      for (const m of code.matchAll(rule.re)) {
        problems.push(`${path.relative(root, file)}:${i + 1}  ${rule.name}  "${m[0]}"`);
      }
    }
  });
};

if (!fs.existsSync(srcDir)) {
  console.error('src/ 폴더가 없습니다.');
  process.exit(1);
}
walk(srcDir);

if (!fs.existsSync(tokenFile)) {
  problems.push('src/styles/tokens.css가 없습니다. npm run tokens:sync를 실행하세요.');
} else if (fs.readFileSync(tokenFile, 'utf8') !== fs.readFileSync(tokenSource, 'utf8')) {
  problems.push('src/styles/tokens.css가 docs/tokens.css와 다릅니다. npm run tokens:sync를 실행하세요.');
}

if (problems.length) {
  console.error(`check:tokens 실패 — ${problems.length}건`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('check:tokens 통과 — src/에 색상값·px 직접 사용 없음, 토큰 파일 동기화됨');
