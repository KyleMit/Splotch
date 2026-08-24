// @vitest-environment happy-dom
//
// The generated bootstrap, EXECUTED. The previous tests asserted substrings of
// the source, so disabling the whole theme branch with `if (false && ...)` left
// eleven of them green — they proved the code was written, never that it runs.
//
// The fixture stands in for the product: clicking a theme control is what sets
// `documentElement.dataset.theme`, exactly as the real Settings controls do, so
// the bootstrap has to actually find and click one to make the assertion pass.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The bootstrap polls on the same budgets it uses on a device, so executing it
// costs seconds rather than milliseconds. That is the price of running the real
// thing instead of grepping it.
const BOOTSTRAP_TIMEOUT_MS = 20_000;
import { pageBootstrapSource } from '../split-capture/lib/page-bootstrap.mjs';
import { readinessThemeProblem } from '../lib/campaign-state.mjs';

const CANVAS_RECT = { x: 0, y: 0, width: 800, height: 600 };

function paintShell({ compact, startingTheme }) {
  document.documentElement.dataset.theme = startingTheme ?? '';
  document.body.innerHTML = `
    <canvas id="drawingCanvas"></canvas>
    <div class="canvas-stack"></div>
    <button aria-label="Expand controls"></button>
    <button id="brushButton"></button>
    <button id="penBrushButton" hidden></button>
    <button aria-label="Settings"></button>
    <dialog id="settingsModal">
      ${compact ? '<div class="quick-toggles"><button id="quickNightToggle" aria-checked="false"></button></div>' : ''}
      ${compact ? '' : '<button data-section="appearance"></button>'}
    </dialog>
  `;
  const canvas = document.querySelector('#drawingCanvas');
  canvas.getBoundingClientRect = () => CANVAS_RECT;
  document.elementFromPoint = () => document.querySelector('.canvas-stack');
  window.__committedBrushMode = () => 'pen';

  const modal = document.querySelector('#settingsModal');
  document.querySelector('button[aria-label="Settings"]').addEventListener('click', () => {
    modal.open = true;
    if (!compact && !document.querySelector('#themeOption-light')) return;
  });

  if (compact) {
    const toggle = document.querySelector('#quickNightToggle');
    toggle.addEventListener('click', () => {
      const next = toggle.getAttribute('aria-checked') === 'true' ? 'light' : 'dark';
      toggle.setAttribute('aria-checked', String(next === 'dark'));
      document.documentElement.dataset.theme = next;
    });
  } else {
    // The sectioned shell reveals the options only after the Appearance row.
    document.querySelector('button[data-section="appearance"]').addEventListener('click', () => {
      for (const theme of ['light', 'dark']) {
        const option = document.createElement('button');
        option.id = `themeOption-${theme}`;
        option.addEventListener('click', () => {
          document.documentElement.dataset.theme = theme;
        });
        modal.append(option);
      }
    });
  }
  const close = document.createElement('button');
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => (modal.open = false));
  modal.append(close);
}

function runBootstrap(plan) {
  const posted = [];
  let readyResolve;
  const readyPosted = new Promise((resolve) => (readyResolve = resolve));

  global.fetch = vi.fn(async (path, init) => {
    if (path === '/__probe/plan') return { json: async () => plan };
    const body = init?.body ? JSON.parse(init.body) : null;
    posted.push({ path, body });
    if (path === '/__probe/ready') readyResolve(body);
    return { json: async () => ({}) };
  });

  // The probe is a same-origin <script src> the fixture cannot fetch, so its
  // arrival is simulated at the point the bootstrap waits for it.
  const append = document.head.append.bind(document.head);
  document.head.append = (element) => {
    if (element.tagName === 'SCRIPT') {
      window.__probe = { finish: () => ({ meta: { counts: {} } }), stop: () => {} };
      queueMicrotask(() => element.onload?.());
      return;
    }
    return append(element);
  };

  new Function(pageBootstrapSource())();
  return { readyPosted, posted };
}

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  delete window.__probe;
});

describe('the bootstrap actually setting the theme', () => {
  // Landscape phones get CompactShell, which has one Night Mode toggle rather
  // than a three-way picker. Both shells are exercised, because the control flow
  // through them is different and only one was ever run on a device per session.
  it(
    'drives the CompactShell toggle until the page resolves to dark',
    async () => {
      paintShell({ compact: true, startingTheme: 'light' });

      const { readyPosted } = runBootstrap({ brush: 'pen', theme: 'dark', nonce: 'n' });

      expect((await readyPosted).resolvedTheme).toBe('dark');
      expect(document.documentElement.dataset.theme).toBe('dark');
    },
    BOOTSTRAP_TIMEOUT_MS
  );

  it(
    'navigates the sectioned shell to the Appearance options and picks light',
    async () => {
      paintShell({ compact: false, startingTheme: 'dark' });

      const { readyPosted } = runBootstrap({ brush: 'pen', theme: 'light', nonce: 'n' });

      expect((await readyPosted).resolvedTheme).toBe('light');
      expect(document.documentElement.dataset.theme).toBe('light');
    },
    BOOTSTRAP_TIMEOUT_MS
  );

  it(
    'leaves a page already on the requested theme alone',
    async () => {
      paintShell({ compact: true, startingTheme: 'dark' });

      const { readyPosted, posted } = runBootstrap({ brush: 'pen', theme: 'dark', nonce: 'n' });

      expect((await readyPosted).resolvedTheme).toBe('dark');
      expect(posted.some((call) => call.path === '/__probe/log')).toBe(false);
    },
    BOOTSTRAP_TIMEOUT_MS
  );

  // Readiness is what the runner refuses a mismatch on, so it must carry the
  // observed value even when no theme was requested at all.
  it(
    'reports the resolved theme even when the plan asks for none',
    async () => {
      paintShell({ compact: true, startingTheme: 'light' });

      const { readyPosted } = runBootstrap({ brush: 'pen', nonce: 'n' });

      expect((await readyPosted).resolvedTheme).toBe('light');
    },
    BOOTSTRAP_TIMEOUT_MS
  );
});

// The refusal both runners make before a device or a person spends the capture.
// It was inlined and unexercised; either branch could have been inverted without
// a test noticing.
describe('refusing a readiness payload the theme cannot be trusted from', () => {
  it('accepts a page reporting the theme that was asked for', () => {
    expect(readinessThemeProblem({ resolvedTheme: 'dark' }, 'dark')).toBeNull();
  });

  it('refuses a mismatch, naming both sides', () => {
    const problem = readinessThemeProblem({ resolvedTheme: 'light' }, 'dark');

    expect(problem).toContain('light');
    expect(problem).toContain('dark');
  });

  // Silence is refused as firmly as a mismatch. Treating it as consent is how the
  // request-echo defect worked: nobody checked, so nobody disagreed.
  it('refuses a page that reports no theme at all', () => {
    expect(readinessThemeProblem({}, 'dark')).toContain('cannot prove');
    expect(readinessThemeProblem(undefined, 'dark')).toContain('cannot prove');
  });

  it('still requires an answer when no theme was requested', () => {
    expect(readinessThemeProblem({}, undefined)).toContain('cannot prove');
    expect(readinessThemeProblem({ resolvedTheme: 'light' }, undefined)).toBeNull();
  });
});
