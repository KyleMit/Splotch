import { act, createElement, Profiler } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { caller, records, host, mount, expandControls } from './rsd-native-selection-host.mjs';
import { RsdDrawingScreen } from '../../../src/rsdDrawing/RsdDrawingScreen.tsx';
import { strokeStyle } from '../../../src/drawing/model.ts';
import { canonicalPaper } from '../../tests/native-paper-fixtures.mjs';
import { Animated } from '../../../src/platform/animated.ts';
import { UNDO_SPIN_MS } from '../../../src/rsdDrawing/undoKeyframes.ts';

// A stroke keeps the chrome as it was (PR 2890): the screen owner's stroke flag gates the chrome's
// commands, but it must never reach a chrome control's props, or every control is updated, faded
// and laid out again on the UI thread at each stroke start and lift. The paper's own subtree is
// left out: its live draft is the state a stroke is meant to change. Each host here writes the
// props Fabric would diff into one attribute (`data-committed-props`), so a prop update is an
// attribute mutation and a re-mount is a removed or inserted node. Negative control: restoring
// `drawing ||` to `disabled` in useDrawingScreen updates every palette swatch, tile and the Clear
// Button at the start and again at the lift.

const PAPER_SLOT = '[data-testid="rsd-paper-slot"]';
const MOVES = 6;

let observer;
let mutations;
let commits;

beforeEach(() => {
  caller.realScreen = true;
  caller.settingsStorage = {
    read: vi.fn(async () => '{"version":1,"soundEnabled":false}'),
    write: vi.fn(async () => {}),
  };
  records.journalHostProps = true;
  commits = 0;
});

afterEach(() => observer?.disconnect());

function inChrome(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return element !== null && host.contains(element) && !element.closest(PAPER_SLOT);
}

function named(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const owner = element.closest('[aria-label],[data-testid]');
  return owner?.getAttribute('aria-label') ?? owner?.getAttribute('data-testid') ?? element.tagName;
}

// Every chrome host the commits since the last call changed: a prop or text update, or a node
// mounted or unmounted.
function chromeChanges() {
  mutations.push(...observer.takeRecords());
  const chrome = mutations.splice(0).filter(({ target }) => inChrome(target));
  return {
    updated: [
      ...new Set(
        chrome.filter(({ type }) => type !== 'childList').map(({ target }) => named(target))
      ),
    ],
    remounted: chrome
      .filter(({ type }) => type === 'childList')
      .flatMap(({ addedNodes, removedNodes }) => [...addedNodes, ...removedNodes]).length,
  };
}

const UNCHANGED = { updated: [], remounted: 0 };

function paper() {
  return caller.liveScreen.recovery.callbacks;
}

// The callbacks the paper's contact responder calls: every published contact frame reports the
// stroke flag again, and the lift hands over the finished cohort before clearing it.
async function contactFrame() {
  await act(async () => paper().onDrawingChange(true));
}

async function lift() {
  const screen = caller.liveScreen;
  const stroke = {
    ...strokeStyle(screen.brush, 'Purple', screen.history.drawing, 'medium'),
    points: [
      { x: 10, y: 10 },
      { x: 60, y: 60 },
    ],
  };
  await act(async () => {
    paper().onCohort([stroke], canonicalPaper());
    paper().onDrawingChange(false);
  });
}

async function mountInked() {
  await mount(
    createElement(
      Profiler,
      {
        id: 'drawing-screen',
        onRender: () => {
          commits += 1;
        },
      },
      createElement(RsdDrawingScreen)
    )
  );
  // A first stroke, so Undo, the Screenshot camera and the Clear Button already show ink and the
  // measured stroke changes none of them.
  await act(async () => host.querySelector('[aria-label="Draw RSD fixture stroke"]').click());
  await expandControls();
  await act(async () => {});
  mutations = [];
  observer = new MutationObserver((records) => mutations.push(...records));
  observer.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
}

it('leaves every chrome host untouched through a stroke start, its moves and its lift', async () => {
  await mountInked();
  expect(host.querySelector('[aria-label="Undo"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Purple"]')).not.toBeNull();

  await contactFrame();
  expect(caller.liveScreen.drawing).toBe(true);
  expect(chromeChanges()).toEqual(UNCHANGED);

  // A move publishes the flag the screen already holds. React may render the owner once more to
  // find the state unchanged, and never again however many frames follow.
  const started = commits;
  for (let move = 0; move < MOVES; move += 1) await contactFrame();
  expect(commits - started).toBeLessThanOrEqual(1);
  expect(chromeChanges()).toEqual(UNCHANGED);

  await lift();
  expect(caller.liveScreen.drawing).toBe(false);
  expect(caller.liveScreen.history.drawing.strokes).toHaveLength(2);
  expect(chromeChanges()).toEqual(UNCHANGED);
});

it('takes a stroke back and winds only the Undo glyph without re-mounting the chrome', async () => {
  await mountInked();
  await contactFrame();
  await lift();
  chromeChanges();

  const timing = vi.spyOn(Animated, 'timing');
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  await act(async () => host.querySelector('[aria-label="Undo"]').click());
  expect(caller.liveScreen.history.drawing.strokes).toHaveLength(1);
  const spin = timing.mock.calls
    .map(([, config]) => config)
    .filter((config) => config.duration === UNDO_SPIN_MS);
  expect(spin).toHaveLength(1);
  expect(spin[0]).toMatchObject({ useNativeDriver: true });
  expect(
    host.querySelector('[aria-label="Undo"] [data-testid="rsd-undo-feedback"]')
  ).not.toBeNull();
  expect(chromeChanges()).toEqual(UNCHANGED);
  clock.mockRestore();
  timing.mockRestore();
});

// Positive control for the journal: a change the chrome does show is seen, as the swatches the
// selection leaves and joins and the Selection Ring it moves between them.
it('sees a paint choice update the swatches it moves the selection between', async () => {
  await mountInked();
  await act(async () => host.querySelector('[aria-label="Blue"]').click());
  const { updated, remounted } = chromeChanges();
  expect(updated).toEqual(expect.arrayContaining(['Purple', 'Blue']));
  expect(remounted).toBeGreaterThan(0);
});
