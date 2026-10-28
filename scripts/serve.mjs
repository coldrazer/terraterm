#!/usr/bin/env node
// Offline static server. No dependencies.
//   node scripts/serve.mjs            serves dist/terraterm.html at http://localhost:5173/
//   node scripts/serve.mjs --src      serves the unbundled src/ (edit and refresh, no build step)
//   PORT=8080 node scripts/serve.mjs
//   HOST=0.0.0.0 node scripts/serve.mjs   expose on the network (default: this machine only)
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const useSrc = process.argv.includes('--src');
const base = join(root, useSrc ? 'src' : 'dist');
const index = useSrc ? 'index.html' : 'terraterm.html';
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; connect-src 'self' http: https:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed'); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Bad Request'); return; }
  try {
    let path = pathname;
    if (path === '/') path = '/' + index;
    const baseReal = await realpath(base);
    const fileReal = await realpath(resolve(base, '.' + path));
    // Containment on resolved (symlink-free) paths, by segments not string prefix.
    const rel = relative(baseReal, fileReal);
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) { res.writeHead(403).end('Forbidden'); return; }
    const st = await stat(fileReal);
    if (!st.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': types[extname(fileReal)] || 'application/octet-stream', 'Cache-Control': 'no-store', ...securityHeaders });
    res.end(req.method === 'HEAD' ? undefined : await readFile(fileReal));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, host, () => {
  console.log(`TERRATERM ${useSrc ? '(src)' : '(dist)'} at http://localhost:${port}/` + (host === '127.0.0.1' ? '' : `  (listening on ${host})`));
  console.log(`Demo run:      http://localhost:${port}/#demo`);
  console.log(`Deep link:     http://localhost:${port}/#/orbital/ela-segundo-tanks/grp-b`);
});
