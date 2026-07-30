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
