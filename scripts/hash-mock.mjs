// Print one SHA-256 digest over every file in public/mock (path + content), for determinism checks.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'mock');
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(root);
files.sort();
const hash = crypto.createHash('sha256');
for (const f of files) {
  hash.update(path.relative(root, f).replace(/\\/g, '/'));
  hash.update(fs.readFileSync(f));
}
console.log(`${files.length} files ${hash.digest('hex')}`);
