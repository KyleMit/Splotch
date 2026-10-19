// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BURST_CLASS,
  BURST_DOTS,
  BURST_MS,
  FIRST_FRAME_THEMES,
  FIRST_FRAME_VIEWPORTS,
  NOT_YET_WIGGLE_MS,
  variantKey,
  withFirstFrames,
} from '../migration/prerender-native-web.mjs';
import {
  CONTROLS_LIVE_ATTRIBUTE,
  DRAWING_LIVE_ATTRIBUTE,
  EARLY_POINTERS_GLOBAL,
  PAPER_INPUT_TEST_ID,
} from '../../experiments/native-architecture/src/platform/firstFrameContract.ts';

const STYLESHEET = '/_expo/static/css/strict-1.css';
const TEXTURE = '/assets/paper/handmade-paper.0123.webp';
const EXPORTED_SHELL = `<!DOCTYPE html><html><head><link rel="preload" href="${STYLESHEET}" as="style">\n<link rel="stylesheet" href="${STYLESHEET}"></head><body><div id="root"></div><script src="/_expo/static/js/web/index-1.js" defer></script></body></html>`;
const FRAME = `<div style="background:var(--paper-texture, url(&quot;${TEXTURE}&quot;))"><button type="button" aria-label="Purple"></button><div data-testid="${PAPER_INPUT_TEST_ID}"></div></div>`;
const shell = withFirstFrames(
  EXPORTED_SHELL,
  {
    variants: FIRST_FRAME_VIEWPORTS.flatMap((viewport) =>
      FIRST_FRAME_THEMES.map((theme) => {
        const key = variantKey(viewport, theme);
        return { key, id: `first-frame-${key}`, viewport, html: FRAME };
      })
    ),
    sheet: { id: 'react-native-stylesheet', textContent: '' },
  },
  (href) => Buffer.from(href)
);
const bootScript = /<script>(\(function\(\)\{var painted[\s\S]*?)<\/script>/.exec(shell)[1];

let reduceMotion = false;
const animate = vi.fn();
const reachedApp = [];

// One boot for the file: the early-input listeners it adds to the window stay for the page's life.
beforeAll(() => {
  window.happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;
  window.happyDOM.setURL('http://localhost/');
  window.happyDOM.setViewport({ width: 412, height: 915 });
  window.matchMedia = (query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' && reduceMotion,
  });
  window.HTMLElement.prototype.animate = animate;
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(shell)[1];
  new Function(bootScript)();
  const root = document.getElementById('root');
  for (const type of ['pointerdown', 'pointerup', 'click', 'touchstart'])
    root.addEventListener(type, (event) => reachedApp.push(event.type));
});

afterEach(() => {
  animate.mockClear();
  reachedApp.length = 0;
  reduceMotion = false;
  vi.useRealTimers();
  document.documentElement.removeAttribute(CONTROLS_LIVE_ATTRIBUTE);
  document.documentElement.removeAttribute(DRAWING_LIVE_ATTRIBUTE);
  for (const burst of document.querySelectorAll(`.${BURST_CLASS}`)) burst.remove();
});

const paper = () => document.querySelector(`#root [data-testid="${PAPER_INPUT_TEST_ID}"]`);
const swatch = () => document.querySelector('#root button');
const early = () => window[EARLY_POINTERS_GLOBAL];
function pointer(target, type, { id = 1, x = 120, y = 300 } = {}) {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerId: id,
      pointerType: 'touch',
      clientX: x,
      clientY: y,
    })
  );
}

describe('a touch on the prerendered paper before the engine listens', () => {
  it('throws a burst where the finger lands and remembers the finger, drawing nothing', () => {
    vi.useFakeTimers();
    const before = document.getElementById('root').innerHTML;
    pointer(paper(), 'pointerdown', { id: 7, x: 120, y: 300 });
    const bursts = document.querySelectorAll(`body > .${BURST_CLASS}`);
    expect(bursts).toHaveLength(1);
    expect(bursts[0].style.left).toBe('120px');
    expect(bursts[0].style.top).toBe('300px');
    expect(bursts[0].children).toHaveLength(BURST_DOTS);
    expect(early()[7]).toMatchObject({
      pointerId: 7,
      pointerType: 'touch',
      clientX: 120,
      clientY: 300,
    });
    pointer(paper(), 'pointermove', { id: 7, x: 140, y: 320 });
    expect(early()[7]).toMatchObject({ clientX: 140, clientY: 320 });
    expect(document.getElementById('root').innerHTML).toBe(before);
    vi.advanceTimersByTime(BURST_MS);
    expect(document.querySelectorAll(`.${BURST_CLASS}`)).toHaveLength(0);
  });

  it('forgets the finger once it lifts', () => {
    pointer(paper(), 'pointerdown', { id: 8 });
    pointer(paper(), 'pointerup', { id: 8 });
    expect(early()[8]).toBeUndefined();
  });

  it('leaves the paper to the engine once it listens', () => {
    document.documentElement.setAttribute(DRAWING_LIVE_ATTRIBUTE, '');
    pointer(paper(), 'pointerdown', { id: 9 });
    expect(document.querySelectorAll(`.${BURST_CLASS}`)).toHaveLength(0);
    expect(early()[9]).toBeUndefined();
  });
});

describe('a press on a control before its handler attaches', () => {
  it('wiggles "not yet" and keeps the press from the app', () => {
    pointer(swatch(), 'pointerdown');
    pointer(swatch(), 'pointerup');
    swatch().click();
    expect(reachedApp).toEqual([]);
    expect(animate).toHaveBeenCalledTimes(1);
    const [keyframes, duration] = animate.mock.calls[0];
    expect(duration).toBe(NOT_YET_WIGGLE_MS);
    expect(keyframes.map((frame) => Object.keys(frame))).toEqual(
      keyframes.map(() => ['translate', 'scale'])
    );
    expect(keyframes.map((frame) => frame.scale)).toEqual([1, 0.94, 0.94, 0.94, 1]);
  });

  it('only dims under Reduce Motion', () => {
    reduceMotion = true;
    pointer(swatch(), 'pointerdown');
    expect(animate.mock.calls[0][0].map((frame) => Object.keys(frame))).toEqual([
      ['opacity'],
      ['opacity'],
      ['opacity'],
    ]);
  });

  it('reaches the app untouched once the controls listen', () => {
    document.documentElement.setAttribute(CONTROLS_LIVE_ATTRIBUTE, '');
    pointer(swatch(), 'pointerdown');
    swatch().click();
    expect(reachedApp).toEqual(['pointerdown', 'click']);
    expect(animate).not.toHaveBeenCalled();
  });
});
