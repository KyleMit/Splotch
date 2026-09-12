// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_LEDGER_COMPACT_MAX_WIDTH_PX,
  ADMIN_LEDGER_LANDSCAPE_MAX_HEIGHT_PX,
  ADMIN_LEDGER_LANDSCAPE_MAX_WIDTH_PX,
  ADMIN_LEDGER_STACK_MAX_WIDTH_PX,
} from '../../breakpoints';

// Three components skin one ledger row across the same steps: the row itself,
// the action cells inside it, and the console's add button. A value that moves
// in one of them splits the row's first line from its reveal line — the chevron
// appears with no reveal beneath it, or the reveal opens under a row still
// showing the wide inline actions. CSS cannot import a constant, so this reads
// the sources and holds their copies to it.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const LEDGER = read('./InviteLedger.svelte');
const ROW_ACTIONS = read('./InviteRowActions.svelte');
const CONSOLE = read('./AdminConsole.svelte');

const MAX_WIDTH_STEP = /\(max-width: (\d+)px\)/g;
const LANDSCAPE_ARM =
  /\(max-width: (\d+)px\) and \(max-height: (\d+)px\) and \(orientation: landscape\)/g;

const steps = (source: string) => [...source.matchAll(MAX_WIDTH_STEP)].map((m) => Number(m[1]));
const landscapeArms = (source: string) =>
  [...source.matchAll(LANDSCAPE_ARM)].map((m) => [Number(m[1]), Number(m[2])]);

// A second step near the compact one is the drift this catches: 540 or 580
// written from memory looks right in a diff and skins the row's two lines for
// different viewports. The stacking step is 240px away and is a separate
// decision, so it sits outside the band.
const COMPACT_BAND_PX = 100;

describe('the admin ledger breakpoints', () => {
  it.each([
    ['InviteLedger', LEDGER],
    ['InviteRowActions', ROW_ACTIONS],
    ['AdminConsole', CONSOLE],
  ])('%s takes the compact step at the shared width', (label, source) => {
    expect(steps(source), `${label} takes the compact step`).toContain(
      ADMIN_LEDGER_COMPACT_MAX_WIDTH_PX
    );
    expect(
      steps(source).filter(
        (step) =>
          step !== ADMIN_LEDGER_COMPACT_MAX_WIDTH_PX &&
          Math.abs(step - ADMIN_LEDGER_COMPACT_MAX_WIDTH_PX) <= COMPACT_BAND_PX
      ),
      `${label} declares a second step inside the compact band`
    ).toEqual([]);
  });

  it('stacks the usage line at the shared width', () => {
    expect(steps(LEDGER)).toContain(ADMIN_LEDGER_STACK_MAX_WIDTH_PX);
  });

  // The two components that carry the landscape arm must carry the same one:
  // it is a bespoke device class, not the app-wide PHONE_LANDSCAPE_QUERY.
  it.each([
    ['InviteLedger', LEDGER],
    ['InviteRowActions', ROW_ACTIONS],
  ])('%s scopes its landscape arm to the shared device class', (label, source) => {
    const arms = landscapeArms(source);

    expect(arms.length, `${label} carries a landscape arm`).toBeGreaterThan(0);
    for (const arm of arms) {
      expect(arm, label).toEqual([
        ADMIN_LEDGER_LANDSCAPE_MAX_WIDTH_PX,
        ADMIN_LEDGER_LANDSCAPE_MAX_HEIGHT_PX,
      ]);
    }
  });
});
