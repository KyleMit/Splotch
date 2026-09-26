import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, THEME_VEIL_CLASS } from './theme';

const root = document.documentElement;

const LIGHT_SURFACE = 'rgb(255, 255, 255)';
const DARK_SURFACE = 'rgb(35, 35, 43)';

type Fade = { finish: () => void; keyframes: Keyframe[] | PropertyIndexedKeyframes | null };

let fades: Fade[];
let sheet: HTMLStyleElement;

function openCard() {
  const card = document.createElement('dialog');
  card.className = 'modal-shell';
  card.setAttribute('open', '');
  document.body.append(card);
  return card;
}

function stubSystemDark(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches } as MediaQueryList);
}

function veilsOf(card: HTMLElement) {
  return Array.from(card.querySelectorAll<HTMLElement>(`:scope > .${THEME_VEIL_CLASS}`));
}

describe('applyTheme', () => {
  beforeEach(() => {
    fades = [];
    sheet = document.createElement('style');
    sheet.textContent = `.modal-shell { background-color: ${LIGHT_SURFACE}; }
      :root[data-theme='dark'] .modal-shell { background-color: ${DARK_SURFACE}; }`;
    document.head.append(sheet);
    // jsdom has no Web Animations; each fade settles only when the test says so.
    HTMLElement.prototype.animate = vi.fn(function (keyframes) {
      let finish = () => {};
      const finished = new Promise<void>((resolve) => (finish = resolve));
      fades.push({ finish, keyframes });
      return { finished } as unknown as Animation;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
    sheet.remove();
    document.body.replaceChildren();
    root.removeAttribute('data-theme');
    root.removeAttribute('data-reduce-motion');
  });

  it('fades a veil of the open card’s previous surface off the new theme', () => {
    const card = openCard();
    applyTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    const [veil] = veilsOf(card);
    expect(veil.style.backgroundColor).toBe(LIGHT_SURFACE);
    expect(fades).toHaveLength(1);
    expect(fades[0].keyframes).toEqual({ opacity: [1, 0] });
  });

  it('retires the veil when its fade ends', async () => {
    const card = openCard();
    applyTheme('dark');
    fades[0].finish();
    await Promise.resolve();
    expect(veilsOf(card)).toHaveLength(0);
  });

  it('restarts a reversal mid-fade from the surface the card is showing', () => {
    const card = openCard();
    applyTheme('dark');
    veilsOf(card)[0].style.opacity = '0.5';
    applyTheme('light');
    const veils = veilsOf(card);
    expect(veils).toHaveLength(1);
    expect(veils[0].style.backgroundColor).toBe('rgb(145, 145, 149)');
  });

  it('veils nothing when System resolves to the appearance already shown', () => {
    const card = openCard();
    root.setAttribute('data-theme', 'light');
    stubSystemDark(false);
    applyTheme('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(veilsOf(card)).toHaveLength(0);
  });

  it('veils a change to System that flips the appearance', () => {
    const card = openCard();
    root.setAttribute('data-theme', 'dark');
    stubSystemDark(false);
    applyTheme('system');
    expect(veilsOf(card)[0].style.backgroundColor).toBe(DARK_SURFACE);
  });

  it('veils nothing for a restamp that changes nothing', () => {
    const card = openCard();
    root.setAttribute('data-theme', 'dark');
    applyTheme('dark');
    root.removeAttribute('data-theme');
    applyTheme('system');
    expect(veilsOf(card)).toHaveLength(0);
    expect(fades).toHaveLength(0);
  });

  it('swaps at once under reduced motion', () => {
    const card = openCard();
    root.setAttribute('data-reduce-motion', '');
    applyTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(veilsOf(card)).toHaveLength(0);
  });

  it('swaps at once with no card open', () => {
    applyTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    applyTheme('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(fades).toHaveLength(0);
  });

  it('styles the veil class it creates', () => {
    const css = readFileSync(resolve(process.cwd(), 'src', 'app.css'), 'utf8');
    expect(css).toMatch(new RegExp(`^\\.${THEME_VEIL_CLASS} \\{`, 'm'));
  });
});
