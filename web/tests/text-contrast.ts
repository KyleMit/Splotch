import { expect, type Locator } from '@playwright/test';
import { colorContrast } from '../src/lib/design/colorContrast';

// WCAG 2.x AA text floors. Large text is 18pt, or 14pt bold, in CSS pixels.
const AA_TEXT_FLOOR = 4.5;
const AA_LARGE_TEXT_FLOOR = 3;
const LARGE_TEXT_MIN_PX = 24;
const LARGE_BOLD_TEXT_MIN_PX = 18.66;
const BOLD_WEIGHT = 700;

interface TextSample {
  text: string;
  ink: string;
  ground: string | null;
  unmeasured: string | null;
  fontSizePx: number;
  fontWeight: number;
}

/**
 * Hold every visible text element inside `root` to the WCAG AA contrast floor
 * for its size, measured from computed styles rather than trusted to axe.
 * Inside a modal <dialog> axe reports each text node as incomplete, because the
 * top-layer backdrop overlaps it, so a failing color there scans green.
 *
 * Each element's ink is composited over the background colors of the element
 * and its ancestors, walking up until the first opaque one (the ground), and
 * the ratio comes from the shared `colorContrast` luminance math. At each step
 * up, a sibling box whose background covers the text's center is laid in
 * between, which is how a segmented control's travelling thumb is seen under
 * its label. Disabled controls are skipped, as WCAG exempts inactive
 * components.
 *
 * What it cannot see: it detects only a `background-image` or
 * `backdrop-filter` on an ancestor up to the first opaque ground, and fails on
 * either, since it has no color to measure there. It misses a sibling image
 * laid under an overlaid label, a pseudo-element fill, and `opacity` on the
 * element or anything above the ground. A text node that sits over one of those
 * needs its own assertion.
 *
 * `edgeShades` names elements whose `background-image` is a scroll-edge shade
 * only. The caller vouches that no text is measured over the shade itself, and
 * the walk reads that element's background color and continues.
 */
export async function expectTextContrast(root: Locator, edgeShades: string[] = []) {
  const samples = await root.evaluate((rootEl, edgeShades): TextSample[] => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    // Computed colors arrive in whatever space the author wrote (color-mix
    // resolves to color(srgb …)); painting one pixel normalizes every form.
    const rgba = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const describe = (el: Element) =>
      el.id ? `#${el.id}` : `${el.localName}.${[...el.classList].join('.')}`;

    const unmeasurable = (node: Element) => {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none' && !edgeShades.some((s) => node.matches(s))) {
        return `background-image on ${describe(node)}`;
      }
      return style.backdropFilter !== 'none' ? `backdrop-filter on ${describe(node)}` : null;
    };
    const covers = (node: Element, x: number, y: number) => {
      const rect = node.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    function ground(el: Element): { ground: string | null; unmeasured: string | null } {
      const rect = el.getBoundingClientRect();
      const [x, y] = [rect.left + rect.width / 2, rect.top + rect.height / 2];
      const layers: ReturnType<typeof rgba>[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const reason = unmeasurable(node);
        if (reason) return { ground: null, unmeasured: reason };
        const layer = rgba(getComputedStyle(node).backgroundColor);
        if (layer.a > 0) layers.push(layer);
        if (layer.a >= 1) break;
        if (node === rootEl) {
          return { ground: null, unmeasured: `no opaque ground inside ${describe(rootEl)}` };
        }
        const siblings = [...node.parentElement!.children].filter(
          (sibling) => sibling !== node && sibling.checkVisibility() && covers(sibling, x, y)
        );
        for (const sibling of siblings) {
          const siblingReason = unmeasurable(sibling);
          if (siblingReason) return { ground: null, unmeasured: siblingReason };
          const fill = rgba(getComputedStyle(sibling).backgroundColor);
          if (fill.a > 0) layers.push(fill);
        }
        if (layers.at(-1)?.a === 1) break;
      }
      let composite = layers.pop()!;
      for (const layer of layers.reverse()) {
        const mix = (top: number, bottom: number) => top * layer.a + bottom * (1 - layer.a);
        composite = {
          r: mix(layer.r, composite.r),
          g: mix(layer.g, composite.g),
          b: mix(layer.b, composite.b),
          a: 1,
        };
      }
      return { ground: `rgb(${composite.r} ${composite.g} ${composite.b})`, unmeasured: null };
    }

    const hasOwnText = (el: Element) =>
      [...el.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== ''
      );
    const isShown = (el: Element) => {
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };

    return [rootEl, ...rootEl.querySelectorAll('*')]
      .filter(hasOwnText)
      .filter(isShown)
      .filter((el) => !el.closest(':disabled, [aria-disabled="true"]'))
      .map((el) => {
        const style = getComputedStyle(el);
        const ink = rgba(style.color);
        return {
          text: el.textContent!.trim().slice(0, 40),
          ink: `rgb(${ink.r} ${ink.g} ${ink.b} / ${ink.a})`,
          ...ground(el),
          fontSizePx: Number.parseFloat(style.fontSize),
          fontWeight: Number.parseFloat(style.fontWeight),
        };
      });
  }, edgeShades);

  expect(samples.length, 'no visible text to measure').toBeGreaterThan(0);
  const failures = samples.flatMap((sample) => {
    if (!sample.ground) return [`"${sample.text}": unmeasured, ${sample.unmeasured}`];
    const large =
      sample.fontSizePx >= LARGE_TEXT_MIN_PX ||
      (sample.fontSizePx >= LARGE_BOLD_TEXT_MIN_PX && sample.fontWeight >= BOLD_WEIGHT);
    const floor = large ? AA_LARGE_TEXT_FLOOR : AA_TEXT_FLOOR;
    const ratio = colorContrast(sample.ink, sample.ground, sample.ground);
    return ratio >= floor
      ? []
      : [
          `"${sample.text}": ${ratio.toFixed(2)}:1 < ${floor}:1 (${sample.ink} on ${sample.ground})`,
        ];
  });
  expect(failures).toEqual([]);
}
