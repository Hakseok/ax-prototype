import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev server only: POST /__dev/save-sample?name=<file> stores the request body under
 * docs/reports/samples/ so step reports can keep sample outputs (e.g. the PDF report).
 * Not part of any build.
 */
const saveSamples = (): Plugin => ({
  name: 'dev-save-sample',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__dev/save-sample', (req, res) => {
      const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('name') ?? '';
      if (req.method !== 'POST' || !/^[\w가-힣.-]+\.(pdf|csv|json|png)$/.test(name)) {
        res.statusCode = 400;
        res.end('bad request');
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const dir = path.resolve(__dirname, 'docs/reports/samples');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
        res.end('saved');
      });
    });
  }
});

export default defineConfig({
  // Relative asset and mock paths so the build works from any folder or static host.
  base: './',
  plugins: [react(), saveSamples()],
  server: { port: 5174, strictPort: true }
});
