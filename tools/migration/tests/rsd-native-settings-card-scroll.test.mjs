import { host, mount, records, openSettingsSection } from './rsd-native-selection-host.mjs';
import './rsd-native-settings-hub-mocks.mjs';
import { drawingScreen, storedSettings } from './rsd-native-settings-fixture.mjs';
import { createElement } from 'react';
import { expect, it } from 'vitest';
import { RsdDrawingScreen } from '../../../src/rsdDrawing/RsdDrawingScreen.tsx';
import { modalFrame } from '../../../src/rsdDrawing/modalGeometry.ts';

// A Settings card of fixed height scrolls only if every view between the card and its scroller
// can give up height: a view that cannot shrink keeps a taller layout than the card leaves it, the
// card clips it, and the scroller inside is as tall as its content, so nothing scrolls. On a phone
// that hid AI Art's Auto-Save switch below the card (#3118). React Native's Yoga resolves an unset
// flexShrink to 0, so `flex: 1` alone never shrinks.

const PHONE = { width: 402, height: 874, scale: 1, fontScale: 1 };
const TABLET = { width: 1366, height: 1024, scale: 2, fontScale: 1 };

function committedStyle(element) {
  const props = element.getAttribute('data-committed-props');
  return props ? (JSON.parse(props).style ?? {}) : null;
}

function resolvedShrink(style) {
  if (typeof style.flexShrink === 'number') return style.flexShrink;
  return typeof style.flex === 'number' && style.flex < 0 ? -style.flex : 0;
}

// A column child must shrink; a row child takes the row's height by stretching across it.
function givesWay(style, parent) {
  if (style.position === 'absolute') return true;
  const row = parent.display === 'flex' && (parent.flexDirection ?? 'row').startsWith('row');
  if (row) return (style.alignSelf ?? parent.alignItems ?? 'stretch') === 'stretch';
  return resolvedShrink(style) > 0;
}

// Every view on the way from the card to each scroller inside it that keeps its height.
function rigidViews(card) {
  const rigid = [];
  for (const scroller of card.querySelectorAll('section')) {
    let parent = committedStyle(card);
    const path = [];
    for (let node = scroller.parentElement; node !== card; node = node.parentElement)
      path.unshift(node);
    for (const node of path) {
      const style = committedStyle(node);
      if (style === null) continue;
      if (!givesWay(style, parent))
        rigid.push(`${node.getAttribute('data-testid') ?? node.tagName} ${JSON.stringify(style)}`);
      parent = style;
    }
  }
  return rigid;
}

async function openCard(dimensions, section) {
  records.dimensions = dimensions;
  records.journalHostProps = true;
  storedSettings({ aiEnabled: true });
  drawingScreen();
  await mount(createElement(RsdDrawingScreen));
  if (section) await openSettingsSection(section);
  return host.querySelector('[data-testid="modal-surface"]');
}

it('lets the phone AI Art body shrink to its fixed card so the setup form scrolls', async () => {
  const card = await openCard(PHONE, 'AI Art');
  const { height } = modalFrame('aiSettings', PHONE, 0);
  expect(height).not.toBeNull();
  expect(committedStyle(card).height).toBe(height);
  expect(card.querySelectorAll('section')).toHaveLength(1);
  expect(card.querySelector('section').textContent).toContain('Auto-Save AI Images');
  expect(rigidViews(card)).toEqual([]);
});

it('lets the wide Settings card, also of fixed height, shrink its body to the card', async () => {
  const card = await openCard(TABLET, null);
  expect(modalFrame('settings', TABLET, 0).height).not.toBeNull();
  expect(card.querySelectorAll('section').length).toBeGreaterThan(0);
  expect(rigidViews(card)).toEqual([]);
});
