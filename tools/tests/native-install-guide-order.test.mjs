import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  exitGuideStepParts,
  installGuideStepParts,
  lockGuideStepParts,
} from '../../experiments/native-architecture/src/install/installGuideCopy.ts';
import { spokenInstallText } from '../../experiments/native-architecture/src/install/installCopy.ts';

// native-web-install-drift.test.mjs finds each native step somewhere in the shipping markup. This
// holds each checklist to the shipping one in full: the same steps, in the same order, with the
// same bold runs, so a dropped, added or reordered step fails too.
const SOURCE = readFileSync(
  new URL('../../web/src/lib/components/settings/SetupInstructions.svelte', import.meta.url),
  'utf8'
);
const SHARE_LOCATION = '{shareLocation}';

function snippet(name) {
  const start = SOURCE.indexOf(`{#snippet ${name}(`);
  const end = SOURCE.indexOf('{/snippet}', start);
  if (start === -1 || end === -1)
    throw new Error(`SetupInstructions.svelte has no ${name} snippet`);
  return SOURCE.slice(start, end);
}

// One arm of a snippet's `os` branch. The last `{:else}` opens the desktop arm, or Android's in
// the two-armed exit snippet; only the iOS install arm nests a block, and that block has no else.
function arm(body, os) {
  const ios = body.indexOf("{#if os === 'ios'}");
  const android = body.indexOf("{:else if os === 'android'}");
  const fallback = body.lastIndexOf('{:else}');
  const close = body.lastIndexOf('{/if}');
  if ([ios, fallback, close].includes(-1)) throw new Error('SetupInstructions.svelte arm moved');
  if (os === 'ios') return body.slice(ios, android === -1 ? fallback : android);
  if (os === 'android' && android !== -1) return body.slice(android, fallback);
  return body.slice(fallback, close);
}

// The iOS install arm leads with a Safari step only outside Safari.
function withOutsideSafari(markup, outsideSafari) {
  return outsideSafari
    ? markup.replace(/\{#if outsideSafari\}|\{\/if\}/g, '')
    : markup.replace(/\{#if outsideSafari\}[\s\S]*?\{\/if\}/, '');
}

const collapse = (text) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/ ([.,)])/g, '$1')
    .trim();

// Each list item as a reader sees it, and its bold runs.
function shippingSteps(markup) {
  return [...markup.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map(
    ([, item]) => ({
      text: collapse(item.replace(/<[^>]+>/g, ' ')),
      bold: [...item.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map(([, run]) => collapse(run)),
    })
  );
}

function nativeSteps(steps) {
  return steps.map((parts) => ({
    text: collapse(spokenInstallText(parts)),
    bold: parts
      .filter((part) => part.kind === 'strong' || part.kind === 'term')
      .map((part) => collapse(part.text)),
  }));
}

describe('the native install guide against SetupInstructions.svelte, step for step', () => {
  it.each([
    ['ios', false],
    ['ios', true],
    ['android', false],
    ['desktop', false],
  ])('lists the %s install steps (outside Safari: %s)', (os, outsideSafari) => {
    const markup = withOutsideSafari(arm(snippet('installSteps'), os), outsideSafari);
    expect(nativeSteps(installGuideStepParts(os, SHARE_LOCATION, outsideSafari))).toEqual(
      shippingSteps(markup)
    );
  });

  it.each(['ios', 'android', 'desktop'])('lists the %s lock steps', (os) => {
    expect(nativeSteps(lockGuideStepParts(os))).toEqual(
      shippingSteps(arm(snippet('lockSteps'), os))
    );
  });

  it.each(['ios', 'android'])('lists the %s steps out of an engaged lock', (os) => {
    expect(nativeSteps(exitGuideStepParts(os))).toEqual(
      shippingSteps(arm(snippet('exitSteps'), os))
    );
  });

  it('reads a non-empty checklist from every arm', () => {
    for (const os of ['ios', 'android', 'desktop'])
      expect(shippingSteps(arm(snippet('installSteps'), os)).length, os).toBeGreaterThan(2);
  });
});
