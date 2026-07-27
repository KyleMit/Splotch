import { expect, test, type Page } from '@playwright/test';

import { count } from './engine-harness';

// --- Crayon brush (ADR-0065) ------------------------------------------------

// The crayon lays colour down as textured wax: an opaque body punched by fine
// paper-tooth pits, with each stroke's tooth phase-shifted by a stored seed. The
// buildup + determinism contract lives here, at the engine layer, because it is a
// property of rendering the stored ops — not of the pure phase math (unit-tested
// in crayonBrush.test.ts).

// Draw a horizontal crayon line and read back per-region opaque coverage + mean
// opaque colour, all in one page context so the canvas pixels never leave the browser.
async function crayonScene(page: Page) {
  return page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const ymid = Math.round(cv.height / 2);
    const line = (x0: number, x1: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1 - x0) * i) / 40, y: ymid });
      return p;
    };
    const region = (x0: number, x1: number) => {
      const d = g.getImageData(Math.round(x0), ymid - 15, Math.round(x1 - x0), 30).data;
      let opq = 0,
        tot = 0,
        r = 0,
        gg = 0,
        b = 0;
      for (let i = 0; i < d.length; i += 4) {
        tot++;
        if (d[i + 3] > 128) {
          opq++;
          r += d[i];
          gg += d[i + 1];
          b += d[i + 2];
        }
      }
      return {
        cov: opq / tot,
        rgb: opq ? [Math.round(r / opq), Math.round(gg / opq), Math.round(b / opq)] : null,
      };
    };
    const W = cv.width;
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#e23b36');
    E.setStrokeWidth(30);
    E.strokeSync(line(W * 0.2, W * 0.8), 'pen'); // one full-width pass
    const leftA = region(W * 0.25, W * 0.45);
    const rightA = region(W * 0.55, W * 0.75);
    E.strokeSync(line(W * 0.2, W * 0.5), 'pen'); // a second same-colour pass, LEFT half only
    const leftB = region(W * 0.25, W * 0.45);
    const rightB = region(W * 0.55, W * 0.75);
    return { leftA, rightA, leftB, rightB };
  });
}

test('a crayon stroke reads as tooth, not a solid fill', async ({ page }) => {
  const r = await crayonScene(page);
  // A single pass leaves paper tooth showing — neither a flat fill nor a few
  // specks. The floor sits below the deliberately light first-pass defaults
  // (they leave buildup headroom); the ceiling catches a solid fill.
  expect(r.leftA.cov).toBeGreaterThan(0.3);
  expect(r.leftA.cov).toBeLessThan(0.85);
});

test('a second same-colour crayon pass builds up where it is drawn, at a constant hue', async ({
  page,
}) => {
  const r = await crayonScene(page);
  // Buildup: the redrawn (left) band gets denser — fills in tooth.
  expect(r.leftB.cov).toBeGreaterThan(r.leftA.cov + 0.03);
  // Live/gradual, not a global snap: the untouched (right) band is unchanged.
  expect(Math.abs(r.rightB.cov - r.rightA.cov)).toBeLessThan(0.02);
  // No darken/muddy: same-colour overdraw cannot shift the colour — the
  // darken mix is EXACT on its own colour (min(c,c)=c), so the only mean
  // drift left is the shade wobble's slow term (its per-texel min against the
  // previous pass's shade is bounded by the shade amplitude) plus band
  // composition. A multiply-style regression darkens every pass by tens of
  // levels, far past this bound.
  for (let i = 0; i < 3; i++) {
    expect(Math.abs((r.leftB.rgb as number[])[i] - (r.leftA.rgb as number[])[i])).toBeLessThan(10);
  }
});

