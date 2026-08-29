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

function installFrameClock() {
  let callbacks = [];
  vi.stubGlobal('requestAnimationFrame', (callback) => callbacks.push(callback));
  return () => {
    const pending = callbacks;
    callbacks = [];
    for (const callback of pending) callback(performance.now() + 0.01);
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  delete window.__actionProbe;
});

describe('action probe visual-effect attribution', () => {
  it('names a transitioning target and closes its effect when the target is removed', async () => {
    const tickFrame = installFrameClock();
    Function(ACTION_PROBE)();
    tickFrame();
    tickFrame();

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
    tickFrame();
    tickFrame();
    chip.remove();
    await Promise.resolve();
    tickFrame();
    tickFrame();

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
    expect(sample.postActionFrames.map((frame) => frame.visualEffectsActive)).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe('action probe mutation attribution', () => {
  it('reports descriptor truncation without inspecting nodes beyond the cap', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    Function(ACTION_PROBE)();

    const target = document.createElement('button');
    target.id = 'open-coloring-books';
    document.body.append(target);
    window.__actionProbe.begin('open coloring books', '#open-coloring-books', ['click']);
    target.click();

    const noise = Array.from({ length: 20 }, (_, index) => {
      const node = document.createElement('div');
      node.className = `noise-${index}`;
      return node;
    });
    const dialog = document.createElement('dialog');
    dialog.id = 'coloring-book-dialog';
    Object.defineProperty(dialog, 'className', {
      get() {
        throw new Error('nodes beyond the descriptor cap must not be inspected');
      },
    });
    document.body.append(...noise, dialog);
    await Promise.resolve();

    const sample = window.__actionProbe.finish();
    const mutation = sample.activities.find((activity) => activity.addedTotal === 21);
    expect(mutation).toEqual(
      expect.objectContaining({
        type: 'dom-mutation',
        added: noise.slice(0, 8).map((node) => `div.${node.className}`),
        addedTotal: 21,
      })
    );
    expect(mutation.added).not.toContain('dialog#coloring-book-dialog');
  });

  it('caps mutation details while preserving every activity timestamp', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    Function(ACTION_PROBE)();

    const target = document.createElement('button');
    target.id = 'open-settings';
    document.body.append(target);
    window.__actionProbe.begin('open Settings', '#open-settings', ['click']);
    target.click();

    for (let index = 0; index < 40; index++) {
      const node = document.createElement('div');
      node.className = `mutation-${index}`;
      document.body.append(node);
      await Promise.resolve();
    }

    const sample = window.__actionProbe.finish();
    const mutations = sample.activities.filter((activity) => activity.type === 'dom-mutation');
    expect(mutations).toHaveLength(40);
    expect(mutations.filter((activity) => activity.targets)).toHaveLength(32);
    expect(mutations[32]).toEqual(
      expect.objectContaining({ type: 'dom-mutation', detailsOmitted: true })
    );
    expect(mutations[33]).toEqual(
      expect.not.objectContaining({ targets: expect.anything(), detailsOmitted: expect.anything() })
    );
  });
});
