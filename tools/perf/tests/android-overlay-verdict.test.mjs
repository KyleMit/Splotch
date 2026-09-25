import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { overlayCheck, untrustedOverlayVerdict } from '../lib/android-overlay-verdict.mjs';
import { parseInputWindows } from '../lib/android-touch-occlusion.mjs';
import { androidVerificationBlockers } from '../lib/capture-readiness.mjs';

const fixture = (name) => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');
// The rig phone's dump from issue 2214: two stacked 0.7998-alpha nu.nav.bar
// windows on the portrait centre column, above the native app.
const OCCLUDED_DUMP = fixture('android-dumpsys-input-occluded.txt');
// The rig phone on 2026-09-25 with Chrome in front, after "Appear on top" was
// turned off: both nu.nav.bar windows attached, NOT_VISIBLE, alpha 0.
const CLEARED_DUMP = fixture('android-dumpsys-input-overlay-cleared.txt');
// The same windows as issue 2229 recorded them over Chrome: visible, alpha 0.799805.
const CHROME_OCCLUDED_DUMP = CLEARED_DUMP.replace(
  /inputConfig=NOT_VISIBLE \| (NOT_FOCUSABLE \| NOT_TOUCHABLE, samsungFlags=0x0), alpha=0,/g,
  'inputConfig=$1, alpha=0.799805,'
);

const overlay = (overrides = {}) => ({
  name: 'abc com.example.bubble',
  flags: new Set(['NOT_FOCUSABLE', 'NOT_TOUCHABLE']),
  alpha: 0.6,
  frame: { left: 0, top: 0, right: 100, bottom: 100 },
  ownerUid: 10400,
  occlusionMode: 'USE_OPACITY',
  ...overrides,
});
const app = {
  name: 'def com.android.chrome/org.chromium.chrome.browser.ChromeTabbedActivity',
  flags: new Set(),
  alpha: 1,
  frame: { left: 0, top: 0, right: 1080, bottom: 2340 },
  ownerUid: 10268,
  occlusionMode: 'BLOCK_UNTRUSTED',
};

describe('untrustedOverlayVerdict', () => {
  it('fails the issue 2214 dump, naming the package and the point', () => {
    const verdict = untrustedOverlayVerdict(parseInputWindows(OCCLUDED_DUMP));
    expect(verdict).toMatchObject({
      pass: false,
      windows: 2,
      point: '(540,99)',
      package: 'nu.nav.bar',
    });
    expect(verdict.combinedOpacity).toBeGreaterThan(0.95);
    expect(verdict.detail).toBe(
      "nu.nav.bar's USE_OPACITY windows combine to 0.96 at (540,99) over art.splotch.app (> 0.8)"
    );
  });

  it('fails the issue 2229 state over Chrome', () => {
    const verdict = untrustedOverlayVerdict(parseInputWindows(CHROME_OCCLUDED_DUMP));
    expect(verdict).toMatchObject({ pass: false, point: '(540,99)', package: 'nu.nav.bar' });
    expect(verdict.detail).toContain('over com.android.chrome');
  });

  it('passes the rig phone with Appear on top turned off', () => {
    const verdict = untrustedOverlayVerdict(parseInputWindows(CLEARED_DUMP));
    expect(verdict).toMatchObject({ pass: true, windows: 0, point: null, package: null });
    expect(verdict.detail).toBe('no untrusted USE_OPACITY overlay over com.android.chrome');
  });

  it('passes once only one of the stacked windows remains', () => {
    const single = OCCLUDED_DUMP.split('\n')
      .filter((line) => !line.includes('name=cf92dfa nu.nav.bar'))
      .join('\n');
    const verdict = untrustedOverlayVerdict(parseInputWindows(single));
    expect(verdict).toMatchObject({ pass: true, windows: 1, point: '(540,99)' });
  });

  it('fails any package whose overlapping windows sum past the limit where they overlap', () => {
    const verdict = untrustedOverlayVerdict([
      overlay({ frame: { left: 0, top: 0, right: 10, bottom: 100 } }),
      overlay({ frame: { left: 5, top: 0, right: 15, bottom: 100 } }),
      app,
    ]);
    expect(verdict).toMatchObject({
      pass: false,
      combinedOpacity: 0.84,
      point: '(5,0)',
      package: 'com.example.bubble',
    });
  });

  it('sums per uid, as Android does, not across uids', () => {
    const verdict = untrustedOverlayVerdict([overlay(), overlay({ ownerUid: 10401 }), app]);
    expect(verdict).toMatchObject({ pass: true, combinedOpacity: 0.6 });
  });

  it('ignores trusted, invisible, same-uid, and below-content windows', () => {
    const verdict = untrustedOverlayVerdict([
      overlay({ flags: new Set(['TRUSTED_OVERLAY']), alpha: 1 }),
      overlay({ flags: new Set(['NOT_VISIBLE']), alpha: 1 }),
      overlay({ ownerUid: app.ownerUid, alpha: 1 }),
      app,
      overlay({ alpha: 1 }),
    ]);
    expect(verdict).toMatchObject({ pass: true, windows: 0 });
  });

  it('ignores an overlay that lies outside the content window', () => {
    const content = { ...app, frame: { left: 0, top: 99, right: 1080, bottom: 2196 } };
    const verdict = untrustedOverlayVerdict([
      overlay({ alpha: 1, frame: { left: 0, top: 0, right: 1080, bottom: 99 } }),
      content,
    ]);
    expect(verdict).toMatchObject({ pass: true, windows: 1 });
  });

  it('judges the whole display when no activity window is in front', () => {
    const verdict = untrustedOverlayVerdict([overlay({ alpha: 0.9 })]);
    expect(verdict).toMatchObject({ pass: false, point: '(0,0)' });
    expect(verdict.detail).toContain('over the display');
  });
});

describe('overlayCheck', () => {
  it('blocks the preflight and its input verification on a failing verdict', () => {
    const check = overlayCheck(untrustedOverlayVerdict(parseInputWindows(OCCLUDED_DUMP)));
    expect(check.status).toBe('blocked');
    expect(androidVerificationBlockers({ androidChecks: [check], portChecks: [] })).toEqual([
      "android touch overlay: nu.nav.bar's USE_OPACITY windows combine to 0.96 at (540,99) over art.splotch.app (> 0.8)",
    ]);
  });

  it('passes the preflight on a clear verdict', () => {
    const check = overlayCheck(untrustedOverlayVerdict(parseInputWindows(CLEARED_DUMP)));
    expect(check).toMatchObject({ name: 'android touch overlay', status: 'ok' });
  });
});