test('the crayon wax body carries a subtle shade variation, not one flat colour', async ({
  page,
}) => {
  // The fill's rgb wobbles a few percent around the exact crayon colour
  // (shadeShift) — enough that the body reads as mottled wax, never enough to
  // read as a different colour. A pass over blank paper stamps fully opaque
  // and glaze-free (the multiply glaze only engages over existing ink), so
  // fully covered body texels are exact; the ≥200 alpha filter keeps the
  // stroke's anti-aliased silhouette from faking variation.
  const r = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const ymid = Math.round(cv.height / 2);
    const p: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) p.push({ x: 20 + ((cv.width - 40) * i) / 40, y: ymid });
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#e23b36'); // r=226 g=59 b=54
    E.setStrokeWidth(30);
    E.strokeSync(p, 'pen');
    const d = g.getImageData(20, ymid - 12, cv.width - 40, 24).data;
    const exact = [226, 59, 54];
    let opq = 0;
    let varied = 0;
    let maxDev = 0;
    const mean = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      opq++;
      let dev = 0;
      for (let c = 0; c < 3; c++) {
        dev = Math.max(dev, Math.abs(d[i + c] - exact[c]));
        mean[c] += d[i + c];
      }
      if (dev > 2) varied++;
      if (dev > maxDev) maxDev = dev;
    }
    return {
      opq,
      variedFrac: opq ? varied / opq : 0,
      maxDev,
      meanDev: opq ? Math.max(...mean.map((m, c) => Math.abs(m / opq - exact[c]))) : 0,
    };
  });
  expect(r.opq).toBeGreaterThan(500);
  // A real spread across the body — a flat fill scores ~0 here.
  expect(r.variedFrac).toBeGreaterThan(0.15);
  // …but a SUBTLE one: no texel strays far, and the mean stays on the colour.
  expect(r.maxDev).toBeLessThanOrEqual(40);
  expect(r.meanDev).toBeLessThanOrEqual(12);
});

test('crossing crayon colours mix subtractively — blue over yellow goes green', async ({
  page,
}) => {
  // Each pass stamps a darken mix: out = (1-m)·S + m·min(S,D). Subtractive is
  // the point — an rgb lerp of blue over yellow goes GREY, while min keeps the
  // blue wax's full green channel and drops only its blue channel toward the
  // yellow's, so the crossing crosses into GREEN-dominance (g > b) at the
  // shipped strength while blue over bare paper stays pure.
  const r = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const cx = Math.round(cv.width / 2);
    const cy = Math.round(cv.height / 2);
    const seg = (x0: number, y0: number, x1: number, y1: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++)
        p.push({ x: x0 + ((x1 - x0) * i) / 40, y: y0 + ((y1 - y0) * i) / 40 });
      return p;
    };
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setStrokeWidth(36);
    E.setColor('#f7d64b'); // yellow underlay (247, 214, 75)
    E.strokeSync(seg(cx - 150, cy, cx + 150, cy), 'pen');
    E.setColor('#62A2E9'); // blue over it (98, 162, 233)
    E.strokeSync(seg(cx, cy - 120, cx, cy + 120), 'pen');
    // Sample the crossing square. Blue wax mixed by the yellow beneath lands
    // at ≈ (98, 162, 0.45·233 + 0.55·75 ≈ 146) — green channel above blue,
    // i.e. actually green — vs (98, 162, 233) pure over blank.
    const d = g.getImageData(cx - 12, cy - 12, 24, 24).data;
    let wax = 0;
    let mixed = 0;
    let greenLean = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      const [rr, gg, bb] = [d[i], d[i + 1], d[i + 2]];
      if (rr >= 150) continue; // exclude the yellow showing through pits
      wax++;
      if (bb >= 128 && bb <= 168) mixed++;
      if (gg > bb) greenLean++;
    }
    return { wax, mixed, greenLean };
  });
  expect(r.wax).toBeGreaterThan(100);
  // The yellow beneath genuinely mixes into the blue wax — a zero-mix
  // regression leaves every blue texel at b ≈ 233, far above the window…
  expect(r.mixed).toBeGreaterThan(r.wax * 0.3);
  // …and the crossing is not just teal: a solid share of the mixed wax is
  // green-DOMINANT, which is what the eye finally reads as green.
  expect(r.greenLean).toBeGreaterThan(r.wax * 0.25);
});

