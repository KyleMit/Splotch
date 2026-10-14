import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { expect, it } from 'vitest';
import { expandControls, host, root } from './rsd-native-selection-host.mjs';
import { drawerStore } from './rsd-native-launch-stores.mjs';
import { mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

const drawerTiles = () => host.querySelectorAll('[data-testid="rsd-drawer-tool"]');
const chevron = (label) => host.querySelector(`[aria-label="${label}"]`);

// Shipping's own default for the key, from its BOOL_SETTINGS table.
function shippingDefault() {
  const settings = readFileSync(join(REPO_ROOT, 'web/src/lib/state/settings.svelte.ts'), 'utf8');
  const [, value] =
    /^\s*drawerOpen: \[STORAGE_KEYS\.drawerOpen, (true|false)\],$/m.exec(settings) ?? [];
  if (!value) throw new Error("Shipping's drawerOpen default is no longer in BOOL_SETTINGS.");
  return value === 'true';
}

async function launch() {
  await mountToolbar(toolbarScreen());
}

// A cold start: the app's tree goes away entirely and mounts again over the same storage.
async function relaunch() {
  await act(async () => root.unmount());
  host.remove();
  await launch();
}

function expectDrawer(open) {
  expect(drawerTiles().length > 0).toBe(open);
  expect(chevron(open ? 'Collapse controls' : 'Expand controls')).not.toBeNull();
}

it("starts a first launch on shipping's drawerOpen default", async () => {
  await launch();
  expectDrawer(shippingDefault());
});

it('reopens on the next launch the drawer a child left open', async () => {
  await launch();
  await expandControls();
  expectDrawer(true);
  expect(drawerStore.value).toBe('true');
  await relaunch();
  expectDrawer(true);
});

it('starts the next launch closed after a child closes a remembered open drawer', async () => {
  drawerStore.value = 'true';
  await launch();
  expectDrawer(true);
  await act(async () => chevron('Collapse controls').click());
  expectDrawer(false);
  expect(drawerStore.value).toBe('false');
  await relaunch();
  expectDrawer(false);
});

it.each(['TRUE', '1', 'yes', ''])(
  'starts closed when the stored drawer state is %j rather than a spelling shipping writes',
  async (stored) => {
    drawerStore.value = stored;
    await launch();
    expectDrawer(false);
  }
);

it('starts closed and still turns the drawer when its storage refuses every read and write', async () => {
  drawerStore.value = new Error('Storage is unavailable.');
  await launch();
  expectDrawer(false);
  await expandControls();
  expectDrawer(true);
});
