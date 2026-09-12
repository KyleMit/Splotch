// @vitest-environment node
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

import AdminConsole from './AdminConsole.svelte';

// Every form in this component submits through a callback that cancels the
// native submit, and none carries an action/method — so before hydration the
// browser default-submits as a GET to the current URL with each field as a query
// param. Both doors leak a secret that way: the login card the admin access key
// (issue #615's reported failure, "navigated to /admin?access-key=…", which was
// read as a slow round trip), the authed page a freshly minted AI access code.
// Neither does the thing that was asked.
//
// Server-rendered output IS the pre-hydration state, so asserting on it settles
// the invariant with no browser, no timing and nothing to race. It also spends no
// admin-login rate-limit budget, which an end-to-end version of this check would
// (see web/tests/admin-helpers.ts) — and it reaches the authed door, which is
// exactly the one the first attempt at this guard missed.
const handlers = {
  onlogin: async () => true,
  onlogout: async () => {},
  onadd: async () => true,
  onremove: async () => {},
};

function servedMarkup(authed: boolean) {
  return render(AdminConsole, {
    props: { ...handlers, authed, invites: [], persistent: true },
  }).body;
}

describe.each([
  ['logged out', false],
  ['signed in', true],
])('AdminConsole served to a %s visitor', (_state, authed) => {
  const body = servedMarkup(authed);
  const submits = body.match(/<button[^>]*type="submit"[^>]*>/g) ?? [];

  it('renders a submit, so the assertions below are about something', () => {
    expect(submits).not.toHaveLength(0);
  });

  it('ships every submit disabled', () => {
    for (const submit of submits) expect(submit).toContain('disabled');
  });

  // If a form ever gains an action, a native submit becomes a real request and
  // disabling the button is the wrong fix — this is here so that change is
  // noticed rather than silently making the guard above meaningless.
  it('has no form that could submit somewhere useful on its own', () => {
    for (const form of body.match(/<form[^>]*>/g) ?? []) {
      expect(form).not.toMatch(/\baction=|\bmethod=/);
    }
  });
});

// The tally backend being down and nobody having redeemed a code produce the
// same empty cells, so the difference has to be said out loud rather than
// inferred from the rows.
// Only the column header renders this; the banner's prose says "the Generations
// and Last used columns", which has no closing angle bracket before the word.
const COLUMN_HEADER = '>Generations<';

describe('AdminConsole when the generation tally is unavailable', () => {
  const invites = [
    { token: 'managed-code', url: 'https://splotch.art/?code=managed-code', usage: null },
  ];

  function servedConsole(usageAvailable: boolean) {
    return render(AdminConsole, {
      props: { ...handlers, authed: true, invites, persistent: true, usageAvailable },
    }).body;
  }

  it('warns the operator, and hides the columns that have no data', () => {
    const body = servedConsole(false);

    expect(body).toContain('Generation tallies are unavailable');
    // The column header specifically — the banner copy names the columns too.
    expect(body).not.toContain(COLUMN_HEADER);
  });

  it('says nothing and keeps the columns when the tally is reachable', () => {
    const body = servedConsole(true);

    expect(body).not.toContain('Generation tallies are unavailable');
    expect(body).toContain(COLUMN_HEADER);
  });
});