test('colorMix 0 restores the direct opaque pipeline (the A/B escape hatch)', async ({ page }) => {
  // With the mix disabled the crayon paints the canvas directly — fully opaque
  // wax, no pass buffer, no stamp — byte-for-byte the pre-mixing pipeline.
  const opaque = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const ymid = Math.round(cv.height / 2);
    const p: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) p.push({ x: 20 + ((cv.width - 40) * i) / 40, y: ymid });
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setCrayonParams({ colorMix: 0 });
    E.setColor('#e23b36');
    E.setStrokeWidth(24);
    E.strokeSync(p, 'pen');
    const d = g.getImageData(20, ymid - 10, cv.width - 40, 20).data;
    let full = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] === 255) full++;
    return full;
  });
  expect(opaque).toBeGreaterThan(500);
});

test('scribbling back and forth in ONE gesture builds up like separate strokes', async ({
  page,
}) => {
  // Real wax doesn't care whether the crayon lifted before re-covering a spot:
  // a continuous out-back-out scribble must densify mid-stroke (the pass
  // tracker bumps the seed phase at each reversal), landing in the same
  // coverage territory as three separate strokes over the same line.
  const r = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const ymid = Math.round(cv.height / 2);
    const W = cv.width;
    const pts = (x0: number, x1: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1 - x0) * i) / 40, y: ymid });
      return p;
    };
    const coverage = () => {
      const d = g.getImageData(Math.round(W * 0.2), ymid - 12, Math.round(W * 0.6), 24).data;
      let opq = 0;
      let tot = 0;
      for (let i = 3; i < d.length; i += 4) {
        tot++;
        if (d[i] > 128) opq++;
      }
      return opq / tot;
    };
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#2c5faa');
    E.setStrokeWidth(30);
    E.strokeSync(pts(W * 0.1, W * 0.9), 'pen'); // one single-direction pass
    const single = coverage();
    E.clearCanvas();
    const fwd = pts(W * 0.1, W * 0.9);
    const back = pts(W * 0.9, W * 0.1);
    // One continuous gesture: out, back, out — a single pointerdown/up.
    E.strokeSync([...fwd, ...back.slice(1), ...fwd.slice(1)], 'pen');
    const scribble = coverage();
    return { single, scribble };
  });
  // Mid-stroke overdraw fills real extra tooth (three phases vs one)…
  expect(r.scribble).toBeGreaterThan(r.single + 0.08);
  // …while staying wax, not a solid bar.
  expect(r.scribble).toBeLessThan(0.995);
});

test('mid-stroke pass splits survive a remount byte-identically and undo cleanly', async ({
  page,
}) => {
  // The split gesture folds several seeds' worth of ops into the paper at
  // commit; a remount blits that paper back, and the blit must reproduce EVERY
  // byte of what the child saw live — live-render and fold share renderOp, so
  // any drift here means the fold diverged from the live pixels.
  const r = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const y = Math.round(cv.height / 2);
    const pts = (x0: number, x1: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: x0 + ((x1 - x0) * i) / 40, y });
      return p;
    };
    const fwd = pts(20, cv.width - 20);
    const back = pts(cv.width - 20, 20);
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#e23b36');
    E.setStrokeWidth(24);
    E.strokeSync([...fwd, ...back.slice(1), ...fwd.slice(1)], 'pen');
    const before = g.getImageData(0, 0, cv.width, cv.height).data;
    E.remount();
    const after = g.getImageData(0, 0, cv.width, cv.height).data;
    let inked = 0;
    let changed = 0;
    for (let i = 0; i < before.length; i += 4) {
      if (before[i + 3] > 0) inked++;
      for (let c = 0; c < 4; c++) {
        if (before[i + c] !== after[i + c]) {
          changed++;
          break;
        }
      }
    }
    return { inked, changed };
  });
  expect(r.inked).toBeGreaterThan(0);
  expect(r.changed).toBe(0);

  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
});

