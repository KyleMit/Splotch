import { count, expect, state, test } from './engine-harness';

// --- The snapshot memory tier (ADR-0066) --------------------------------------
//
// Storage-tier count and byte assertions below are intentional white-box
// invariants of ADR-0066; revise them with any snapshot-tier redesign. Undo
// restores pre-stroke canvas snapshots (see undoHistory.ts). A restore can be
// asynchronous — deep entries decode from an encoded blob — so undo() returns
// its queue promise (page.evaluate awaits it) and assertions that race the
// encode tier poll for the settled state.

test('depth caps at 20 and deep entries restore from encoded blobs', async ({ page }) => {
  await page.evaluate(() => {
    for (let i = 0; i < 22; i++) {
      const y = 14 + i * 12;
      window.__engine.strokeSync(
        [
          { x: 30, y },
          { x: 270, y },
          // L tail: leaves the asserted band pixels where they are while
          // stretching the snapshot patch across the paper, so the resident
          // byte budget is actually reached (see undoHistory hotWindowStart).
          { x: 1240, y },
          { x: 1240, y: 690 },
        ],
        'pen'
      );
    }
  });

  // The cold tier encodes off the commit path — wait for it to settle: only
  // the newest entries stay hot rasters up to the resident byte budget, the rest demote.
  await expect(async () => {
    const d = await page.evaluate(() => window.__engine.getUndoDebug());
    expect(d.snapshots).toBe(20);
    expect(d.liveRasters).toBeLessThan(d.snapshots);
    expect(d.blobBytes).toBeGreaterThan(0);
  }).toPass();

  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.__engine.undo());
  }
  expect((await state(page)).canUndo).toBe(false);

  // The two oldest snapshots were shifted past the cap, so the deepest restore
  // still shows strokes 1–2 — the undo wall.
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 14)[3])).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 26)[3])).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 38)[3])).toBe(0);
});

test('undoing a later crayon stroke restores the earlier texture byte-exactly', async ({
  page,
}) => {
  // A restore is a raster blit of the pre-stroke paper, so an earlier stroke's
  // wax texture must come through with ZERO changed bytes — not merely within
  // an AA tolerance band.
  const debug = await page.evaluate(async () => {
    const E = window.__engine;
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const line = (y: number) => {
      const p: { x: number; y: number }[] = [];
      for (let i = 0; i <= 40; i++) p.push({ x: 20 + ((cv.width - 40) * i) / 40, y });
      return p;
    };
    E.setCrayonMode(true);
    E.setColor('#2c5faa');
    E.setStrokeWidth(24);
    E.strokeSync(line(75), 'pen'); // stroke A, top band
    (window as unknown as { __bandBefore: number[] }).__bandBefore = Array.from(
      g.getImageData(20, 60, cv.width - 40, 30).data
    );
    E.strokeSync(line(cv.height - 60), 'pen'); // stroke B, far bottom band
    const d = E.getUndoDebug();
    await E.undo();
    return d;
  });
  expect(debug.snapshots).toBe(2);

  const gone = await page.evaluate(() => {
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    return window.__engine.pixelAt(Math.round(cv.width / 2), cv.height - 60)[3];
  });
  expect(gone).toBe(0);

  const mismatched = await page.evaluate(() => {
    const cv = document.getElementById('engineCanvas') as HTMLCanvasElement;
    const g = cv.getContext('2d')!;
    const before = (window as unknown as { __bandBefore: number[] }).__bandBefore;
    const after = g.getImageData(20, 60, cv.width - 40, 30).data;
    let n = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) n++;
    return n;
  });
  expect(mismatched).toBe(0);
});

