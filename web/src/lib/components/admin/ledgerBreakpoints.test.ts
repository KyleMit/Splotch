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
// showing the wide inline actions.
//
// The arm has to be pinned to the block it belongs to, not merely present in the
// file. InviteLedger carries it twice, once on the stacking block and once on the
// compact block, and dropping either one alone leaves the other to satisfy a
// weaker check while 561-to-956px-wide short landscapes lose half the layout.
// So this asserts the exact group list rather than searching for a substring.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// Comments are stripped first: these files discuss their own media queries in
// prose, and a sentence must not be able to satisfy or defeat a match.
function widthGroups(source: string): string[] {
  const style = source.slice(source.indexOf('<style'));
  const css = style.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/@media([^{]+)\{/g)]
    .map((match) => match[1].split(/\s+/).join(' ').trim())
    .filter((group) => group.includes('max-width'));
}

const LANDSCAPE_ARM =
  `(max-width: ${ADMIN_LEDGER_LANDSCAPE_MAX_WIDTH_PX}px) and ` +
  `(max-height: ${ADMIN_LEDGER_LANDSCAPE_MAX_HEIGHT_PX}px) and (orientation: landscape)`;
const COMPACT_STEP = `(max-width: ${ADMIN_LEDGER_COMPACT_MAX_WIDTH_PX}px)`;
const STACK_STEP = `(max-width: ${ADMIN_LEDGER_STACK_MAX_WIDTH_PX}px)`;

const LEDGER_SITES = [
  [
    'InviteLedger',
    './InviteLedger.svelte',
    [`${STACK_STEP}, ${LANDSCAPE_ARM}`, `${COMPACT_STEP}, ${LANDSCAPE_ARM}`],
  ],
  ['InviteRowActions', './InviteRowActions.svelte', [`${COMPACT_STEP}, ${LANDSCAPE_ARM}`]],
  // The console only shortens its add button, so it takes the compact step with
  // no landscape arm.
  ['AdminConsole', './AdminConsole.svelte', [COMPACT_STEP]],
] as const;

describe('the admin ledger breakpoints', () => {
  it.each(LEDGER_SITES)('%s steps exactly where the shared owner says', (_label, path, groups) => {
    expect(widthGroups(read(path))).toEqual(groups);
  });
});
