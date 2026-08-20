#!/usr/bin/env node
// Schneider cubic-Bézier fitting via fit-curve@0.2.0 .
//
// stdin:  { "jobs": [ { "id": "...", "points": [[x,y],...], "corners": [i,...],
//                       "error": 0.6, "closed": false } ] }
// stdout: { "results": [ { "id": "...", "beziers": [[[x,y],[x,y],[x,y],[x,y]], ...] } ] }
//
// `corners` are indices into `points` that must survive as C0 breaks: the
// polyline is split there and each run is fitted independently, so a genuine
// pen corner is never smoothed into an arc.
import fitCurveMod from 'fit-curve';
import { isMain } from '../lib/proc.mjs';
const fitCurve = fitCurveMod.default || fitCurveMod;

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function dedupe(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const q = out[out.length - 1];
    if (Math.abs(p[0] - q[0]) > 1e-9 || Math.abs(p[1] - q[1]) > 1e-9) out.push(p);
  }
  return out;
}

function lineBezier(a, b) {
  const c1 = [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3];
  const c2 = [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3];
  return [a, c1, c2, b];
}

// Schneider fitting occasionally returns control points far outside the run
// (near-collinear input makes the tangent/alpha solve ill-conditioned).  Such a
// curve renders as a loop even though the sample error test passed, so reject
// it and fall back to a straight cubic rather than shipping a visible defect.
function sane(bez, run) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of run) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const diag = Math.hypot(maxX - minX, maxY - minY);
  const slack = 0.35 * diag + 1e-6;
  for (const [x, y] of bez) {
    if (x < minX - slack || x > maxX + slack || y < minY - slack || y > maxY + slack) {
      return false;
    }
  }
  return true;
}

function fitRun(points, error, depth = 0) {
  const pts = dedupe(points);
  if (pts.length < 2) return [];
  if (pts.length === 2) return [lineBezier(pts[0], pts[1])];
  let curves;
  try {
    curves = fitCurve(pts, error);
  } catch (e) {
    curves = null;
  }
  if (!curves || !curves.length) return [lineBezier(pts[0], pts[pts.length - 1])];
  if (curves.every((b) => sane(b, pts))) return curves;
  if (depth >= 3) return [lineBezier(pts[0], pts[pts.length - 1])];
  const mid = Math.floor(pts.length / 2);
  return [
    ...fitRun(pts.slice(0, mid + 1), error, depth + 1),
    ...fitRun(pts.slice(mid), error, depth + 1),
  ];
}

async function main() {
  const { jobs } = JSON.parse(await readStdin());
  const results = jobs.map((job) => {
    const { points, corners = [], error = 1.0 } = job;
    const breaks = [0, ...corners.filter((i) => i > 0 && i < points.length - 1), points.length - 1];
    const uniq = [...new Set(breaks)].sort((a, b) => a - b);
    const beziers = [];
    for (let k = 0; k < uniq.length - 1; k++) {
      const run = points.slice(uniq[k], uniq[k + 1] + 1);
      for (const b of fitRun(run, error)) beziers.push(b);
    }
    return { id: job.id, beziers };
  });
  process.stdout.write(JSON.stringify({ results }));
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(String(error?.stack || error));
    process.exitCode = 1;
  });
}
