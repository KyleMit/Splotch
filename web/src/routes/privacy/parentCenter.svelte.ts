import type { Component } from 'svelte';
import { waitForDialogRetirement } from '$lib/actions/modalDialog.svelte';
import { parentalGateLink } from '$lib/actions/parentalGateLink';
import { createSingleFlight } from '$lib/singleFlight';
import type { Origin } from '$lib/state/modal.svelte';
import { openParentCenterSettings, settingsModal } from '$lib/state/ui.svelte';

// The privacy page's grown-up-gate wiring, as a factory so the page owns the
// instance (and tests could own fresh ones): the gate component mounts lazily
// — on idle, or on the first tap of a gated link — and its Manage destination
// opens Parent Center by loading the full Settings modal and persisted state
// on demand. Must be called during component init: it registers $effects.
export function createPrivacyParentCenter() {
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
      .catch((error) => console.error('Privacy parental gate failed to load:', error));
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
        console.error('Privacy Parent Center failed to load:', error);
      });
  }

  $effect(() => {
    if (!managingPolicies || settingsModal.open) return;
    const dialog = document.querySelector<HTMLDialogElement>('#settingsModal');
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
    gatedLink,
    openParentCenter,
  };
}
