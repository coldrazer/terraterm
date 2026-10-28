#!/usr/bin/env node
// Offline build: inlines src/ CSS and JS into single-file outputs. No network, no dependencies.
// Replacements use functions so `$` sequences in the code are never treated as patterns.
//   node scripts/build.mjs
// Outputs:
//   dist/terraterm.html            standalone document (open directly or serve)
//   dist/terraterm.artifact.html   body-only variant for hosts that supply their own <html>/<head>
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const out = join(root, 'dist');
mkdirSync(out, { recursive: true });

let html = readFileSync(join(src, 'index.html'), 'utf8');
const read = (rel) => readFileSync(join(src, rel), 'utf8');

const styles = [];
html = html.replace(/<link rel="stylesheet" href="([^"]+)">\n?/g, (_, href) => { styles.push(read(href)); return ''; });
const scripts = [];
html = html.replace(/<script src="([^"]+)"><\/script>\n?/g, (_, s) => { scripts.push({ name: s, code: read(s) }); return ''; });

for (const s of scripts) if (/<\/script/i.test(s.code)) throw new Error(`${s.name} contains a closing script tag`);
for (const c of styles) if (/<\/style/i.test(c)) throw new Error('CSS contains a closing style tag');

const css = styles.join('\n');
const js = scripts.map((s) => `/* ---- ${s.name} ---- */\n${s.code}`).join('\n');
const bootMatch = html.match(/<script id="terraterm-boot">\s*([\s\S]*?)<\/script>/);
if (!bootMatch) throw new Error('src/index.html is missing <script id="terraterm-boot">');
const boot = bootMatch[1].trim();

const standalone = html
  .replace('</head>', () => `<style>\n${css}\n</style>\n</head>`)
  .replace(/<script id="terraterm-boot">\s*[\s\S]*?<\/script>/, () => `<script>\n${js}\n${boot}\n</script>`);
writeFileSync(join(out, 'terraterm.html'), standalone);

const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const desc = html.match(/<meta name="description"[^>]*>/)[0];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<!--[\s\S]*?-->\n?/g, '')
  .replace(/<script id="terraterm-boot">\s*[\s\S]*?<\/script>/, () => `<script>\n${js}\n${boot}\n</script>`);
const artifact = `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${desc}\n<style>\n${css}\n</style>\n${body.trim()}\n`;
writeFileSync(join(out, 'terraterm.artifact.html'), artifact);

const kb = (f) => (statSync(join(out, f)).size / 1024).toFixed(1) + ' KB';
console.log(`built dist/terraterm.html (${kb('terraterm.html')}) and dist/terraterm.artifact.html (${kb('terraterm.artifact.html')}) from ${scripts.length} scripts, ${styles.length} stylesheets`);
