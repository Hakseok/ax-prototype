// npm run fonts:pdf — unwrap the IBM Plex Sans KR WOFF files of @ibm/plex-sans-kr (OFL-1.1) into
// TrueType files for the PDF report. WOFF 1.0 is a compressed wrapper around the original sfnt
// tables; this inflates each table and writes them back unchanged (same bytes, same checksums,
// no glyph or name changes). Reading TrueType directly makes PDF export about 20x faster.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules/@ibm/plex-sans-kr/fonts/complete/woff/hinted');
const dst = path.join(root, 'public/fonts');

const unwrap = (woff) => {
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const offset = woff.readUInt32BE(o + 4);
    const compLength = woff.readUInt32BE(o + 8);
    const origLength = woff.readUInt32BE(o + 12);
    const raw = woff.subarray(offset, offset + compLength);
    tables.push({
      tag: woff.toString('latin1', o, o + 4),
      checksum: woff.readUInt32BE(o + 16),
      data: compLength < origLength ? zlib.inflateSync(raw) : Buffer.from(raw)
    });
  }
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  let pow = 1;
  let log = 0;
  while (pow * 2 <= numTables) {
    pow *= 2;
    log++;
  }
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(pow * 16, 6);
  header.writeUInt16BE(log, 8);
  header.writeUInt16BE(numTables * 16 - pow * 16, 10);
  const parts = [header];
  let offset = header.length;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    header.write(t.tag, o, 'latin1');
    header.writeUInt32BE(t.checksum, o + 4);
    header.writeUInt32BE(offset, o + 8);
    header.writeUInt32BE(t.data.length, o + 12);
    const padded = Buffer.alloc((t.data.length + 3) & ~3);
    t.data.copy(padded);
    parts.push(padded);
    offset += padded.length;
  });
  return Buffer.concat(parts);
};

fs.mkdirSync(dst, { recursive: true });
for (const weight of ['Regular', 'SemiBold']) {
  const out = path.join(dst, `IBMPlexSansKR-${weight}.ttf`);
  const buf = unwrap(fs.readFileSync(path.join(src, `IBMPlexSansKR-${weight}.woff`)));
  fs.writeFileSync(out, buf);
  console.log(`${path.relative(root, out)} ${(buf.length / 1048576).toFixed(1)} MB`);
}
fs.copyFileSync(path.join(root, 'node_modules/@ibm/plex-sans-kr/LICENSE.txt'), path.join(dst, 'IBMPlexSansKR-OFL.txt'));
for (const f of fs.readdirSync(dst)) if (f.endsWith('.woff')) fs.rmSync(path.join(dst, f));
