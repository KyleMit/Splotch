<script lang="ts">
  import { getContext } from 'svelte';
  import Icon from './Icon.svelte';
  import SplotchyIcon from './SplotchyIcon.svelte';
  import type { IconName } from './icon-names';
  import { tabPagerContextKey, type TabPagerContext } from './tabPagerContext';

  interface Props {
    id: string;
    label: string;
    icon: IconName;
  }

  let { id, label, icon }: Props = $props();
  const pager = getContext<TabPagerContext>(tabPagerContextKey);

  $effect(() => {
    pager.registerTab({ id, label, icon });
  });

  // Teardown lives in its own effect so a label/icon change re-runs only the
  // registration (updating the tab in place) instead of unregistering and
  // re-appending it at the end of the tab order.
  $effect(() => {
    const registeredId = id;
    return () => pager.unregisterTab(registeredId);
  });
</script>

<button
  class="tab-button"
  class:active={pager.state.activeTab === id}
  onclick={() => pager.setActiveTab(id)}
>
  {#if icon === 'splotchy'}
    <SplotchyIcon class="tab-icon" />
  {:else}
    <Icon name={icon} class="tab-icon" />
  {/if}
  <span>{label}</span>
</button>
