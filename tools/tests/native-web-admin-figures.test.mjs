// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_SESSION_KEY } from '../../src/pageDocument/admin/adminContract.ts';
import { ADMIN_STATS_PATH, createAdminApi } from '../../src/pageDocument/admin/adminApi.ts';
import { createAdminSessionStore } from '../../src/pageDocument/admin/adminSession.ts';
import { AdminConsole } from '../../src/pageDocument/admin/AdminConsole.tsx';
import { GRANTS, STATS } from './native-admin-stats-fixture.mjs';

// The admin console as it renders GET /api/admin/stats beside the code list: each code's
// generations and last use, the banner when the tallies cannot be read, and the free grant panel.
// React Strict DOM's styles need its compiler, so the elements render unstyled.
vi.mock('react-strict-dom', async () => (await import('./native-rsd-web-stub.mjs')).rsdWebStub());

const SESSION = 'a'.repeat(64);
const CODES = {
  ok: true,
  tokens: ['alpha', 'beta'],
  invites: ['alpha', 'beta'].map((token) => ({
    token,
    url: `https://splotch.test/?ai_access_token=${token}`,
  })),
  persistent: true,
};

const answer = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const storageWithSession = () => ({
  getItem: (key) => (key === ADMIN_SESSION_KEY ? SESSION : null),
  setItem: () => {},
  removeItem: () => {},
});

let container, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
});

// `stats` is the stats endpoint's answer, or null for one that fails.
async function render(stats) {
  const props = {
    theme: 'light',
    api: createAdminApi(async (path) =>
      path === ADMIN_STATS_PATH
        ? answer(stats ? 200 : 500, stats ?? { ok: false, error: 'Something went wrong' })
        : answer(200, CODES)
    ),
    sessions: createAdminSessionStore(storageWithSession),
    confirm: () => false,
    writeClipboard: async () => {},
  };
  await act(async () => root.render(h(AdminConsole, props)));
}

const tableRows = (label) =>
  [...container.querySelectorAll(`[role="table"][aria-label="${label}"] [role="row"]`)].map((row) =>
    [...row.querySelectorAll('[role="cell"],[role="columnheader"]')].map((cell) =>
      cell.textContent.trim()
    )
  );

describe("the admin console's figures", () => {
  it("shows each code's generations and last use, and the free grant panel", async () => {
    await render(STATS);
    const [head, alpha, beta] = tableRows('Access codes');
    expect(head).toEqual(['Code', 'Generations', 'Last used', 'Actions']);
    expect(alpha.slice(0, 3)).toEqual(['alpha3 generations·2 days ago', '3', '2 days ago']);
    expect(beta.slice(0, 3)).toEqual(['betaNever used', '—', 'Never used']);
    expect(container.textContent).toContain('Free generation grants · sample 1');
    expect(container.textContent).not.toContain('Generation tallies are unavailable.');
    const figures = [...container.querySelectorAll('[role="listitem"]')].map((item) =>
      item.textContent.trim()
    );
    expect(figures).toEqual([
      'Provider starts today4/500',
      'Sampled successes2',
      'Sampled attempts3',
      'Sampled failures1',
      'Sampled active1',
      'Sampled exhausted0',
      'Sampled in flight0',
    ]);
    expect(tableRows('Recent free generation grants')).toEqual([
      ['Installation', 'Used', 'Attempts', 'Failures', 'Last failure'],
      ['cccccccc…', '2/10', '3', '1', 'safety'],
    ]);
  });

  // A tally store that cannot be read leaves every code without one; calling them all "Never
  // used" would be wrong, so the columns go and a banner says why.
  it('says the tallies are unavailable and hides their columns', async () => {
    await render({
      ...STATS,
      usageAvailable: false,
      codes: STATS.codes.map(({ token }) => ({ token, usage: null })),
    });
    expect(container.textContent).toContain('Generation tallies are unavailable.');
    expect(tableRows('Access codes')[0]).toEqual(['Code', 'Actions']);
    expect(container.textContent).not.toContain('Never used');
    expect(container.textContent).toContain('Free generation grants');
  });

  it('warns that grant figures are held in memory or sampled', async () => {
    await render({
      ...STATS,
      freeGrantStats: { ...GRANTS, persistent: false, grantSamplePartial: true, recent: [] },
    });
    expect(container.textContent).toContain(
      'Free grant monitoring is using local memory and will reset with this server instance.'
    );
    expect(container.textContent).toContain(
      "Grant metrics and activity are sampled from the first 200 records. Today's provider-start count is complete."
    );
    expect(container.querySelector('[aria-label="Recent free generation grants"]')).toBeNull();
  });

  it('keeps the code list and drops the panel when the figures cannot be read', async () => {
    await render(null);
    expect(container.textContent).toContain('Generation tallies are unavailable.');
    expect(container.textContent).not.toContain('Free generation grants');
    expect(tableRows('Access codes')).toHaveLength(3);
  });
});
