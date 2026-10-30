// TERRATERM SAM 3.1 token-grammar parser helper.
//
// Reads the API output_text on stdin, runs Meta's official parser
// (@meta-sam/parser, formats.segmentation.image), and prints one JSON
// array on stdout: [{ objectId, confidence, bounds, svg }].
// Empty stdin prints []. Anything else goes to stderr, never stdout.
// The Python service (api_client.py) turns each SVG mask path into a
// polygon and an area; this helper never touches keys or the network.
//
// Requires: node, plus `npm install` at the repo root for the parser
// package (package.json dependency).
import { formats, decodeMaskToSVGPath } from '@meta-sam/parser';
import fs from 'node:fs';

const text = fs.readFileSync(0, 'utf8');
if (!text.trim()) {
  console.log('[]');
  process.exit(0);
}
const parser = formats.segmentation.image().createParser();
parser.push(text.endsWith('\n') ? text : text + '\n');
const { result } = parser.finish({ status: 'complete' });
if (result.diagnostics && result.diagnostics.length) {
  console.error('parser diagnostics: ' + JSON.stringify(result.diagnostics));
  process.exit(2);
}
const out = [];
for (const r of result.records) {
  if (r.kind !== 'mask') continue;
  let svg = null;
  try {
    svg = decodeMaskToSVGPath(r.mask);
  } catch (e) {
    console.error('mask decode failed: ' + (e && e.message ? e.message : e));
    process.exit(3);
  }
  out.push({
    objectId: r.objectId ?? null,
    confidence: r.confidence ?? null,
    bounds: r.bounds,
    encoding: r.mask.encoding,
    maskWidth: r.mask.width,
    maskHeight: r.mask.height,
    svg: svg,
  });
}
console.log(JSON.stringify(out));
