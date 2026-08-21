import type { Component } from 'svelte';
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
  let refreshFreeGenerationGrant = $state<(() => void) | null>(null);

  const loadParentalGate = createSingleFlight(
    async () => (await import('$lib/components/ParentalGate.svelte')).default
  );

  const loadSettingsModal = createSingleFlight(async () => {
    const [module, { hydratePersistedState }, grants] = await Promise.all([
      import('$lib/components/SettingsModal.svelte'),
      import('$lib/boot/persistedState'),
      import('$lib/state/freeGenerations.svelte'),
    ]);
    await hydratePersistedState();
    refreshFreeGenerationGrant ??= grants.createFreeGenerationGrantRefresher();
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
    if (managingPolicies && !settingsModal.open) managingPolicies = false;
  });

  $effect(() => {
    refreshFreeGenerationGrant?.();
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
