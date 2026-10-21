export function circlePts(cx, cy, r, turns = 1, n = 48) {
  const pts = [];
  for (let i = 0; i <= n * turns; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}
