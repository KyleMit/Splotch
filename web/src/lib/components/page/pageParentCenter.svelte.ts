import type { Component } from 'svelte';
import { scheduleIdle } from '$lib/idle';
import { parentalGateLink } from '$lib/actions/parentalGateLink';
import { waitForDialogRetirement } from '$lib/actions/modalDialog.svelte';
import { createSingleFlight } from '$lib/singleFlight';
import type { Origin } from '$lib/state/modal.svelte';
import { openParentCenterSettings, SETTINGS_MODAL_ID, settingsModal } from '$lib/state/ui.svelte';

// One host per standalone shell avoids duplicate dialogs when its body and footer
// request the shared gate. Parent Center hydrates its persisted state on demand.
// Must be called during component init: it registers $effects.
export function createPageParentCenter() {
  let managingPolicies = $state(false);
  let gateComponent = $state<Component | null>(null);
  let modalComponent = $state<Component | null>(null);

  const loadParentalGate = createSingleFlight(
    async () => (await import('$lib/components/ParentalGate.svelte')).default
  );

  // The free-generation grant follows hydration on its own: the store the
  // modal imports installs its reaction when its module loads.
  const loadSettingsModal = createSingleFlight(async () => {
    const [module, { hydratePersistedState }] = await Promise.all([
      import('$lib/components/SettingsModal.svelte'),
      import('$lib/boot/persistedState'),
    ]);
    await hydratePersistedState();
    return module.default;
  });

  function mountParentalGate() {
    void loadParentalGate()
      .then((component) => (gateComponent = component))
      .catch((error) => console.error('Page parental gate failed to load:', error));
  }

  function warmParentalGate() {
    return scheduleIdle(mountParentalGate);
  }

  function gatedLink(node: HTMLAnchorElement) {
    node.addEventListener('click', mountParentalGate);
    const gateLink = parentalGateLink(node);
    return {
      destroy() {
        node.removeEventListener('click', mountParentalGate);
        gateLink.destroy();
      },
    };
  }

  function openParentCenter(origin: Origin | null) {
    managingPolicies = true;
    openParentCenterSettings(origin);
    void loadSettingsModal()
      .then((component) => (modalComponent = component))
      .catch((error) => {
        settingsModal.hide();
        managingPolicies = false;
        console.error('Page Parent Center failed to load:', error);
      });
  }

  $effect(() => {
    if (!managingPolicies || settingsModal.open) return;
    const dialog = document.querySelector<HTMLDialogElement>(`#${SETTINGS_MODAL_ID}`);
    if (!dialog) {
      managingPolicies = false;
      return;
    }
    void waitForDialogRetirement(dialog).then(() => {
      if (!settingsModal.open) managingPolicies = false;
    });
  });

  return {
    get gateComponent() {
      return gateComponent;
    },
    get modalComponent() {
      return modalComponent;
    },
    get managingPolicies() {
      return managingPolicies;
    },
    mountParentalGate,
    warmParentalGate,
    gatedLink,
    openParentCenter,
  };
}
