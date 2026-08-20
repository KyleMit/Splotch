// In-page canvas renderer for tools/model-eval/gen-model-fixtures.mjs. Loaded into the Playwright
// page with addScriptTag, so it is plain browser JS — no Node built-ins, no import/export.
// It reads the paper colors and palette the script publishes as window.__PAPER /
// window.__PALETTE, and exposes window.renderFixture + window.__coloredPct.
//
// Wrapped in an IIFE because the script is re-injected after every page.setContent, and the
// page's global lexical scope survives that — top-level const/let would throw on re-injection.
(() => {
  const P = window.__PAPER;
  const PAL = window.__PALETTE;
  let ctx,
    W,
    H,
    seed = 987654;
  function rnd() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  function jit(n) {
    return (rnd() * 2 - 1) * n;
  }
  function loadImg(uri) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = uri;
    });
  }
  function containBox(iw, ih) {
    const pad = 0.06;
    const bw = W * (1 - 2 * pad),
      bh = H * (1 - 2 * pad);
    const s = Math.min(bw / iw, bh / ih);
    const dw = iw * s,
      dh = ih * s;
    return { x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh };
  }
  function paper(theme) {
    const pc = P[theme];
    ctx.fillStyle = pc.fill;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = pc.margin;
    ctx.lineWidth = Math.max(6, W * 0.012);
    ctx.strokeRect(W * 0.03, H * 0.03, W * 0.94, H * 0.94);
    // faint grain
    ctx.save();
    ctx.globalAlpha = 0.04;
    for (let i = 0; i < (W * H) / 2600; i++) {
      ctx.fillStyle = theme === 'night' ? '#fff' : '#000';
      ctx.fillRect(rnd() * W, rnd() * H, 1.4, 1.4);
    }
    ctx.restore();
  }
  function crayon(pts, color, w, alpha) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha == null ? 0.9 : alpha;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const jx = x + jit(3),
        jy = y + jit(3);
      if (i) ctx.lineTo(jx, jy);
      else ctx.moveTo(jx, jy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function strokePaths(g, strokes, w0) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const s of strokes) {
      g.lineWidth = s.w || w0 || 40;
      g.beginPath();
      s.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.stroke();
    }
  }
  async function drawOutline(uri) {
    if (!uri) return;
    const img = await loadImg(uri);
    const b = containBox(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, b.x, b.y, b.w, b.h);
  }
  // Authored SVG scenes (tools/store-drawings/samples) draw straight onto the
  // paper: they are already the child's colored strokes on transparency, so
  // unlike coloring line art there is nothing to multiply or invert away. The
  // viewBox dimensions come from the spec because an <img> holding a
  // width/height-less SVG reports no intrinsic size.
  async function drawArt(uri, vw, vh) {
    if (!uri) return;
    const img = await loadImg(uri);
    const b = containBox(vw || img.naturalWidth, vh || img.naturalHeight);
    ctx.drawImage(img, b.x, b.y, b.w, b.h);
  }
  async function revealFill(uri, strokes) {
    if (!uri) return;
    const img = await loadImg(uri);
    const b = containBox(img.naturalWidth, img.naturalHeight);
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const o = off.getContext('2d');
    o.strokeStyle = '#000';
    strokePaths(o, strokes);
    o.globalCompositeOperation = 'source-in';
    o.drawImage(img, b.x, b.y, b.w, b.h);
    ctx.drawImage(off, 0, 0);
  }
  function revealGradient(angle, strokes) {
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const o = off.getContext('2d');
    o.strokeStyle = '#000';
    strokePaths(o, strokes);
    o.globalCompositeOperation = 'source-in';
    const cx = W / 2,
      cy = H / 2,
      half = (Math.abs(Math.cos(angle)) * W + Math.abs(Math.sin(angle)) * H) / 2;
    const g = o.createLinearGradient(
      cx - Math.cos(angle) * half,
      cy - Math.sin(angle) * half,
      cx + Math.cos(angle) * half,
      cy + Math.sin(angle) * half
    );
    const hs = rnd() * 360;
    for (let s = 0; s < 6; s++) {
      g.addColorStop(s / 5, 'hsl(' + ((hs + s * 60) % 360) + ',80%,60%)');
    }
    o.fillStyle = g;
    o.fillRect(0, 0, W, H);
    ctx.drawImage(off, 0, 0);
  }
  function paletteStrokes(strokes, color) {
    for (const s of strokes) {
      crayon(s.pts, color, s.w || 22, 0.82);
    }
  }

  // --- freehand scenes ---
  function dot(x, y, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
  }
  function circle(cx, cy, r, c, w) {
    const p = [];
    for (let a = 0; a < 7; a += 0.25) p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    crayon(p, c, w);
  }
  function ellipse(cx, cy, rx, ry, c, w) {
    const p = [];
    for (let a = 0; a < 7; a += 0.25) p.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    crayon(p, c, w);
  }
  function rect(x0, y0, x1, y1, c, w) {
    crayon(
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ],
      c,
      w
    );
  }
  function tri(p, c, w) {
    crayon([...p, p[0]], c, w);
  }
  function rays(cx, cy, r0, r1, c, w) {
    for (let a = 0; a < 7; a += Math.PI / 6)
      crayon(
        [
          [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0],
          [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1],
        ],
        c,
        w
      );
  }
  function sunAt(x, y, r) {
    circle(x, y, r, PAL.yellow, 12);
    rays(x, y, r, r * 1.7, PAL.yellow, 7);
  }
  function scrib(x0, y0, x1, y1, c, rows, w) {
    for (let i = 0; i < rows; i++) {
      const y = y0 + ((i + 0.5) * (y1 - y0)) / rows;
      const l = i % 2 ? x1 : x0,
        r = i % 2 ? x0 : x1;
      crayon(
        [
          [l + jit(10), y + jit(8)],
          [r + jit(10), y + jit(8)],
        ],
        c,
        w,
        0.8
      );
    }
  }
  function person(x, y, shirt) {
    circle(x, y, W * 0.05, PAL.orange, 10);
    dot(x - W * 0.017, y - W * 0.012, W * 0.008, PAL.black);
    dot(x + W * 0.017, y - W * 0.012, W * 0.008, PAL.black);
    crayon(
      [
        [x - W * 0.02, y + W * 0.02],
        [x, y + W * 0.03],
        [x + W * 0.02, y + W * 0.02],
      ],
      PAL.red,
      5
    );
    const L = W * 0.14;
    crayon(
      [
        [x, y + W * 0.05],
        [x, y + L],
      ],
      shirt,
      20
    );
    crayon(
      [
        [x, y + W * 0.08],
        [x - W * 0.07, y + W * 0.14],
      ],
      shirt,
      12
    );
    crayon(
      [
        [x, y + W * 0.08],
        [x + W * 0.07, y + W * 0.14],
      ],
      shirt,
      12
    );
    crayon(
      [
        [x, y + L],
        [x - W * 0.05, y + L + W * 0.1],
      ],
      PAL.blue,
      12
    );
    crayon(
      [
        [x, y + L],
        [x + W * 0.05, y + L + W * 0.1],
      ],
      PAL.blue,
      12
    );
  }
  const SCENES = {
    dots() {
      const cs = [PAL.red, PAL.blue, PAL.green, PAL.yellow, PAL.purple];
      for (let i = 0; i < 7; i++) {
        const c = cs[i % cs.length];
        const x = W * (0.2 + rnd() * 0.6),
          y = H * (0.2 + rnd() * 0.6);
        const p = [[x, y]];
        for (let j = 0; j < 3; j++) p.push([x + jit(60), y + jit(60)]);
        crayon(p, c, 14 + rnd() * 10);
      }
    },
    sun() {
      sunAt(W * 0.5, H * 0.4, W * 0.13);
      crayon(
        [
          [W * 0.15, H * 0.75],
          [W * 0.85, H * 0.72],
        ],
        PAL.green,
        16
      );
    },
    house() {
      scrib(W * 0.06, H * 0.62, W * 0.94, H * 0.9, PAL.green, 7, 12);
      rect(W * 0.3, H * 0.45, W * 0.7, H * 0.75, PAL.red, 12);
      tri(
        [
          [W * 0.3, H * 0.45],
          [W * 0.7, H * 0.45],
          [W * 0.5, H * 0.28],
        ],
        PAL.brown,
        12
      );
      rect(W * 0.55, H * 0.58, W * 0.65, H * 0.75, PAL.brown, 9);
      rect(W * 0.36, H * 0.52, W * 0.46, H * 0.62, PAL.blue, 8);
      sunAt(W * 0.82, H * 0.16, W * 0.07);
    },
    family() {
      person(W * 0.3, H * 0.4, PAL.red);
      person(W * 0.5, H * 0.36, PAL.blue);
      person(W * 0.7, H * 0.44, PAL.purple);
      crayon(
        [
          [W * 0.05, H * 0.85],
          [W * 0.95, H * 0.86],
        ],
        PAL.green,
        16
      );
      sunAt(W * 0.13, H * 0.18, W * 0.06);
    },
    cat() {
      ellipse(W * 0.5, H * 0.56, W * 0.2, H * 0.16, PAL.orange, 14);
      circle(W * 0.5, H * 0.34, W * 0.14, PAL.orange, 14);
      tri(
        [
          [W * 0.38, H * 0.24],
          [W * 0.46, H * 0.34],
          [W * 0.36, H * 0.36],
        ],
        PAL.orange,
        10
      );
      tri(
        [
          [W * 0.62, H * 0.24],
          [W * 0.54, H * 0.34],
          [W * 0.64, H * 0.36],
        ],
        PAL.orange,
        10
      );
      dot(W * 0.45, H * 0.33, 10, PAL.black);
      dot(W * 0.55, H * 0.33, 10, PAL.black);
      tri(
        [
          [W * 0.49, H * 0.36],
          [W * 0.51, H * 0.36],
          [W * 0.5, H * 0.38],
        ],
        PAL.pink,
        7
      );
      scrib(W * 0.34, H * 0.44, W * 0.66, H * 0.68, PAL.orange, 6, 7);
    },
    flower() {
      crayon(
        [
          [W * 0.5, H * 0.9],
          [W * 0.5, H * 0.56],
        ],
        PAL.green,
        18
      );
      ellipse(W * 0.44, H * 0.68, W * 0.05, H * 0.03, PAL.green, 10);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * 7;
        ellipse(
          W * 0.5 + Math.cos(a) * W * 0.12,
          H * 0.44 + Math.sin(a) * H * 0.09,
          W * 0.06,
          H * 0.045,
          PAL.red,
          12
        );
      }
      circle(W * 0.5, H * 0.44, W * 0.07, PAL.yellow, 14);
      scrib(W * 0.06, H * 0.88, W * 0.94, H * 0.96, PAL.green, 3, 12);
    },
    car() {
      rect(W * 0.22, H * 0.5, W * 0.78, H * 0.72, PAL.red, 16);
      scrib(W * 0.23, H * 0.51, W * 0.77, H * 0.71, PAL.red, 5, 9);
      rect(W * 0.34, H * 0.38, W * 0.62, H * 0.52, PAL.blue, 12);
      circle(W * 0.34, H * 0.74, W * 0.06, PAL.black, 12);
      circle(W * 0.64, H * 0.74, W * 0.06, PAL.black, 12);
      crayon(
        [
          [W * 0.05, H * 0.82],
          [W * 0.95, H * 0.83],
        ],
        PAL.brown,
        10
      );
      sunAt(W * 0.12, H * 0.16, W * 0.06);
    },
    landscape() {
      scrib(W * 0.04, H * 0.66, W * 0.96, H * 0.94, PAL.green, 7, 12);
      sunAt(W * 0.82, H * 0.18, W * 0.09);
      for (let k = 0; k < 3; k++)
        crayon(
          [
            [W * (0.1 + k * 0.06), H * 0.2],
            [W * (0.16 + k * 0.06), H * 0.2],
          ],
          PAL.blue,
          6
        );
      rect(W * 0.12, H * 0.46, W * 0.32, H * 0.66, PAL.orange, 12);
      tri(
        [
          [W * 0.12, H * 0.46],
          [W * 0.32, H * 0.46],
          [W * 0.22, H * 0.32],
        ],
        PAL.red,
        12
      );
      crayon(
        [
          [W * 0.6, H * 0.66],
          [W * 0.6, H * 0.4],
        ],
        PAL.brown,
        14
      );
      circle(W * 0.6, H * 0.34, W * 0.09, PAL.green, 14);
      person(W * 0.78, H * 0.5, PAL.purple);
    },
    scribblefill() {
      circle(W * 0.3, H * 0.45, W * 0.15, PAL.blue, 16);
      scrib(W * 0.16, H * 0.3, W * 0.44, H * 0.6, PAL.blue, 9, 9);
      rect(W * 0.55, H * 0.32, W * 0.85, H * 0.62, PAL.pink, 16);
      scrib(W * 0.55, H * 0.32, W * 0.85, H * 0.62, PAL.pink, 9, 9);
      crayon(
        [
          [W * 0.06, H * 0.8],
          [W * 0.94, H * 0.82],
        ],
        PAL.brown,
        14
      );
    },
    toysword() {
      person(W * 0.42, H * 0.42, PAL.blue);
      crayon(
        [
          [W * 0.56, H * 0.5],
          [W * 0.72, H * 0.32],
        ],
        PAL.teal,
        12
      );
      crayon(
        [
          [W * 0.54, H * 0.48],
          [W * 0.6, H * 0.54],
        ],
        PAL.brown,
        10
      );
      crayon(
        [
          [W * 0.06, H * 0.86],
          [W * 0.94, H * 0.88],
        ],
        PAL.green,
        16
      );
      sunAt(W * 0.16, H * 0.16, W * 0.06);
    },
  };

  window.__coloredPct = () => {
    const c = document.getElementById('c');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let col = 0;
    for (let k = 0; k < d.length; k += 4) {
      const mx = Math.max(d[k], d[k + 1], d[k + 2]),
        mn = Math.min(d[k], d[k + 1], d[k + 2]);
      if (mx - mn > 30) col++;
    }
    return ((100 * col) / (c.width * c.height)).toFixed(2);
  };
  window.renderFixture = async (spec) => {
    const c = document.getElementById('c');
    W = c.width;
    H = c.height;
    ctx = c.getContext('2d');
    seed = spec.seed || 987654;
    paper(spec.theme);
    for (const L of spec.layers) {
      if (L.op === 'outline') await drawOutline(L.uri);
      else if (L.op === 'art') await drawArt(L.uri, L.w, L.h);
      else if (L.op === 'reveal') await revealFill(L.uri, L.strokes);
      else if (L.op === 'gradient') revealGradient(L.angle, L.strokes);
      else if (L.op === 'strokes') paletteStrokes(L.strokes, L.color);
      else if (L.op === 'scene') SCENES[L.scene]();
    }
    return true;
  };
})();