test('a crayon remount reproduces the exact pixel count', async ({ page }) => {
  await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const y = Math.round(cv.height / 2);
    const p: { x: number; y: number }[] = [];
    for (let i = 0; i <= 40; i++) p.push({ x: 20 + ((cv.width - 40) * i) / 40, y });
    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#2c5faa');
    E.setStrokeWidth(24);
    E.strokeSync(p, 'pen');
  });
  const c0 = await count(page);
  expect(c0).toBeGreaterThan(0);

  // Teardown + re-init repaints from the committed paper raster (one blit), so
  // the rebuild is pixel-for-pixel identical.
  await page.evaluate(() => window.__engine.remount());
  expect(await count(page)).toBe(c0);

  // And it undoes cleanly back to a blank canvas.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
});

test('an eraser interleaved mid-gesture cannot resurrect erased wax at commit', async ({
  page,
}) => {
  // The Brush Menu doesn't lift held pointers, so a second finger can erase
  // through a crayon stroke whose gesture (and pass) is still open — both land
  // in ONE stroke group with the erase ops inside the crayon run. The pass
  // raster is cropped from the paper-space accumulation, which never sees
  // erase ops, so without the boundary close the fold would stamp the whole
  // pass's un-erased ink back over the erased region at commit.
  const r = await page.evaluate(() => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const rect = cv.getBoundingClientRect();
    const ev = (type: string, pointerId: number, x: number, y: number) =>
      cv.dispatchEvent(
        new PointerEvent(type, {
          pointerId,
          pointerType: 'pen',
          isPrimary: pointerId === 1,
          clientX: rect.left + x,
          clientY: rect.top + y,
          bubbles: true,
          cancelable: true,
        })
      );
    const y = Math.round(cv.height / 2);
    const cx = Math.round(cv.width / 2);
    // The open pass's ink lives on the OVERLAY canvases until a stamp lands it
    // on the main canvas, so sample the main canvas only after the boundary
    // close (the eraser's first op) has stamped the line.
    const inkedAt = (x: number) => {
      const band = g.getImageData(x - 8, y - 8, 16, 16).data;
      let n = 0;
      for (let i = 3; i < band.length; i += 4) if (band[i] > 0) n++;
      return n;
    };

    E.clearCanvas();
    E.setCrayonMode(true);
    E.setColor('#2c5faa');
    E.setStrokeWidth(24);

    // Finger 1: draw a full horizontal crayon line and HOLD (gesture open).
    ev('pointerdown', 1, 40, y);
    for (let i = 1; i <= 40; i++) ev('pointermove', 1, 40 + ((cv.width - 80) * i) / 40, y);

    // Brush switch while finger 1 is down, then finger 2 erases through the
    // laid ink and lifts. The eraser's first op must close (stamp) the open
    // pass, so from here the main canvas holds the line minus the erase.
    E.setEraserMode(true);
    ev('pointerdown', 2, cx, y - 50);
    for (let i = 1; i <= 20; i++) ev('pointermove', 2, cx, y - 50 + (100 * i) / 20);
    ev('pointerup', 2, cx, y + 50);
    E.setEraserMode(false);
    const bandAfterErase = inkedAt(cx);
    const controlAfterErase = inkedAt(cx - 120);

    // Finger 1 keeps drawing (a fresh pass) away from the erase site, lifts —
    // the whole interleaved group commits as one undo unit.
    for (let i = 1; i <= 5; i++) ev('pointermove', 1, cv.width - 40, y + i * 3);
    ev('pointerup', 1, cv.width - 40, y + 15);
    const bandAfterCommit = inkedAt(cx);
    const controlAfterCommit = inkedAt(cx - 120);

    return { bandAfterErase, controlAfterErase, bandAfterCommit, controlAfterCommit };
  });

  // The line landed (boundary close stamped it) everywhere but the erase site.
  expect(r.controlAfterErase).toBeGreaterThan(0);
  expect(r.bandAfterErase).toBe(0);
  // The regression assertion: commit must not re-ink the erased band.
  expect(r.bandAfterCommit).toBe(0);
  expect(r.controlAfterCommit).toBeGreaterThan(0);

  // The interleaved group is one undo unit back to blank.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
});
