// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../lib/proc.mjs';

const ACTION_PROBE = readFileSync(join(ROOT, 'tools', 'perf', 'probes', 'action-probe.js'), 'utf8');

function visualEffectEvent(type, details) {
  const event = new Event(type, { bubbles: true });
  for (const [key, value] of Object.entries(details)) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  delete window.__actionProbe;
});

describe('action probe visual-effect attribution', () => {
  it('names a transitioning target and closes its effect when the target is removed', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    Function(ACTION_PROBE)();

    const chip = document.createElement('button');
    chip.id = 'active-page';
    chip.className = 'active-page-chip pressed';
    document.body.append(chip);

    window.__actionProbe.begin('clear page', '#active-page', ['click']);
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    chip.dispatchEvent(
      visualEffectEvent('transitionrun', {
        propertyName: 'transform',
        pseudoElement: '',
      })
    );
    chip.remove();
    await Promise.resolve();

    const sample = window.__actionProbe.finish();
    expect(sample.activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'transitionrun',
          target: 'button#active-page.active-page-chip.pressed',
          property: 'transform',
        }),
        expect.objectContaining({
          type: 'dom-mutation',
          removed: ['button#active-page.active-page-chip.pressed'],
        }),
        expect.objectContaining({
          type: 'visual-effect-detached',
          target: 'button#active-page.active-page-chip.pressed',
          effects: ['transition:transform:'],
        }),
      ])
    );
  });
});
