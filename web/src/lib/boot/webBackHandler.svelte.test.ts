import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in for the browser's session history as SvelteKit's shallow routing
// exposes it: pushState appends an entry and makes its state `page.state`,
// history.back() drops back to the previous entry and fires popstate.
const session = vi.hoisted(() => ({
  entries: [{}] as App.PageState[],
  page: { state: {} as App.PageState },
}));

vi.mock('$app/state', () => ({ page: session.page }));
vi.mock('$app/navigation', () => ({
  pushState: (_url: string, state: App.PageState) => {
    session.entries.push(state);
    session.page.state = state;
  },
}));
vi.mock('./dialogBack', () => ({ respondToDialogBack: () => 'no-dialog' }));

import { modalDialog } from '$lib/actions/modalDialog.svelte';
import { createModal } from '$lib/state/modal.svelte';
import { installWebBackHandler } from './webBackHandler';

// A SvelteKit link to another route pushes the new URL before the old page
// unmounts, and in that flush page.state still reads the old entry.
function navigateAway() {
  session.entries.push({});
  history.pushState({}, '', '/privacy');
}

function mountOpenDialog() {
  const modal = createModal();
  const dialog = document.body.appendChild(document.createElement('dialog'));
  const destroyAction = $effect.root(
    () => modalDialog(dialog, () => ({ open: modal.open, onRequestClose: modal.hide })).destroy
  );
  modal.show(null);
  flushSync();
  // Svelte takes an unmounted component's DOM out before its actions' destroy.
  return () => {
    dialog.remove();
    destroyAction();
  };
}

describe('web Back history', () => {
  let stop = () => {};

  beforeEach(() => {
    session.entries = [{}];
    session.page.state = {};
    vi.spyOn(history, 'back').mockImplementation(() => {
      session.entries.pop();
      session.page.state = session.entries.at(-1) ?? {};
      dispatchEvent(new PopStateEvent('popstate'));
    });
    stop = installWebBackHandler().stop;
  });

  afterEach(() => {
    stop();
    vi.restoreAllMocks();
    history.replaceState(null, '', '/');
    document.body.replaceChildren();
  });

  it('drops the entry of a dialog unmounted while open', () => {
    const unmountDialog = mountOpenDialog();
    expect(session.entries).toHaveLength(2);

    unmountDialog();

    expect(session.entries).toHaveLength(1);
    expect(session.page.state.splotchBackNavigation).toBeUndefined();
  });

  it('leaves the dialog entry behind when a navigation away unmounts it', () => {
    const unmountDialog = mountOpenDialog();
    navigateAway();

    unmountDialog();

    expect(history.back).not.toHaveBeenCalled();
    expect(session.entries).toHaveLength(3);
  });
});
