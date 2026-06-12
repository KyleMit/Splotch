<script lang="ts">
  import { getContext } from 'svelte';
  import Icon from './Icon.svelte';
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
</script>

<button
  class="tab-button"
  class:active={pager.state.activeTab === id}
  onclick={() => pager.setActiveTab(id)}
>
  <Icon name={icon} class="tab-icon" />
  <span>{label}</span>
</button>
