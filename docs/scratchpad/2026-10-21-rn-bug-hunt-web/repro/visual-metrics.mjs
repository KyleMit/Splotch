import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

export async function pixelDifference(aPath, bPath, outPath) {
  const a = await sharp(aPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(bPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height)
    throw new Error('Capture dimensions differ');
  const diff = Buffer.alloc(a.data.length);
  let exact = 0,
    changed = 0,
    total = 0,
    max = 0;
  const threshold = 16;
  for (let i = 0; i < a.data.length; i += 4) {
    let d = 0;
    for (let c = 0; c < 3; c++) {
      const v = Math.abs(a.data[i + c] - b.data[i + c]);
      total += v;
      d = Math.max(d, v);
    }
    max = Math.max(max, d);
    exact += d > 0 ? 1 : 0;
    changed += d > threshold ? 1 : 0;
    const gray = Math.round(((a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3) * 0.35 + 165);
    diff[i] = d > threshold ? 255 : gray;
    diff[i + 1] = d > threshold ? 0 : gray;
    diff[i + 2] = d > threshold ? 80 : gray;
    diff[i + 3] = 255;
  }
  await sharp(diff, { raw: { width: a.info.width, height: a.info.height, channels: 4 } })
    .png()
    .toFile(outPath);
  return {
    width: a.info.width,
    height: a.info.height,
    exactChangedPixels: exact,
    changedPixels: changed,
    threshold,
    percent: (changed / (a.info.width * a.info.height)) * 100,
    meanAbsoluteChannelDifference: total / (a.info.width * a.info.height * 3),
    maxChannelDifference: max,
    algorithm:
      'Per-pixel maximum RGB channel difference >16 (no antialias exclusion); exact count also recorded',
  };
}
export function boxDifferences(a, b) {
  const all = new Set([...Object.keys(a), ...Object.keys(b)]),
    differences = [];
  for (const key of all) {
    if (!a[key] || !b[key]) {
      differences.push({
        key,
        type: a[key] ? 'missing-in-rn' : 'extra-in-rn',
        shipping: a[key] ?? null,
        rn: b[key] ?? null,
      });
      continue;
    }
    const delta = Object.fromEntries(
      ['x', 'y', 'width', 'height'].map((k) => [k, b[key][k] - a[key][k]])
    );
    const max = Math.max(...Object.values(delta).map(Math.abs));
    if (max > 2)
      differences.push({
        key,
        type: 'geometry',
        maxDelta: max,
        delta,
        shipping: a[key],
        rn: b[key],
      });
  }
  return differences;
}
export async function controlBoxes(page, arm) {
  return page.evaluate((arm) => {
    const boxes = {},
      round = (n) => Math.round(n * 1000) / 1000;
    function visible(e) {
      const r = e.getBoundingClientRect(),
        s = getComputedStyle(e);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== 'hidden' &&
        s.display !== 'none' &&
        e.getClientRects().length > 0 &&
        !!e.checkVisibility?.({ checkVisibilityCSS: true })
      );
    }
    function add(key, e) {
      if (!e || !visible(e)) return;
      const r = e.getBoundingClientRect();
      let label = key,
        n = 2;
      while (boxes[label]) label = key + '@' + n++;
      boxes[label] = {
        x: round(r.x),
        y: round(r.y),
        width: round(r.width),
        height: round(r.height),
      };
    }
    for (const e of document.querySelectorAll('button,[role="button"]')) {
      const label = e.getAttribute('aria-label') || e.textContent?.trim();
      if (!label) continue;
      const inDialog = e.closest('dialog[open],[role="dialog"]');
      const flyout = e.closest(
        '[aria-label="Brush Menu"],[aria-label="Stroke Width Menu"],.brush-menu,.stroke-width-menu'
      );
      const palette =
        e.closest('[data-testid="rsd-palette-plate"],.color-palette,[aria-label="Color Menu"]') ||
        /^(Custom Colou?r|More colors)$/i.test(label);
      if (!inDialog && !flyout) add((palette ? 'swatch:' : 'control:') + label.toLowerCase(), e);
      if (flyout) add('flyout-option:' + label.toLowerCase(), e);
      if (inDialog && label.startsWith('#')) add('picker-cell:' + label.toUpperCase(), e);
      if (inDialog?.getAttribute('aria-label') === 'Settings') {
        const title =
          /^(Appearance|Sound|Tool Drawer|Accessibility|Coloring|AI Art|Saving|Parent Center|Install|Feedback|What's New|About|Close)\b/i.exec(
            label
          )?.[1];
        if (title) add('settings-control:' + title.toLowerCase(), e);
      }
    }
    add(
      'palette',
      document.querySelector(arm === 'rn' ? '[data-testid="rsd-palette-plate"]' : '.color-palette')
    );
    add(
      'picker',
      document.querySelector(
        arm === 'rn' ? '[data-testid="color-picker-card"]' : '#color-picker[open]'
      )
    );
    add(
      'settings',
      document.querySelector(
        arm === 'rn'
          ? '[role="dialog"][aria-label="Settings"] [data-testid="modal-surface"]'
          : '#settingsModal[open],dialog[aria-label="Settings"][open]'
      )
    );
    add('brush-flyout', document.querySelector('[aria-label="Brush Menu"],.brush-menu'));
    add(
      'width-flyout',
      document.querySelector('[aria-label="Stroke Width Menu"],.stroke-width-menu')
    );
    const tiles =
      arm === 'rn'
        ? [...document.querySelectorAll('[data-testid="rsd-drawer-tool"]')]
        : [...document.querySelectorAll('.actions-drawer-inner > *')];
    const rects = [];
    for (const t of tiles) {
      if (!visible(t)) continue;
      const button = t.matches('button') ? t : t.querySelector('button');
      if (!button || !visible(button)) continue;
      const label = button.getAttribute('aria-label');
      add('drawer-tile:' + label?.toLowerCase(), t);
      rects.push(t.getBoundingClientRect());
    }
    if (rects.length) {
      const left = Math.min(...rects.map((r) => r.left)),
        top = Math.min(...rects.map((r) => r.top)),
        right = Math.max(...rects.map((r) => r.right)),
        bottom = Math.max(...rects.map((r) => r.bottom));
      boxes['drawer-dom-tile-union'] = {
        x: round(left),
        y: round(top),
        width: round(right - left),
        height: round(bottom - top),
      };
    }
    if (arm === 'shipping')
      add('drawer-container-shipping-only', document.querySelector('.actions-drawer'));
    return boxes;
  }, arm);
}
export function saveJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
