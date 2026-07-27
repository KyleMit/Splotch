export function circlePts(cx, cy, r, turns = 1, n = 48) {
  const pts = [];
  for (let i = 0; i <= n * turns; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export function arcPts(cx, cy, r, a0, a1, n = 60) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export function zigzag(x0, y, x1, amp, step) {
  const pts = [];
  let up = true;
  for (let x = x0; x <= x1; x += step) {
    pts.push({ x, y: y + (up ? -amp : amp) });
    up = !up;
  }
  return pts;
}