test('a stroke committed during a deep-undo blob decode survives the restore and undoes next', async ({
  page,
}) => {
  // The deep-undo step pops its snapshot, then awaits createImageBitmap(blob)
  // — a real task-level window. A commit landing inside it must defer its
  // copy+fold behind the pending restore (paper chain): the committed ink
  // survives the restore's blit, and the next undo undoes IT, instead of
  // restoring a pre-undo snapshot (undo acting as redo).
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) {
      const y = 20 + i * 20;
      window.__engine.strokeSync(
        [
          { x: 30, y },
          { x: 270, y },
          // L tail: leaves the asserted band pixels where they are while
          // stretching the snapshot patch across the paper, so the resident
          // byte budget is actually reached (see undoHistory hotWindowStart).
          { x: 1240, y },
          { x: 1240, y: 690 },
        ],
        'pen'
      );
    }
  });

  // Wait for the cold tier to settle so the third undo is a blob decode.
  await expect(async () => {
    const d = await page.evaluate(() => window.__engine.getUndoDebug());
    expect(d.liveRasters).toBeLessThan(d.snapshots);
    expect(d.blobBytes).toBeGreaterThan(0);
  }).toPass();

  await page.evaluate(async () => {
    const E = window.__engine;
    await E.undo(); // stroke 4 — live raster
    await E.undo(); // stroke 3 — live raster
    const deepUndo = E.undo(); // stroke 2 — demoted, decodes from its blob
    await Promise.resolve(); // the step has popped its snapshot and is awaiting the decode
    E.strokeSync([{ x: 150, y: 200 }], 'pen'); // dot commits mid-decode
    await deepUndo;
  });

  // The restore landed BENEATH the dot: stroke 2 gone, stroke 1 kept, dot kept.
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 20)[3])).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 40)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 200)[3])).toBeGreaterThan(0);

  // The next undo undoes the dot — not a redo of the strokes the child undid.
  await page.evaluate(() => window.__engine.undo());
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 200)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 40)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 20)[3])).toBeGreaterThan(0);

  // And one more reaches blank with the stack cleanly exhausted.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  const s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('drawing immediately after rapid undos folds onto the restored paper (undo → draw → undo)', async ({
  page,
}) => {
  // Toddler flow: mash undo three times (the last restore decodes a blob),
  // then dot the canvas before the restores land. The stroke's commit queues
  // behind all three restores, its baseline rebases to the restored blank
  // paper, and the next undo removes just that stroke back to blank.
  // Six strokes, not three: a spanning patch is ~0.56 of the paper, so it takes
  // six of them to pass the resident byte budget and demote anything — and this
  // spec needs the deepest restore to be a real blob decode.
  const BANDS = 6;
  await page.evaluate((bands) => {
    for (let i = 0; i < bands; i++) {
      const y = 20 + i * 20;
      window.__engine.strokeSync(
        [
          { x: 30, y },
          { x: 270, y },
          // L tail: leaves the asserted band pixels where they are while
          // stretching the snapshot patch across the paper, so the resident
          // byte budget is actually reached (see undoHistory hotWindowStart).
          { x: 1240, y },
          { x: 1240, y: 690 },
        ],
        'pen'
      );
    }
  }, BANDS);
  await expect(async () => {
    const d = await page.evaluate(() => window.__engine.getUndoDebug());
    expect(d.blobBytes).toBeGreaterThan(0);
  }).toPass();

  await page.evaluate(async (bands) => {
    const E = window.__engine;
    for (let i = 0; i < bands - 1; i++) E.undo();
    const chain = E.undo(); // rapid taps back to blank, the deepest a blob decode
    E.strokeSync(
      [
        { x: 150, y: 200 },
        { x: 200, y: 250 },
      ],
      'pen'
    ); // draws before any restore lands
    await chain;
  }, BANDS);

  // Only the new stroke survives the queued restores.
  for (let i = 0; i < BANDS; i++) {
    const y = 20 + i * 20;
    expect(await page.evaluate((py) => window.__engine.pixelAt(150, py)[3], y)).toBe(0);
  }
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 200)[3])).toBeGreaterThan(0);
  let s = await state(page);
  expect(s.canvasEmpty).toBe(false);
  expect(s.canUndo).toBe(true);

  // Undoing the new stroke lands on the blank paper the undos restored — the
  // deferred commit's snapshot copied the post-restore state, not a stale one.
  await page.evaluate(() => window.__engine.undo());
  expect(await count(page)).toBe(0);
  s = await state(page);
  expect(s.canvasEmpty).toBe(true);
  expect(s.canUndo).toBe(false);
});

test('encoded snapshots rising into the hot window re-inflate to hot rasters', async ({ page }) => {
  // The hot-window invariant must survive undo-then-draw, not just monotonic
  // growth: after deep undos the entries that rise into the top-2 window
  // decode back to hot rasters off the interaction path, so the *second* undo
  // tap after a new stroke is a synchronous blit, not a blob decode.
  // Eight, for the same reason as the spec above: a spanning patch is ~0.56 of
  // the paper, so demotion needs more than five of them.
  const BANDS = 8;
  await page.evaluate((bands) => {
    for (let i = 0; i < bands; i++) {
      const y = 20 + i * 20;
      window.__engine.strokeSync(
        [
          { x: 30, y },
          { x: 270, y },
          // L tail: leaves the asserted band pixels where they are while
          // stretching the snapshot patch across the paper, so the resident
          // byte budget is actually reached (see undoHistory hotWindowStart).
          { x: 1240, y },
          { x: 1240, y: 690 },
        ],
        'pen'
      );
    }
  }, BANDS);

  // Let the cold tier settle: the oldest entries pass the byte budget and demote.
  await expect(async () => {
    const d = await page.evaluate(() => window.__engine.getUndoDebug());
    expect(d.snapshots).toBe(BANDS);
    expect(d.liveRasters).toBeLessThan(d.snapshots);
    expect(d.blobBytes).toBeGreaterThan(0);
  }).toPass();

  await page.evaluate(async (undos) => {
    for (let i = 0; i < undos; i++) await window.__engine.undo();
  }, BANDS - 2);

  // Both survivors were blobs; rising into the window re-inflates them.
  await expect(async () => {
    const d = await page.evaluate(() => window.__engine.getUndoDebug());
    expect(d.snapshots).toBe(2);
    expect(d.liveRasters).toBe(2);
    expect(d.blobBytes).toBe(0);
  }).toPass();

  await page.evaluate(() => window.__engine.strokeSync([{ x: 150, y: 200 }], 'pen'));

  // The new commit re-tiers, and a three-entry stack is far inside the byte
  // budget — so nothing demotes back. That is the point of a budget: encoding
  // happens under memory pressure, not on a fixed entry count.
  await expect(async () => {
    const d = await page.evaluate(() => window.__engine.getUndoDebug());
    expect(d.snapshots).toBe(3);
    expect(d.liveRasters).toBe(3);
    expect(d.blobBytes).toBe(0);
  }).toPass();

  // First undo drops the dot; the second — the tap that used to pay a blob
  // decode — restores stroke 1 from its re-inflated raster.
  await page.evaluate(() => window.__engine.undo());
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 200)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 40)[3])).toBeGreaterThan(0);

  await page.evaluate(() => window.__engine.undo());
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 40)[3])).toBe(0);
  expect(await page.evaluate(() => window.__engine.pixelAt(150, 20)[3])).toBeGreaterThan(0);
  expect((await state(page)).canUndo).toBe(true);
});
