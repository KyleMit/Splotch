// Pilot "hand-drawn" glyphs for issue 234. The wobble is procedural (seeded
// jitter on a stroked centerline, then outlined into a filled shape) so the
// result meets the monochrome-icon contract: a single #1f1f1f fill, no
// stroke/none paints, canonical 0 0 1000 1000 viewBox.
import { writeFileSync } from "node:fs";

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
// Quadratic curve through the midpoints of consecutive points: the jittered
// polygon becomes a soft crayon edge instead of a saw blade.
function smoothPath(ring) {
  const n = ring.length;
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  let d = `M${pt(mid(ring[0], ring[1]).x, mid(ring[0], ring[1]).y)}`;
  for (let i = 1; i <= n; i++) {
    const p = ring[i % n];
    const m = mid(p, ring[(i + 1) % n]);
    d += `Q${pt(p.x, p.y)} ${pt(m.x, m.y)}`;
  }
  return d + 'Z';
}
const pt = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;

// Outline a centerline (array of {x,y}) into a closed polygon of the given width,
// with round-ish caps, jittered so the edge reads as a crayon line.
function outline(points, width, jitter = 6) {
  const left = [];
  const right = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[Math.min(i + 1, points.length - 1)];
    const o = points[Math.max(i - 1, 0)];
    const dx = q.x - o.x;
    const dy = q.y - o.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = width / 2 + rand() * jitter;
    left.push({ x: p.x + nx * w, y: p.y + ny * w });
    right.push({ x: p.x - nx * w, y: p.y - ny * w });
  }
  const cap = (a, b, c) => {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = c.x - mx;
    const dy = c.y - my;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: mx - (dx / len) * (width / 2),
      y: my - (dy / len) * (width / 2),
    };
  };
  const endCap = cap(left.at(-1), right.at(-1), points.at(-2));
  const startCap = cap(right[0], left[0], points[1]);
  const ring = [...left, endCap, ...right.reverse(), startCap];
  return `M${ring.map((p) => pt(p.x, p.y)).join("L")}Z`;
}

function wobblyCircle(cx, cy, r, steps = 40, jitter = 5) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r + rand() * jitter;
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  pts[pts.length - 1] = { ...pts[0] };
  return pts;
}

function line(x1, y1, x2, y2, steps = 12, jitter = 4) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({
      x: x1 + (x2 - x1) * t + rand() * jitter,
      y: y1 + (y2 - y1) * t + rand() * jitter,
    });
  }
  return pts;
}

// Gear: a wobbly ring with eight stubby teeth drawn as separate strokes, plus a
// small hub — the way a kid draws a gear, not a lathed Material silhouette.
function gear() {
  const cx = 500;
  const cy = 500;
  const paths = [outline(wobblyCircle(cx, cy, 240, 48, 4), 100, 5)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rand() * 0.05;
    paths.push(smoothPath(wobblyCircle(cx + Math.cos(a) * 325, cy + Math.sin(a) * 325, 82, 20, 6)));
  }
  paths.push(smoothPath(wobblyCircle(cx, cy, 70, 24, 4)));
  return paths.join("");
}

// Close: two crossing strokes that overshoot a touch, like a quick X.
function close() {
  return [
    outline(line(255, 245, 745, 755, 16, 4), 100, 6),
    outline(line(745, 250, 250, 750, 16, 4), 100, 6),
  ].join("");
}

const svg = (d) =>
  `<svg xmlns="http://www.w3.org/2000/svg" fill="#1f1f1f" viewBox="0 0 1000 1000"><path fill-rule="nonzero" d="${d}"/></svg>\n`;

const out = process.argv[2] ?? ".";
writeFileSync(`${out}/settings.svg`, svg(gear()));
writeFileSync(`${out}/close.svg`, svg(close()));
console.log(`wrote ${out}/settings.svg and ${out}/close.svg`);
